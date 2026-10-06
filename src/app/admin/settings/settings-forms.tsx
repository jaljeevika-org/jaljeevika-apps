"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageUp, Send } from "lucide-react";
import { saveAuthSettingsAction, saveGeneralSettingsAction, sendTestEmailAction } from "./actions";
import { Alert, Card, Field, buttonClass } from "@/components/ui";
import { SubmitButton, useKeepValuesSubmit } from "@/components/client";
import { PortalLogo } from "@/components/brand";
import type { FormState } from "@/lib/validation";

function useToastResult(state: FormState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok && state.message) toast.success(state.message);
  }, [state]);
}

const DEFAULT_LOGO = "/brand/jaljeevika-logo.jpg";

export function GeneralSettingsForm({
  portalName, organizationName, supportEmail, logoUrl, hasCustomLogo,
}: { portalName: string; organizationName: string; supportEmail: string; logoUrl: string; hasCustomLogo: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveGeneralSettingsAction, {});
  const onSubmit = useKeepValuesSubmit(action);
  useToastResult(state);
  const [preview, setPreview] = useState(logoUrl);
  const [logoAction, setLogoAction] = useState<"keep" | "replace" | "remove">("keep");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fe = state.fieldErrors ?? {};

  // After a successful save the server sends the new logo URL; start from it.
  useEffect(() => {
    setPreview(logoUrl);
    setLogoAction("keep");
    if (fileRef.current) fileRef.current.value = "";
  }, [logoUrl]);

  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <h2 className="text-base font-semibold text-ink">Portal identity</h2>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <input type="hidden" name="logoAction" value={logoAction} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <PortalLogo src={preview} alt="Portal logo preview" size={72} />
          <div className="flex flex-wrap gap-2">
            <label className={buttonClass({ variant: "secondary", size: "sm", className: "cursor-pointer" })}>
              <ImageUp className="size-4" aria-hidden /> Upload portal logo
              <input
                ref={fileRef} type="file" name="logo" accept=".png,.jpg,.jpeg,.svg,.webp" className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFileError(null);
                  if (!f) return;
                  if (f.size > 2 * 1024 * 1024) {
                    setFileError("The logo must be 2 MB or smaller.");
                    e.target.value = "";
                    return;
                  }
                  setPreview(URL.createObjectURL(f));
                  setLogoAction("replace");
                }}
              />
            </label>
            {hasCustomLogo || logoAction === "replace" ? (
              <button
                type="button"
                className={buttonClass({ variant: "ghost", size: "sm" })}
                onClick={() => {
                  if (fileRef.current) fileRef.current.value = "";
                  setPreview(DEFAULT_LOGO);
                  setLogoAction(hasCustomLogo ? "remove" : "keep");
                }}
              >
                Use the default Jaljeevika logo
              </button>
            ) : null}
          </div>
        </div>
        {fileError || fe.logo ? <p className="text-[13px] text-rose-600" role="alert">{fileError ?? fe.logo}</p> : null}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Portal name" htmlFor="portal_name" error={fe.portal_name}>
            <input id="portal_name" name="portal_name" defaultValue={portalName} maxLength={80} className="field" />
          </Field>
          <Field label="Organisation name" htmlFor="organization_name" error={fe.organization_name}>
            <input id="organization_name" name="organization_name" defaultValue={organizationName} maxLength={120} className="field" />
          </Field>
        </div>
        <Field label="Support email" htmlFor="support_email" error={fe.support_email} optional hint="Shown on the sign-in page (“Contact administrator”) and in emails.">
          <input id="support_email" name="support_email" type="email" defaultValue={supportEmail} maxLength={254} className="field" placeholder="support@jaljeevika.org" />
        </Field>
        <div className="flex justify-end"><SubmitButton pending={pending} pendingText="Saving…">Save</SubmitButton></div>
      </form>
    </Card>
  );
}

export function AuthSettingsForm({
  allowRegistration, requireEmailVerification, sessionIdleHours, rememberMeDays,
}: { allowRegistration: boolean; requireEmailVerification: boolean; sessionIdleHours: number; rememberMeDays: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveAuthSettingsAction, {});
  const onSubmit = useKeepValuesSubmit(action);
  useToastResult(state);
  const fe = state.fieldErrors ?? {};
  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <h2 className="text-base font-semibold text-ink">Sign-in &amp; registration</h2>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 text-sm">
          <input type="checkbox" name="allow_registration" defaultChecked={allowRegistration} className="mt-0.5 size-4 accent-brand-600" />
          <span>
            <span className="block font-medium text-ink">Allow people to create their own account</span>
            <span className="block text-ink-2">Off: only admins add users and the sign-in page says “Contact administrator”. New accounts get the User role and only apps marked “give to new users”.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 text-sm">
          <input type="checkbox" name="require_email_verification" defaultChecked={requireEmailVerification} className="mt-0.5 size-4 accent-brand-600" />
          <span>
            <span className="block font-medium text-ink">Require a confirmed email address to sign in</span>
            <span className="block text-ink-2">Self-registered users must click the link we email them. Admin-created users can be marked as confirmed.</span>
          </span>
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Sign out after inactivity (hours)" htmlFor="session_idle_hours" error={fe.session_idle_hours} hint="For sessions without “keep me signed in”.">
            <input id="session_idle_hours" name="session_idle_hours" type="number" min={1} max={168} defaultValue={sessionIdleHours} className="field" />
          </Field>
          <Field label="“Keep me signed in” lasts (days)" htmlFor="remember_me_days" error={fe.remember_me_days}>
            <input id="remember_me_days" name="remember_me_days" type="number" min={1} max={90} defaultValue={rememberMeDays} className="field" />
          </Field>
        </div>
        <div className="flex justify-end"><SubmitButton pending={pending} pendingText="Saving…">Save</SubmitButton></div>
      </form>
    </Card>
  );
}

export function TestEmailForm({ disabled }: { disabled: boolean }) {
  const [state, action] = useActionState<FormState>(sendTestEmailAction, {});
  useToastResult(state);
  return (
    <form action={action} className="mt-5 flex justify-end">
      <SubmitButton variant="secondary" size="sm" pendingText="Sending…" disabled={disabled}>
        <Send className="size-3.5" aria-hidden /> Send me a test email
      </SubmitButton>
    </form>
  );
}
