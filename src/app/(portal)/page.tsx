import { Suspense } from "react";
import { LayoutGrid } from "lucide-react";
import { requireUser } from "@/server/session";
import { accessibleApplications } from "@/server/applications";
import { getSettings } from "@/server/settings";
import { EmptyState } from "@/components/ui";
import { Waves } from "@/components/brand";
import { NoticeToast } from "@/components/client";
import { AppLauncher, type LauncherApp } from "./app-launcher";

const NOTICES = {
  welcome: "Welcome! Your account is ready.",
  email_verified: "Your email address is confirmed.",
  password_changed: "Your password has been changed.",
};

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [apps, settings] = await Promise.all([accessibleApplications(user), getSettings()]);
  const firstName = user.name.split(/\s+/)[0] || user.name;
  const launcherApps: LauncherApp[] = apps.map((a) => ({
    id: a.id, slug: a.slug, name: a.name, description: a.description, category: a.category,
    logoUrl: a.logoUrl, icon: a.icon, accentColor: a.accentColor, openInNewTab: a.openInNewTab,
    host: a.url.startsWith("/") ? null : safeHost(a.url),
  }));

  return (
    <>
      <Suspense>
        <NoticeToast messages={NOTICES} />
      </Suspense>
      <section className="relative overflow-hidden border-b border-line bg-gradient-to-br from-brand-50 via-surface to-teal-50/60 dark:from-brand-950 dark:via-page dark:to-teal-950/30">
        <div className="relative mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-6 sm:pt-12">
          <p className="text-sm font-medium text-brand-600 dark:text-brand-300">{settings.organization_name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {apps.length === 0
              ? "You don't have any applications yet."
              : `You have access to ${apps.length} application${apps.length === 1 ? "" : "s"}.`}
          </p>
        </div>
        <Waves className="pointer-events-none absolute inset-x-0 bottom-0 h-16 w-full text-brand-300 dark:text-brand-700" />
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <h2 className="sr-only">Your applications</h2>
        {apps.length === 0 ? (
          <EmptyState icon={<LayoutGrid className="size-7" aria-hidden />} title="No applications assigned yet">
            Your administrator hasn&apos;t given you access to any application.{" "}
            {settings.support_email ? (
              <>Ask at <a href={`mailto:${settings.support_email}`} className="font-semibold text-brand-600 dark:text-brand-300">{settings.support_email}</a>.</>
            ) : (
              <>Please contact them to get access.</>
            )}
          </EmptyState>
        ) : (
          <AppLauncher apps={launcherApps} />
        )}
      </div>
    </>
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
