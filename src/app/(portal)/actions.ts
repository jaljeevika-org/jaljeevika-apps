"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPool, queryOne, withTransaction } from "@/server/db";
import { hashPassword, verifyPassword } from "@/server/crypto";
import { getSessionUser, revokeUserSessions } from "@/server/session";
import { audit } from "@/server/audit";
import { hit, LIMITS, minutesText } from "@/server/rate-limit";
import { currentBrand, sendEmail, templates } from "@/server/email";
import { fieldErrors, nameSchema, type FormState } from "@/lib/validation";
import { passwordProblems } from "@/lib/password-policy";

const changeSchema = z
  .object({
    current: z.string().min(1, "Enter your current password.").max(256),
    password: z.string().min(1, "Enter a new password.").max(256),
    confirm: z.string().min(1, "Repeat the new password."),
  })
  .refine((d) => d.password === d.confirm, { message: "The passwords do not match.", path: ["confirm"] })
  .refine((d) => d.password !== d.current, { message: "Choose a password different from the current one.", path: ["password"] });

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  // Users with a temporary password are allowed here (that is the point of this page).
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const parsed = changeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { current, password } = parsed.data;

  const limit = await hit(`pwchange:user:${user.id}`, LIMITS.passwordChangePerUser.limit, LIMITS.passwordChangePerUser.window);
  if (!limit.allowed) return { error: `Too many attempts. Please wait ${minutesText(limit.retryAfterSeconds)}.` };

  const row = await queryOne<{ password_hash: string | null }>("SELECT password_hash FROM users WHERE id = $1", [user.id]);
  if (!(await verifyPassword(row?.password_hash, current))) {
    await audit({ actorId: user.id, action: "auth.password_change_failed", targetType: "user", targetId: user.id });
    return { fieldErrors: { current: "Your current password is not correct." } };
  }
  const problems = passwordProblems(password, { email: user.email, name: user.name });
  if (problems.length) return { fieldErrors: { password: problems[0] } };

  const passwordHash = await hashPassword(password);
  const wasForced = user.mustChangePassword;
  await withTransaction(async (client) => {
    await client.query(
      "UPDATE users SET password_hash = $2, password_changed_at = now(), must_change_password = false WHERE id = $1",
      [user.id, passwordHash],
    );
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
    // Keep this device signed in; sign out every other one.
    await revokeUserSessions(user.id, user.sessionId, client);
    await audit({ actorId: user.id, action: "auth.password_changed", targetType: "user", targetId: user.id, metadata: { forced: wasForced } }, client);
  });
  after(async () => {
    const brand = await currentBrand();
    await sendEmail(templates.passwordChangedEmail(brand, user.email, user.name), "password changed notice");
  });
  redirect("/?notice=password_changed");
}

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const parsed = z.object({ name: nameSchema }).safeParse({ name: formData.get("name") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  await getPool().query("UPDATE users SET name = $2 WHERE id = $1", [user.id, parsed.data.name]);
  await audit({ actorId: user.id, action: "user.profile_updated", targetType: "user", targetId: user.id });
  revalidatePath("/", "layout");
  return { ok: true, message: "Your profile has been saved." };
}

export async function signOutOtherDevicesAction(_prev: FormState): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const n = await revokeUserSessions(user.id, user.sessionId);
  await audit({ actorId: user.id, action: "auth.other_sessions_revoked", targetType: "user", targetId: user.id, metadata: { sessions: n } });
  revalidatePath("/profile");
  return { ok: true, message: n ? `Signed out of ${n} other session${n === 1 ? "" : "s"}.` : "No other active sessions." };
}
