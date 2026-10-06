"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, resendVerificationAction, type LoginState } from "../actions";
import { Alert, Field } from "@/components/ui";
import { PasswordInput, SubmitButton } from "@/components/client";

export function LoginForm({ next, allowRegistration, supportEmail }: { next?: string; allowRegistration: boolean; supportEmail: string | null }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, {});
  const [resend, resendAction] = useActionState(resendVerificationAction, {});

  return (
    <div className="mt-7">
      {state.error ? <Alert tone="error" className="mb-5">{state.error}</Alert> : null}
      {state.needsVerification && state.email ? (
        <form action={resendAction} className="-mt-2 mb-5">
          <input type="hidden" name="email" value={state.email} />
          {resend.ok ? (
            <Alert tone="success">{resend.message}</Alert>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
              <span className="text-ink-2">{resend.error ?? "Didn't get the confirmation email?"}</span>
              <SubmitButton size="sm" variant="soft" pendingText="Sending…">Send again</SubmitButton>
            </div>
          )}
        </form>
      ) : null}

      <form action={action} className="space-y-5" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="Email" htmlFor="email" error={state.fieldErrors?.email}>
          <input
            id="email" name="email" type="email" autoComplete="username" required autoFocus inputMode="email"
            defaultValue={state.values?.email ?? ""} key={state.values?.email}
            aria-invalid={Boolean(state.fieldErrors?.email) || undefined}
            aria-describedby={state.fieldErrors?.email ? "email-error" : undefined}
            className="field" placeholder="you@jaljeevika.org"
          />
        </Field>
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="text-sm font-medium text-ink">Password</label>
            <Link href="/forgot-password" className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password" name="password" autoComplete="current-password"
            invalid={Boolean(state.fieldErrors?.password)}
            describedBy={state.fieldErrors?.password ? "password-error" : undefined}
          />
          {state.fieldErrors?.password ? <p id="password-error" className="text-[13px] text-rose-600 dark:text-rose-400">{state.fieldErrors.password}</p> : null}
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
          <input type="checkbox" name="remember" className="size-4 rounded border-line accent-brand-600" />
          Keep me signed in on this device
        </label>
        <SubmitButton size="lg" full pendingText="Signing in…">Sign in</SubmitButton>
      </form>

      <div className="mt-8 border-t border-line pt-6 text-center text-sm text-ink-2">
        {allowRegistration ? (
          <p>
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">Create one</Link>
          </p>
        ) : (
          <p>
            Don&apos;t have an account?{" "}
            {supportEmail ? (
              <a href={`mailto:${supportEmail}?subject=${encodeURIComponent("Access to the Jaljeevika App Portal")}`} className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-300">
                Contact your administrator
              </a>
            ) : (
              <span className="font-semibold text-ink">Contact your administrator</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
