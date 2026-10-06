import type { Metadata } from "next";
import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { findValidPasswordToken } from "@/server/tokens";
import { buttonClass } from "@/components/ui";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  // Showing the page never uses the link up (email scanners may open it); only submitting the form does.
  const info = await findValidPasswordToken(token);

  if (!info) {
    return (
      <div className="text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
          <LinkIcon className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">This link can&apos;t be used</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          It may have expired, already been used, or been replaced by a newer link. Request a new one and use the most recent email.
        </p>
        <div className="mt-7 flex flex-col gap-2">
          <Link href="/forgot-password" className={buttonClass({ size: "lg", full: true })}>Request a new link</Link>
          <Link href="/login" className={buttonClass({ variant: "ghost", full: true })}>Back to sign in</Link>
        </div>
      </div>
    );
  }

  const invite = info.purpose === "invite";
  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">{invite ? "Set your password" : "Choose a new password"}</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
        {invite ? "Welcome, " : "For "}
        <strong className="text-ink">{invite ? info.name : info.email}</strong>
        {invite ? `. Choose a password for ${info.email}.` : ". After saving you'll be signed out everywhere and can sign in with the new password."}
      </p>
      <ResetForm token={token} email={info.email} submitLabel={invite ? "Set password" : "Save new password"} />
    </div>
  );
}
