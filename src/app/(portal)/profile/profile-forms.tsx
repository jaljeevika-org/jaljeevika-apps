"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { signOutOtherDevicesAction, updateProfileAction } from "../actions";
import { Field } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import type { FormState } from "@/lib/validation";

export function ProfileForm({ name }: { name: string }) {
  const [state, action] = useActionState<FormState, FormData>(updateProfileAction, {});
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field label="Display name" htmlFor="name" error={state.fieldErrors?.name} className="flex-1">
        <input id="name" name="name" defaultValue={name} required maxLength={120} autoComplete="name" className="field" aria-invalid={Boolean(state.fieldErrors?.name) || undefined} />
      </Field>
      <SubmitButton variant="secondary" pendingText="Saving…" className={state.fieldErrors?.name ? "sm:mb-6" : undefined}>Save</SubmitButton>
    </form>
  );
}

export function SignOutOthersForm() {
  const [state, action] = useActionState<FormState>(signOutOtherDevicesAction, {});
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);
  return (
    <form action={action}>
      <SubmitButton variant="secondary" size="sm" pendingText="Signing out…">Sign out other devices</SubmitButton>
    </form>
  );
}
