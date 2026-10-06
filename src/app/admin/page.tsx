import Link from "next/link";
import { AppWindow, CircleCheck, CircleDashed, Mail, MousePointerClick, UserPlus, Users } from "lucide-react";
import { adminPage, Forbidden } from "./guard";
import { userStats } from "@/server/users";
import { applicationStats } from "@/server/applications";
import { recentLogins, launchStats } from "@/server/audit-log";
import { emailStatus } from "@/server/email";
import { getSettings } from "@/server/settings";
import { appBaseUrl } from "@/server/config";
import { can } from "@/lib/permissions";
import { Badge, Card, PageHeader, StatCard, buttonClass } from "@/components/ui";
import { formatDateTime } from "@/lib/cn";

export default async function AdminOverview() {
  const { user, allowed } = await adminPage();
  if (!allowed) return <Forbidden />;
  const showAudit = can(user, "audit.view");
  const [users, apps, settings, logins, launches] = await Promise.all([
    userStats(),
    applicationStats(),
    getSettings(),
    showAudit ? recentLogins(8) : Promise.resolve([]),
    showAudit ? launchStats(30) : Promise.resolve([]),
  ]);
  const email = emailStatus();
  let baseUrl = "";
  try {
    baseUrl = appBaseUrl();
  } catch {
    baseUrl = "";
  }
  const checklist = [
    { done: email.configured, label: "Email delivery configured", href: "/admin/settings#email" },
    { done: Boolean(settings.support_email), label: "Support email set (shown on the sign-in page)", href: "/admin/settings" },
    { done: apps.active > 0, label: "At least one active application", href: "/admin/applications" },
    { done: users.total > 1, label: "First users added", href: "/admin/users/new" },
    { done: baseUrl.startsWith("https://"), label: `Portal address uses https (${baseUrl || "APP_BASE_URL not set"})` },
  ];
  const maxLaunch = Math.max(1, ...launches.map((l) => l.launches));

  return (
    <div>
      <PageHeader
        title="Admin dashboard"
        description={`Signed in as ${user.name} · ${user.role.name}`}
        actions={
          <>
            {can(user, "users.manage") ? <Link href="/admin/users/new" className={buttonClass()}><UserPlus className="size-4" aria-hidden />Add user</Link> : null}
            {can(user, "applications.manage") ? <Link href="/admin/applications/new" className={buttonClass({ variant: "secondary" })}><AppWindow className="size-4" aria-hidden />Add application</Link> : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Users" value={users.total} hint={`${users.active} active · ${users.disabled} disabled`} icon={<Users className="size-5" aria-hidden />} />
        <StatCard label="Admins" value={users.admins} hint="Users with a role above User" icon={<UserPlus className="size-5" aria-hidden />} />
        <StatCard label="Applications" value={apps.total} hint={`${apps.active} active`} icon={<AppWindow className="size-5" aria-hidden />} />
        <StatCard
          label="Email"
          value={email.configured ? <span className="text-emerald-600 dark:text-emerald-400">Ready</span> : <span className="text-amber-600 dark:text-amber-400">Off</span>}
          hint={email.configured ? `${email.provider.toUpperCase()} · ${email.from ?? ""}` : "Password reset emails cannot be sent"}
          icon={<Mail className="size-5" aria-hidden />}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="p-6 xl:col-span-2">
          <h2 className="text-base font-semibold text-ink">Setup checklist</h2>
          <ul className="mt-4 space-y-3">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-start gap-3 text-sm">
                {item.done ? <CircleCheck className="mt-0.5 size-4.5 shrink-0 text-emerald-600" aria-label="Done" /> : <CircleDashed className="mt-0.5 size-4.5 shrink-0 text-amber-500" aria-label="To do" />}
                {item.href && !item.done ? (
                  <Link href={item.href} className="text-ink hover:text-brand-600 hover:underline">{item.label}</Link>
                ) : (
                  <span className={item.done ? "text-ink-2" : "text-ink"}>{item.label}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {showAudit ? (
          <Card className="p-6 xl:col-span-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Most opened (30 days)</h2>
              <MousePointerClick className="size-4 text-ink-3" aria-hidden />
            </div>
            {launches.length === 0 ? (
              <p className="mt-4 text-sm text-ink-2">No applications opened yet.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {launches.map((l) => (
                  <li key={l.name} className="text-sm">
                    <div className="flex justify-between gap-2"><span className="truncate text-ink">{l.name}</span><span className="tabular-nums text-ink-2">{l.launches}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-surface-2">
                      <div className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-water-500" style={{ width: `${(l.launches / maxLaunch) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </div>

      {showAudit ? (
        <Card className="mt-6 overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5">
            <h2 className="text-base font-semibold text-ink">Recent sign-ins</h2>
            <Link href="/admin/audit?action=auth." className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">View audit log</Link>
          </div>
          {logins.length === 0 ? (
            <p className="px-6 py-5 text-sm text-ink-2">No sign-ins recorded yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {logins.map((l, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{l.name ?? l.email ?? "Unknown"}</p>
                    <p className="truncate text-xs text-ink-3">{l.email}{l.ip ? ` · ${l.ip}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {l.action === "auth.login" ? <Badge tone="green">Signed in</Badge> : <Badge tone="red">Failed</Badge>}
                    <span className="text-xs text-ink-3">{formatDateTime(l.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  );
}
