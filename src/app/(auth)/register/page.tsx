import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock } from "lucide-react";
import { getSessionUser } from "@/server/session";
import { getSettings } from "@/server/settings";
import { buttonClass } from "@/components/ui";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/");
  const settings = await getSettings();

  if (!settings.allow_registration) {
    return (
      <div className="text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Lock className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Accounts are created by your administrator</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {settings.support_email ? (
            <>Ask for access at <a className="font-semibold text-brand-600 dark:text-brand-300" href={`mailto:${settings.support_email}`}>{settings.support_email}</a>.</>
          ) : (
            <>Please contact your {settings.organization_name} administrator to get an account.</>
          )}
        </p>
        <Link href="/login" className={buttonClass({ size: "lg", full: true, className: "mt-7" })}>Back to sign in</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Create your account</h1>
      <p className="mt-1.5 text-[15px] text-ink-2">Join {settings.portal_name}.</p>
      <RegisterForm requiresVerification={settings.require_email_verification} />
    </div>
  );
}
