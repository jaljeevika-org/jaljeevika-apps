import "server-only";
import { appBaseUrl } from "../config";
import { getSettings } from "../settings";
import { deliver, type OutgoingEmail } from "./transport";
import type { Brand } from "./templates";

export * as templates from "./templates";
export { emailStatus, isEmailConfigured } from "./transport";

export async function currentBrand(): Promise<Brand> {
  const settings = await getSettings();
  return {
    portalName: settings.portal_name,
    organizationName: settings.organization_name,
    baseUrl: appBaseUrl(),
    supportEmail: settings.support_email,
  };
}

/**
 * Sends an email and reports success instead of throwing, for flows where a
 * delivery problem must not change what the user sees (e.g. forgot password).
 * The message body (which may contain a one-time link) is never logged.
 */
export async function sendEmail(mail: OutgoingEmail, label: string): Promise<boolean> {
  try {
    await deliver(mail);
    return true;
  } catch (err) {
    console.error(`[email] ${label} failed:`, (err as Error).message);
    return false;
  }
}

export { deliver };
