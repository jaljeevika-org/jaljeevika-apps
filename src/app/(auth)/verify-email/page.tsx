import type { Metadata } from "next";
import Link from "next/link";
import { MailWarning } from "lucide-react";
import { findValidVerificationToken } from "@/server/tokens";
import { buttonClass } from "@/components/ui";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Confirm email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const info = await findValidVerificationToken(token);

  if (!info) {
    return (
      <div className="text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
          <MailWarning className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">This link can&apos;t be used</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          It may have expired or already been used. Try signing in — if your email still needs confirming you can ask for a new link there.
        </p>
        <Link href="/login" className={buttonClass({ size: "lg", full: true, className: "mt-7" })}>Go to sign in</Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Confirm your email</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
        Hello {info.name}, confirm that <strong className="text-ink">{info.email}</strong> is your email address.
      </p>
      <VerifyForm token={token} />
    </div>
  );
}
