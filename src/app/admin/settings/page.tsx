import type { Metadata } from "next";
import { CircleCheck, CircleX } from "lucide-react";
import { adminPage, Forbidden } from "../guard";
import { getSettings, portalLogoUrl } from "@/server/settings";
import { emailStatus } from "@/server/email";
import { apiBaseUrl, appBaseUrl, emailVerificationUrl, passwordResetUrl, secureCookiesEnabled } from "@/server/config";
import { storageDriver } from "@/server/files";
import { Badge, Card, PageHeader } from "@/components/ui";
import { AuthSettingsForm, GeneralSettingsForm, TestEmailForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

function safe(fn: () => string): string {
  try {
    return fn();
  } catch (err) {
    return `Not set (${(err as Error).message})`;
  }
}

export default async function SettingsPage() {
  const { allowed } = await adminPage("settings.manage");
  if (!allowed) return <Forbidden />;
  const settings = await getSettings();
  const email = emailStatus();
  const env = [
    { label: "Portal address (APP_BASE_URL)", value: safe(appBaseUrl) },
    { label: "API base (API_BASE_URL)", value: safe(apiBaseUrl) },
    { label: "Password reset link", value: safe(passwordResetUrl) },
    { label: "Email confirmation link", value: safe(emailVerificationUrl) },
    { label: "Secure cookies", value: secureCookiesEnabled() ? "Yes (https, __Host- cookie)" : "No (http — development only)" },
    { label: "Logo storage", value: storageDriver() === "s3" ? "Neon Object Storage bucket" : "Database" },
  ];

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Settings" description="Portal identity, sign-in rules and email delivery." />

      <GeneralSettingsForm
        portalName={settings.portal_name}
        organizationName={settings.organization_name}
        supportEmail={settings.support_email ?? ""}
        logoUrl={portalLogoUrl(settings)}
        hasCustomLogo={Boolean(settings.portal_logo_file_id)}
      />

      <AuthSettingsForm
        allowRegistration={settings.allow_registration}
        requireEmailVerification={settings.require_email_verification}
        sessionIdleHours={settings.session_idle_hours}
        rememberMeDays={settings.remember_me_days}
      />

      <Card className="p-6" id="email">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Email delivery</h2>
            <p className="mt-1 text-sm text-ink-2">
              Configured only through environment variables (never stored in the database or shown in the browser). See the README for free providers.
            </p>
          </div>
          {email.configured ? <Badge tone="green">Ready</Badge> : <Badge tone="amber">Not configured</Badge>}
        </div>
        <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-3">Provider</dt><dd className="font-medium text-ink">{email.provider}</dd></div>
          <div><dt className="text-ink-3">Sender</dt><dd className="break-all font-medium text-ink">{email.from ?? "—"}</dd></div>
        </dl>
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {email.checks.map((c) => (
            <li key={c.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2 font-mono text-[13px] text-ink">
                {c.ok ? <CircleCheck className="size-4 text-emerald-600" aria-label="OK" /> : <CircleX className="size-4 text-amber-500" aria-label="Missing" />}
                {c.label}
              </span>
              <span className="truncate text-right text-ink-2">{c.detail ?? (c.ok ? "set" : "missing")}</span>
            </li>
          ))}
        </ul>
        <TestEmailForm disabled={!email.configured} />
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-ink">Deployment</h2>
        <p className="mt-1 text-sm text-ink-2">Read from environment variables. Links in emails are built from these values.</p>
        <dl className="mt-4 divide-y divide-line rounded-xl border border-line text-sm">
          {env.map((e) => (
            <div key={e.label} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:justify-between sm:gap-4">
              <dt className="text-ink-2">{e.label}</dt>
              <dd className="break-all font-mono text-[13px] text-ink sm:text-right">{e.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </div>
  );
}
