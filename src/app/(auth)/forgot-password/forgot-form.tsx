"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { forgotPasswordAction } from "../actions";
import { Alert, Field, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import type { FormState } from "@/lib/validation";

export function ForgotForm() {
  const [state, action] = useActionState<FormState, FormData>(forgotPasswordAction, {});

  if (state.ok) {
    return (
      <div className="mt-7 rounded-2xl border border-line bg-surface p-6 text-center" role="status">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
          <MailCheck className="size-6" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">Check your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          If an account exists for <strong className="text-ink">{state.values?.email}</strong>, we have sent a link to reset the password.
          The link expires soon and works once. Remember to check your spam folder.
        </p>
        <Link href="/login" className={buttonClass({ variant: "secondary", full: true, className: "mt-6" })}>Back to sign in</Link>
      </div>
    );
  }

  return (
    <form action={action} className="mt-7 space-y-5" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
        <input
          id="email" name="email" type="email" autoComplete="email" required autoFocus inputMode="email"
          defaultValue={state.values?.email ?? ""} key={state.values?.email}
          aria-invalid={Boolean(state.fieldErrors?.email) || undefined}
          aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
          className="field" placeholder="you@jaljeevika.org"
        />
      </Field>
      <SubmitButton size="lg" full pendingText="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
