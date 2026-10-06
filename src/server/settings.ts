import "server-only";
import { cache } from "react";
import { z } from "zod";
import { query, withTransaction } from "./db";

export const settingsSchema = z.object({
  portal_name: z.string().trim().min(1).max(80).catch("Jaljeevika App Portal"),
  organization_name: z.string().trim().min(1).max(120).catch("Jaljeevika"),
  portal_logo_file_id: z.uuid().nullable().catch(null),
  support_email: z.email().nullable().catch(null),
  allow_registration: z.boolean().catch(false),
  require_email_verification: z.boolean().catch(true),
  session_idle_hours: z.number().int().min(1).max(168).catch(12),
  remember_me_days: z.number().int().min(1).max(90).catch(30),
});

export type PortalSettings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof PortalSettings;

const DEFAULTS: Record<SettingKey, unknown> = {
  portal_name: "Jaljeevika App Portal",
  organization_name: "Jaljeevika",
  portal_logo_file_id: null,
  support_email: null,
  allow_registration: false,
  require_email_verification: true,
  session_idle_hours: 12,
  remember_me_days: 30,
};

async function loadSettings(): Promise<PortalSettings> {
  const rows = await query<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const raw: Record<string, unknown> = { ...DEFAULTS };
  for (const row of rows) {
    if (row.key in DEFAULTS) raw[row.key] = row.value;
  }
  return settingsSchema.parse(raw);
}

/** Settings for the current request (deduplicated per render). */
export const getSettings = cache(loadSettings);

export async function updateSettings(patch: Partial<PortalSettings>, actorId: string | null): Promise<void> {
  const entries = Object.entries(patch).filter(([key]) => key in DEFAULTS);
  if (!entries.length) return;
  await withTransaction(async (client) => {
    for (const [key, value] of entries) {
      await client.query(
        `INSERT INTO settings (key, value, updated_by, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [key, JSON.stringify(value ?? null), actorId],
      );
    }
  });
}

export function portalLogoUrl(settings: PortalSettings): string {
  return settings.portal_logo_file_id ? `/api/files/${settings.portal_logo_file_id}` : "/brand/jaljeevika-logo.jpg";
}
