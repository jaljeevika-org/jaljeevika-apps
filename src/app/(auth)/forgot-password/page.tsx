import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div>
      <Link href="/login" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Back to sign in
      </Link>
      <h1 className="text-[28px] font-bold tracking-tight text-ink">Forgot your password?</h1>
      <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
        Enter the email address you use to sign in. We&apos;ll email you a link to choose a new password.
      </p>
      <ForgotForm />
    </div>
  );
}
