"use client";

import { useActionState } from "react";
import { verifyEmailAction } from "../actions";
import { Alert } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import type { FormState } from "@/lib/validation";

export function VerifyForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(verifyEmailAction, {});
  return (
    <form action={action} className="mt-7 space-y-5">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton size="lg" full pendingText="Confirming…">Confirm email address</SubmitButton>
    </form>
  );
}
