"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPool, pgErrorCode, queryOne, withTransaction } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/crypto";
import { createSession, destroyCurrentSession, getSessionUser, revokeUserSessions } from "@/server/session";
import { clear, hit, LIMITS, minutesText, release } from "@/server/rate-limit";
import { audit } from "@/server/audit";
import { requestMeta } from "@/server/request";
import { getSettings } from "@/server/settings";
import { findUserByEmail, grantAutoApps } from "@/server/users";
import {
  consumePasswordToken, consumeVerificationToken, findValidPasswordToken, issueEmailVerificationToken, issuePasswordToken,
} from "@/server/tokens";
import { currentBrand, isEmailConfigured, sendEmail, templates } from "@/server/email";
import { getRoleByKey } from "@/server/roles";
import { checkbox, emailSchema, fieldErrors, formValues, nameSchema, type FormState } from "@/lib/validation";
import { passwordProblems } from "@/lib/password-policy";
import { postLoginPath } from "@/lib/safe-redirect";
import { DEFAULT_USER_ROLE } from "@/lib/permissions";

export type LoginState = FormState & { needsVerification?: boolean; email?: string };

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(256),
  remember: checkbox,
  next: z.string().optional(),
});

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const values = formValues(formData, ["email"]);
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { email, password, remember, next } = parsed.data;
  const { ip } = await requestMeta();

  // Count the attempt before checking the password (atomic, so parallel
  // guesses cannot slip past the limit); a successful sign-in gives it back.
  const ipKey = `login:ip:${ip ?? "unknown"}`;
  const emailKey = `login:email:${email}`;
  const ipLimit = await hit(ipKey, LIMITS.loginFailuresPerIp.limit, LIMITS.loginFailuresPerIp.window);
  const emailLimit = await hit(emailKey, LIMITS.loginFailuresPerEmail.limit, LIMITS.loginFailuresPerEmail.window);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    const wait = Math.max(ipLimit.allowed ? 0 : ipLimit.retryAfterSeconds, emailLimit.allowed ? 0 : emailLimit.retryAfterSeconds);
    await audit({ actorId: null, action: "auth.login_rate_limited", metadata: { email } });
    return { error: `Too many sign-in attempts. Please wait ${minutesText(wait)} and try again.`, values };
  }

  const user = await findUserByEmail(email);
  const passwordOk = await verifyPassword(user?.password_hash, password);
  if (!user || !passwordOk) {
    await audit({ actorId: user?.id ?? null, action: "auth.login_failed", targetType: "user", targetId: user?.id, metadata: { email, reason: user ? "bad_password" : "unknown_email" } });
    return { error: "Incorrect email or password.", values };
  }
  // The checks below run only after a correct password, so they reveal nothing to a guesser.
  if (!user.is_active) {
    await audit({ actorId: user.id, action: "auth.login_failed", targetType: "user", targetId: user.id, metadata: { email, reason: "disabled" } });
    return { error: "This account has been disabled. Please contact your administrator.", values };
  }
  const settings = await getSettings();
  if (settings.require_email_verification && !user.email_verified) {
    await audit({ actorId: user.id, action: "auth.login_failed", targetType: "user", targetId: user.id, metadata: { email, reason: "unverified" } });
    return {
      error: "Please confirm your email address before signing in.",
      needsVerification: true,
      email,
      values,
    };
  }

  await clear(emailKey);
  await release(ipKey);
  await createSession(user.id, remember);
  await getPool().query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  await audit({ actorId: user.id, action: "auth.login", targetType: "user", targetId: user.id, metadata: { email, remember } });
  redirect(user.must_change_password ? "/change-password" : postLoginPath(next));
}

export async function logoutAction(): Promise<void> {
  const user = await destroyCurrentSession();
  if (user) await audit({ actorId: user.id, action: "auth.logout", targetType: "user", targetId: user.id });
  redirect("/login?notice=signed_out");
}

