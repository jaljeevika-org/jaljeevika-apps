"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/server/session";
import { toFormState } from "@/server/errors";
import { getSettings, updateSettings } from "@/server/settings";
import { deleteFile, storeImage } from "@/server/files";
import { audit } from "@/server/audit";
import { hit, LIMITS, minutesText } from "@/server/rate-limit";
import { currentBrand, deliver, isEmailConfigured, templates } from "@/server/email";
import { checkbox, fieldErrors, type FormState } from "@/lib/validation";

const generalSchema = z.object({
  portal_name: z.string().trim().min(1, "Enter the portal name.").max(80, "Use at most 80 characters."),
  organization_name: z.string().trim().min(1, "Enter the organisation name.").max(120, "Use at most 120 characters."),
  support_email: z.union([z.literal(""), z.email({ error: "Enter a valid email address." })]),
  logoAction: z.enum(["keep", "replace", "remove"]).default("keep"),
});

export async function saveGeneralSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("settings.manage");
    const parsed = generalSchema.safeParse({
      portal_name: formData.get("portal_name"),
      organization_name: formData.get("organization_name"),
      support_email: String(formData.get("support_email") ?? "").trim().toLowerCase(),
      logoAction: formData.get("logoAction") ?? "keep",
    });
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
    const d = parsed.data;
    const current = await getSettings();
    let logoId = current.portal_logo_file_id;
    if (d.logoAction === "replace") {
      const file = formData.get("logo");
      if (file instanceof File && file.size > 0) logoId = await storeImage(file, "portal_logo", actor.id);
    } else if (d.logoAction === "remove") {
      logoId = null;
    }
    await updateSettings(
      { portal_name: d.portal_name, organization_name: d.organization_name, support_email: d.support_email || null, portal_logo_file_id: logoId },
      actor.id,
    );
    if (logoId !== current.portal_logo_file_id && current.portal_logo_file_id) await deleteFile(current.portal_logo_file_id);
    await audit({ actorId: actor.id, action: "settings.updated", metadata: { section: "general", portalName: d.portal_name, logo: d.logoAction } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  } catch (err) {
    return toFormState(err);
  }
}

const authSchema = z.object({
  allow_registration: checkbox,
  require_email_verification: checkbox,
  session_idle_hours: z.coerce.number({ error: "Enter a number of hours." }).int().min(1, "At least 1 hour.").max(168, "At most 168 hours (7 days)."),
  remember_me_days: z.coerce.number({ error: "Enter a number of days." }).int().min(1, "At least 1 day.").max(90, "At most 90 days."),
});

export async function saveAuthSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("settings.manage");
    const parsed = authSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
    const d = parsed.data;
    if (d.allow_registration && d.require_email_verification && !isEmailConfigured()) {
      return { error: "Open registration with email confirmation needs email to be configured first." };
    }
    await updateSettings(d, actor.id);
    await audit({ actorId: actor.id, action: "settings.updated", metadata: { section: "authentication", ...d } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Authentication settings saved." };
  } catch (err) {
    return toFormState(err);
  }
}

/** Sends a test message to the signed-in admin's own address (never to arbitrary addresses). */
export async function sendTestEmailAction(_prev: FormState): Promise<FormState> {
  try {
    const actor = await requireActionUser("settings.manage");
    const limit = await hit(`testmail:user:${actor.id}`, LIMITS.testEmailPerUser.limit, LIMITS.testEmailPerUser.window);
    if (!limit.allowed) return { error: `Too many test emails. Please wait ${minutesText(limit.retryAfterSeconds)}.` };
    if (!isEmailConfigured()) return { error: "Email is not configured. Set the EMAIL_* environment variables and redeploy." };
    const brand = await currentBrand();
    await deliver(templates.testEmail(brand, actor.email));
    await audit({ actorId: actor.id, action: "settings.test_email_sent", metadata: { to: actor.email } });
    return { ok: true, message: `Test email sent to ${actor.email}.` };
  } catch (err) {
    if (err instanceof Error && !("digest" in err) && err.name !== "AuthError") {
      console.error("[email] test failed:", err.message);
      return { error: `Sending failed: ${err.message.slice(0, 200)}` };
    }
    return toFormState(err);
  }
}
