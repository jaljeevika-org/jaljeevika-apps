"use client";

import { useActionState } from "react";
import { changePasswordAction } from "../actions";
import { Alert, Field } from "@/components/ui";
import { PasswordInput, SubmitButton } from "@/components/client";
import type { FormState } from "@/lib/validation";
import { PASSWORD_MIN } from "@/lib/password-policy";

export function ChangePasswordForm({ email, currentLabel }: { email: string; currentLabel: string }) {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field label={currentLabel} htmlFor="current" error={fe.current}>
        <PasswordInput id="current" name="current" autoComplete="current-password" invalid={Boolean(fe.current)} />
      </Field>
      <Field label="New password" htmlFor="password" error={fe.password} hint={`At least ${PASSWORD_MIN} characters.`}>
        <PasswordInput id="password" name="password" autoComplete="new-password" showStrength invalid={Boolean(fe.password)} />
      </Field>
      <Field label="Repeat new password" htmlFor="confirm" error={fe.confirm}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" invalid={Boolean(fe.confirm)} />
      </Field>
      <SubmitButton full size="lg" pendingText="Saving…">Save new password</SubmitButton>
    </form>
  );
}