const forgotSchema = z.object({ email: emailSchema });

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["email"]);
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { email } = parsed.data;
  const { ip } = await requestMeta();

  const ipLimit = await hit(`reset:ip:${ip ?? "unknown"}`, LIMITS.resetRequestPerIp.limit, LIMITS.resetRequestPerIp.window);
  if (!ipLimit.allowed) {
    return { error: `Too many requests from your network. Please wait ${minutesText(ipLimit.retryAfterSeconds)} and try again.`, values };
  }

  // Everything that depends on whether the account exists happens after the
  // response is sent, so the reply and its timing are identical either way.
  after(async () => {
    try {
      const emailLimit = await hit(`reset:email:${email}`, LIMITS.resetRequestPerEmail.limit, LIMITS.resetRequestPerEmail.window);
      const user = await findUserByEmail(email);
      if (!user || !user.is_active) {
        await audit({ actorId: null, action: "auth.password_reset_requested", metadata: { email, outcome: user ? "disabled" : "unknown_email" } });
        return;
      }
      if (!emailLimit.allowed) {
        await audit({ actorId: user.id, action: "auth.password_reset_requested", targetType: "user", targetId: user.id, metadata: { email, outcome: "rate_limited" } });
        return;
      }
      if (!isEmailConfigured()) {
        console.warn("[auth] password reset requested but email is not configured");
        await audit({ actorId: user.id, action: "auth.password_reset_requested", targetType: "user", targetId: user.id, metadata: { email, outcome: "email_not_configured" } });
        return;
      }
      const purpose = user.password_hash ? "reset" : "invite";
      const link = await issuePasswordToken(user.id, purpose, ip);
      const brand = await currentBrand();
      const sent = await sendEmail(
        purpose === "reset"
          ? templates.passwordResetEmail(brand, user.email, user.name, link.url, link.minutes)
          : templates.inviteEmail(brand, user.email, user.name, link.url, Math.round(link.minutes / 60), brand.organizationName),
        "password reset",
      );
      await audit({ actorId: user.id, action: "auth.password_reset_requested", targetType: "user", targetId: user.id, metadata: { email, outcome: sent ? "sent" : "send_failed" } });
    } catch (err) {
      console.error("[auth] forgot-password background task failed:", (err as Error).message);
    }
  });

  return { ok: true, values };
}

const resetSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(1, "Enter a new password.").max(256),
    confirm: z.string().min(1, "Repeat the new password."),
  })
  .refine((d) => d.password === d.confirm, { message: "The passwords do not match.", path: ["confirm"] });

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { token, password } = parsed.data;
  const { ip } = await requestMeta();
  const limit = await hit(`token:ip:${ip ?? "unknown"}`, LIMITS.tokenSubmitPerIp.limit, LIMITS.tokenSubmitPerIp.window);
  if (!limit.allowed) return { error: `Too many attempts. Please wait ${minutesText(limit.retryAfterSeconds)}.` };

  // Validate the password before using up the link, so a weak password does not burn it.
  const info = await findValidPasswordToken(token);
  if (!info) return { error: "This link is invalid, has expired or has already been used. Request a new one." };
  const problems = passwordProblems(password, { email: info.email, name: info.name });
  if (problems.length) return { fieldErrors: { password: problems[0] } };

  const passwordHash = await hashPassword(password);
  const result = await withTransaction(async (client) => {
    const used = await consumePasswordToken(token, client);
    if (!used) return null;
    const user = await queryOne<{ email: string; name: string }>(
      `UPDATE users SET password_hash = $2, password_changed_at = now(), must_change_password = false,
         email_verified = true, email_verified_at = COALESCE(email_verified_at, now())
       WHERE id = $1 RETURNING email, name`,
      [used.userId, passwordHash],
      client,
    );
    // Other outstanding links stop working, and every signed-in device is signed out.
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [used.userId]);
    await revokeUserSessions(used.userId, undefined, client);
    await audit({ actorId: used.userId, action: used.purpose === "invite" ? "auth.invite_accepted" : "auth.password_reset", targetType: "user", targetId: used.userId }, client);
    return { ...used, user };
  });
  if (!result) return { error: "This link is invalid, has expired or has already been used. Request a new one." };

  if (result.purpose === "reset" && result.user) {
    const { email, name } = result.user;
    after(async () => {
      const brand = await currentBrand();
      await sendEmail(templates.passwordChangedEmail(brand, email, name), "password changed notice");
    });
  }
  redirect(result.purpose === "invite" ? "/login?notice=password_set" : "/login?notice=password_reset");
}

