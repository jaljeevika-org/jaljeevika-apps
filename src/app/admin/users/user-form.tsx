"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { createUserAction, updateUserAction } from "./actions";
import { Alert, Card, Field } from "@/components/ui";
import { PasswordInput, SubmitButton, useKeepValuesSubmit } from "@/components/client";
import { AppTile } from "@/components/app-tile";
import type { FormState } from "@/lib/validation";
import { PASSWORD_MIN } from "@/lib/password-policy";
import { cn } from "@/lib/cn";

export type RoleOption = { id: number; key: string; name: string; description: string };
export type AppOption = { id: string; name: string; logoUrl: string | null; icon: string; accentColor: string; isActive: boolean; requiredRoleName: string | null };

type Props = {
  mode: "create" | "edit";
  user?: { id: string; name: string; email: string; roleId: number; emailVerified: boolean; appIds: string[]; isSelf: boolean };
  roles: RoleOption[];
  apps: AppOption[];
  canManageAccess: boolean;
  emailConfigured: boolean;
};

export function UserForm({ mode, user, roles, apps, canManageAccess, emailConfigured }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "create" ? createUserAction : updateUserAction, {});
  const onSubmit = useKeepValuesSubmit(action);
  const defaultRole = user?.roleId ?? roles.find((r) => r.key === "user")?.id ?? roles[roles.length - 1]?.id;
  const [roleId, setRoleId] = useState<number | undefined>(state.values?.roleId ? Number(state.values.roleId) : defaultRole);
  const [onboarding, setOnboarding] = useState<"invite" | "password">(
    (state.values?.onboarding as "invite" | "password") ?? (emailConfigured ? "invite" : "password"),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(user?.appIds ?? []));
  const fe = state.fieldErrors ?? {};
  const roleKey = roles.find((r) => r.id === roleId)?.key;

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const toggleApp = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {user ? <input type="hidden" name="id" value={user.id} /> : null}

      <Card className="space-y-5 p-6">
        <h2 className="text-base font-semibold text-ink">Details</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" error={fe.name}>
            <input id="name" name="name" required maxLength={120} autoComplete="off" className="field"
              defaultValue={state.values?.name ?? user?.name ?? ""} aria-invalid={Boolean(fe.name) || undefined} />
          </Field>
          <Field label="Email" htmlFor="email" error={fe.email}>
            <input id="email" name="email" type="email" required maxLength={254} autoComplete="off" className="field"
              defaultValue={state.values?.email ?? user?.email ?? ""} aria-invalid={Boolean(fe.email) || undefined} />
          </Field>
        </div>
        <Field label="Role" htmlFor="roleId" error={fe.roleId} hint={user?.isSelf ? "You cannot change your own role." : roles.find((r) => r.id === roleId)?.description}>
          {user?.isSelf ? <input type="hidden" name="roleId" value={user.roleId} /> : null}
          <select
            id="roleId" name={user?.isSelf ? undefined : "roleId"} className="field" value={roleId ?? ""}
            onChange={(e) => setRoleId(Number(e.target.value))} disabled={user?.isSelf}
          >
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="emailVerified" defaultChecked={user ? user.emailVerified : true} className="mt-0.5 size-4 accent-brand-600"
            disabled={mode === "create" && onboarding === "invite"} />
          <span>
            <span className="font-medium text-ink">Email address is confirmed</span>
            <span className="block text-ink-3">
              {mode === "create" && onboarding === "invite"
                ? "Confirmed automatically when they use the invitation link."
                : "Untick if you are not sure the address belongs to this person; they will be asked to confirm it."}
            </span>
          </span>
        </label>
      </Card>

      {mode === "create" ? (
        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-ink">How will they get a password?</h2>
          {fe.onboarding ? <p className="text-[13px] text-rose-600">{fe.onboarding}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 text-sm transition-colors", onboarding === "invite" ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10" : "border-line", !emailConfigured && "cursor-not-allowed opacity-60")}>
              <input type="radio" name="onboarding" value="invite" checked={onboarding === "invite"} onChange={() => setOnboarding("invite")} disabled={!emailConfigured} className="mt-0.5 accent-brand-600" />
              <span>
                <span className="font-semibold text-ink">Email an invitation</span>
                <span className="mt-0.5 block text-ink-2">{emailConfigured ? "They choose their own password from a one-time link. Recommended." : "Email is not configured yet."}</span>
              </span>
            </label>
            <label className={cn("flex cursor-pointer gap-3 rounded-xl border p-4 text-sm transition-colors", onboarding === "password" ? "border-brand-500 bg-brand-50/60 dark:bg-brand-500/10" : "border-line")}>
              <input type="radio" name="onboarding" value="password" checked={onboarding === "password"} onChange={() => setOnboarding("password")} className="mt-0.5 accent-brand-600" />
              <span>
                <span className="font-semibold text-ink">Set a temporary password</span>
                <span className="mt-0.5 block text-ink-2">Share it with them privately (not by public chat).</span>
              </span>
            </label>
          </div>
          {onboarding === "password" ? (
            <div className="space-y-4">
              <Field label="Temporary password" htmlFor="password" error={fe.password} hint={`At least ${PASSWORD_MIN} characters.`}>
                <PasswordInput id="password" name="password" autoComplete="new-password" showStrength invalid={Boolean(fe.password)} />
              </Field>
              <label className="flex items-center gap-2.5 text-sm text-ink">
                <input type="checkbox" name="mustChangePassword" defaultChecked className="size-4 accent-brand-600" />
                Ask them to choose their own password when they first sign in
              </label>
            </div>
          ) : null}
        </Card>
      ) : null}

      {canManageAccess ? (
        <Card className="p-6">
          <input type="hidden" name="appsSubmitted" value="1" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">Application access</h2>
            {apps.length > 0 && roleKey !== "super_admin" ? (
              <div className="flex gap-3 text-sm">
                <button type="button" className="font-medium text-brand-600 hover:underline dark:text-brand-300" onClick={() => setSelected(new Set(apps.map((a) => a.id)))}>All</button>
                <button type="button" className="font-medium text-ink-2 hover:underline" onClick={() => setSelected(new Set())}>None</button>
              </div>
            ) : null}
          </div>
          {roleKey === "super_admin" ? (
            <p className="mt-3 text-sm text-ink-2">Super Admins can open every active application. The choices below are kept in case the role changes later.</p>
          ) : null}
          {apps.length === 0 ? (
            <p className="mt-3 text-sm text-ink-2">No applications have been added yet.</p>
          ) : (
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {apps.map((app) => (
                <li key={app.id}>
                  <label className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors", selected.has(app.id) ? "border-brand-400 bg-brand-50/60 dark:border-brand-500/60 dark:bg-brand-500/10" : "border-line hover:bg-surface-2")}>
                    <input type="checkbox" name="appIds" value={app.id} checked={selected.has(app.id)} onChange={() => toggleApp(app.id)} className="size-4 accent-brand-600" />
                    <AppTile name={app.name} logoUrl={app.logoUrl} icon={app.icon} accentColor={app.accentColor} size={32} className="rounded-lg" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{app.name}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {!app.isActive ? "Disabled" : app.requiredRoleName ? `Requires ${app.requiredRoleName}` : "Active"}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      <div className="flex justify-end gap-2">
        <SubmitButton size="lg" pending={pending} pendingText="Saving…">{mode === "create" ? "Create user" : "Save changes"}</SubmitButton>
      </div>
    </form>
  );
}
