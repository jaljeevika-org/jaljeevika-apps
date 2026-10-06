import type { Metadata } from "next";
import Link from "next/link";
import { ShieldX } from "lucide-react";
import { requireUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Application unavailable" };

const REASONS: Record<string, { title: string; body: string }> = {
  forbidden: { title: "You don't have access to this application", body: "Your account has not been given access to it. If you need it for your work, ask your administrator." },
  disabled: { title: "This application is switched off", body: "An administrator has temporarily disabled it. Please try again later." },
  not_found: { title: "Application not found", body: "It may have been removed or renamed. Go back to your applications to see what is available." },
};

export default async function LaunchDeniedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const reason = typeof params.reason === "string" && REASONS[params.reason] ? params.reason : "not_found";
  const appName = typeof params.app === "string" ? params.app.slice(0, 100) : null;
  const settings = await getSettings();
  const { title, body } = REASONS[reason];
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
        <ShieldX className="size-7" aria-hidden />
      </div>
      {appName ? <p className="mt-5 text-sm font-medium text-ink-3">{appName}</p> : null}
      <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{body}</p>
      {reason === "forbidden" && settings.support_email ? (
        <p className="mt-2 text-sm text-ink-2">
          Contact: <a href={`mailto:${settings.support_email}`} className="font-semibold text-brand-600 dark:text-brand-300">{settings.support_email}</a>
        </p>
      ) : null}
      <Link href="/" className={buttonClass({ size: "lg", className: "mt-8" })}>Back to my applications</Link>
    </div>
  );
}