const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: z.string().min(1, "Choose a password.").max(256),
    confirm: z.string().min(1, "Repeat the password."),
  })
  .refine((d) => d.password === d.confirm, { message: "The passwords do not match.", path: ["confirm"] });

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["name", "email"]);
  const settings = await getSettings();
  if (!settings.allow_registration) return { error: "Registration is closed. Please contact your administrator.", values };

  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { name, email, password } = parsed.data;
  const problems = passwordProblems(password, { email, name });
  if (problems.length) return { fieldErrors: { password: problems[0] }, values };

  const { ip } = await requestMeta();
  const limit = await hit(`register:ip:${ip ?? "unknown"}`, LIMITS.registerPerIp.limit, LIMITS.registerPerIp.window);
  if (!limit.allowed) return { error: `Too many sign-ups from your network. Please wait ${minutesText(limit.retryAfterSeconds)}.`, values };

  const verify = settings.require_email_verification;
  if (verify && !isEmailConfigured()) {
    return { error: "Sign-up is temporarily unavailable because email is not set up. Please contact your administrator.", values };
  }

  const existing = await findUserByEmail(email);
  if (existing) {
    if (verify) {
      // Same answer as a fresh sign-up, so the form does not reveal who has an account.
      after(async () => {
        const brand = await currentBrand();
        await sendEmail(templates.existingAccountEmail(brand, existing.email, existing.name), "existing account notice");
      });
      return { ok: true, message: "verify", values };
    }
    return { fieldErrors: { email: "An account with this email already exists. Sign in or reset your password." }, values };
  }

  const role = await getRoleByKey(DEFAULT_USER_ROLE);
  if (!role) throw new Error("Default user role is missing.");
  const passwordHash = await hashPassword(password);
  let created: { id: string; verifyUrl?: string; hours?: number };
  try {
    created = await withTransaction(async (client) => {
      const row = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, role_id, email_verified, email_verified_at, password_changed_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN now() END, now()) RETURNING id`,
        [name, email, passwordHash, role.id, !verify],
      );
      const id = row.rows[0].id;
      await grantAutoApps(id, null, client);
      await audit({ actorId: id, action: "user.registered", targetType: "user", targetId: id, metadata: { email } }, client);
      if (!verify) return { id };
      const token = await issueEmailVerificationToken(id, email, client);
      return { id, verifyUrl: token.url, hours: token.hours };
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") return { ok: true, message: verify ? "verify" : undefined, values };
    throw err;
  }

  if (verify && created.verifyUrl) {
    const brand = await currentBrand();
    await sendEmail(templates.verifyEmail(brand, email, name, created.verifyUrl, created.hours ?? 24), "verification");
    return { ok: true, message: "verify", values };
  }
  await createSession(created.id, false);
  redirect("/?notice=welcome");
}

export async function resendVerificationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter a valid email address." };
  const { email } = parsed.data;
  const { ip } = await requestMeta();
  const ipLimit = await hit(`verify:ip:${ip ?? "unknown"}`, LIMITS.verificationResendPerIp.limit, LIMITS.verificationResendPerIp.window);
  if (!ipLimit.allowed) return { error: `Too many requests. Please wait ${minutesText(ipLimit.retryAfterSeconds)}.` };
  after(async () => {
    try {
      const limit = await hit(`verify:email:${email}`, LIMITS.verificationResendPerEmail.limit, LIMITS.verificationResendPerEmail.window);
      const user = await findUserByEmail(email);
      if (!limit.allowed || !user || !user.is_active || user.email_verified || !isEmailConfigured()) return;
      const token = await issueEmailVerificationToken(user.id, user.email);
      const brand = await currentBrand();
      await sendEmail(templates.verifyEmail(brand, user.email, user.name, token.url, token.hours), "verification resend");
    } catch (err) {
      console.error("[auth] resend verification failed:", (err as Error).message);
    }
  });
  return { ok: true, message: "If the account needs confirming, a new link is on its way." };
}

export async function verifyEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const { ip } = await requestMeta();
  const limit = await hit(`token:ip:${ip ?? "unknown"}`, LIMITS.tokenSubmitPerIp.limit, LIMITS.tokenSubmitPerIp.window);
  if (!limit.allowed) return { error: `Too many attempts. Please wait ${minutesText(limit.retryAfterSeconds)}.` };
  const result = await consumeVerificationToken(token);
  if (!result) return { error: "This link is invalid, has expired or has already been used." };
  await audit({ actorId: result.userId, action: "auth.email_verified", targetType: "user", targetId: result.userId, metadata: { email: result.email } });
  const current = await getSessionUser();
  redirect(current ? "/?notice=email_verified" : "/login?notice=email_verified");
}
