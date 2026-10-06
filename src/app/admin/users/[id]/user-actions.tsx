"use client";

import { useActionState, useEffect, useId } from "react";
import { toast } from "sonner";
import { KeyRound, LogOut, Mail, Power, Trash } from "lucide-react";
import { deleteUserAction, revokeSessionsAction, sendPasswordLinkAction, setPasswordAction, setUserActiveAction } from "../actions";
import { ActionForm } from "@/components/action-form";
import { Card, Field } from "@/components/ui";
import { ConfirmSubmit, PasswordInput, SubmitButton } from "@/components/client";
import type { FormState } from "@/lib/validation";
import { PASSWORD_MIN } from "@/lib/password-policy";

export function UserAccountActions({
  id, name, isActive, isSelf, hasPassword, emailConfigured,
}: { id: string; name: string; isActive: boolean; isSelf: boolean; hasPassword: boolean; emailConfigured: boolean }) {
  const deleteFormId = useId();
  const disableFormId = useId();
  return (
    <div className="mt-6 space-y-6">
      <Card className="divide-y divide-line">
        <Row
          icon={<Mail className="size-4" aria-hidden />}
          title={hasPassword ? "Send password reset link" : "Resend invitation"}
          body={emailConfigured ? "Emails a one-time link so they can choose a new password." : "Email is not configured, so links cannot be sent."}
        >
          <ActionForm action={sendPasswordLinkAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="secondary" size="sm" pendingText="Sending…" disabled={!emailConfigured || !isActive}>Send link</SubmitButton>
          </ActionForm>
        </Row>
        {!isSelf ? <SetPassword id={id} /> : null}
        <Row icon={<LogOut className="size-4" aria-hidden />} title="Sign out everywhere" body={isSelf ? "Ends your sessions on other devices." : "Ends all of this user's sessions immediately."}>
          <ActionForm action={revokeSessionsAction}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="secondary" size="sm" pendingText="Signing out…">Sign out</SubmitButton>
          </ActionForm>
        </Row>
      </Card>

      {!isSelf ? (
        <Card className="divide-y divide-line border-rose-200 dark:border-rose-500/30">
          <Row
            icon={<Power className="size-4" aria-hidden />}
            title={isActive ? "Disable account" : "Enable account"}
            body={isActive ? "They are signed out at once and can no longer sign in. Nothing is deleted." : "Allow this user to sign in again."}
          >
            <ActionForm action={setUserActiveAction} id={disableFormId}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="active" value={isActive ? "false" : "true"} />
              {isActive ? (
                <ConfirmSubmit formId={disableFormId} label="Disable" title={`Disable ${name}?`} body="They will be signed out of every device and cannot sign in until you enable the account again." confirmLabel="Disable account" />
              ) : (
                <SubmitButton variant="soft" size="sm" pendingText="Enabling…">Enable</SubmitButton>
              )}
            </ActionForm>
          </Row>
          <Row icon={<Trash className="size-4" aria-hidden />} title="Delete user" body="Permanently removes the account and its application access. The audit log keeps a record.">
            <ActionForm action={deleteUserAction} id={deleteFormId}>
              <input type="hidden" name="id" value={id} />
              <ConfirmSubmit formId={deleteFormId} label="Delete" title={`Delete ${name}?`} body="This cannot be undone. Consider disabling the account instead if you may need it again." confirmLabel="Delete permanently" />
            </ActionForm>
          </Row>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ icon, title, body, children }: { icon: React.ReactNode; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-sm text-ink-2">{body}</p>
        </div>
      </div>
      <div className="shrink-0 sm:pl-4">{children}</div>
    </div>
  );
}

function SetPassword({ id }: { id: string }) {
  const [state, action] = useActionState<FormState, FormData>(setPasswordAction, {});
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok && state.message) toast.success(state.message);
  }, [state]);
  return (
    <details className="group p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="flex gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-2"><KeyRound className="size-4" aria-hidden /></span>
          <span>
            <span className="block text-sm font-semibold text-ink">Set a new password</span>
            <span className="block text-sm text-ink-2">For people who cannot receive email. Share it privately.</span>
          </span>
        </span>
        <span className="text-sm font-medium text-brand-600 group-open:hidden dark:text-brand-300">Set…</span>
      </summary>
      <form action={action} className="mt-4 space-y-4 sm:pl-11" noValidate>
        <input type="hidden" name="id" value={id} />
        <Field label="New password" htmlFor={`pw-${id}`} error={state.fieldErrors?.password} hint={`At least ${PASSWORD_MIN} characters.`}>
          <PasswordInput id={`pw-${id}`} name="password" autoComplete="new-password" showStrength invalid={Boolean(state.fieldErrors?.password)} />
        </Field>
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input type="checkbox" name="mustChangePassword" defaultChecked className="size-4 accent-brand-600" />
          Ask them to choose their own password at next sign-in
        </label>
        <SubmitButton size="sm" pendingText="Saving…">Set password</SubmitButton>
      </form>
    </details>
  );
}
