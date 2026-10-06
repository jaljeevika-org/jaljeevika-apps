"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { registerAction } from "../actions";
import { Alert, Field, buttonClass } from "@/components/ui";
import { PasswordInput, SubmitButton } from "@/components/client";
import type { FormState } from "@/lib/validation";
import { PASSWORD_MIN } from "@/lib/password-policy";

export function RegisterForm({ requiresVerification }: { requiresVerification: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(registerAction, {});

  if (state.ok && state.message === "verify") {
    return (
      <div className="mt-7 rounded-2xl border border-line bg-surface p-6 text-center" role="status">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
          <MailCheck className="size-6" aria-hidden />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">Confirm your email</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          We sent a confirmation link to <strong className="text-ink">{state.values?.email}</strong>. Open it to activate your account, then sign in.
        </p>
        <Link href="/login" className={buttonClass({ variant: "secondary", full: true, className: "mt-6" })}>Go to sign in</Link>
      </div>
    );
  }

  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="mt-7 space-y-5" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Full name" htmlFor="name" error={fe.name}>
        <input id="name" name="name" autoComplete="name" required maxLength={120} defaultValue={state.values?.name ?? ""} key={`n-${state.values?.name}`} aria-invalid={Boolean(fe.name) || undefined} className="field" />
      </Field>
      <Field label="Email" htmlFor="email" error={fe.email}>
        <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email ?? ""} key={`e-${state.values?.email}`} aria-invalid={Boolean(fe.email) || undefined} className="field" />
      </Field>
      <Field label="Password" htmlFor="password" error={fe.password} hint={`At least ${PASSWORD_MIN} characters.`}>
        <PasswordInput id="password" name="password" autoComplete="new-password" showStrength invalid={Boolean(fe.password)} />
      </Field>
      <Field label="Repeat password" htmlFor="confirm" error={fe.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={Boolean(fe.confirm)} />
      </Field>
      <SubmitButton size="lg" full pendingText="Creating account…">Create account</SubmitButton>
      {requiresVerification ? <p className="text-center text-xs text-ink-3">We&apos;ll email you a link to confirm your address.</p> : null}
      <p className="text-center text-sm text-ink-2">
        Already have an account? <Link href="/login" className="font-semibold text-brand-600 dark:text-brand-300">Sign in</Link>
      </p>
    </form>
  );
}
