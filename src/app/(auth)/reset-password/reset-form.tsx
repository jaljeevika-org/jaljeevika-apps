"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "../actions";
import { Alert, Field } from "@/components/ui";
import { PasswordInput, SubmitButton } from "@/components/client";
import type { FormState } from "@/lib/validation";
import { PASSWORD_MIN } from "@/lib/password-policy";

export function ResetForm({ token, email, submitLabel }: { token: string; email: string; submitLabel: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="mt-7 space-y-5" noValidate>
      {state.error ? (
        <Alert tone="error">
          {state.error} <Link href="/forgot-password" className="font-semibold underline">Request a new link</Link>
        </Alert>
      ) : null}
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field label="New password" htmlFor="password" error={state.fieldErrors?.password} hint={`At least ${PASSWORD_MIN} characters. A short sentence is easy to remember and hard to guess.`}>
        <PasswordInput id="password" name="password" autoComplete="new-password" showStrength invalid={Boolean(state.fieldErrors?.password)} describedBy={state.fieldErrors?.password ? "password-error" : "password-hint"} />
      </Field>
      <Field label="Repeat new password" htmlFor="confirm" error={state.fieldErrors?.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={Boolean(state.fieldErrors?.confirm)} describedBy={state.fieldErrors?.confirm ? "confirm-error" : undefined} />
      </Field>
      <SubmitButton size="lg" full pendingText="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
