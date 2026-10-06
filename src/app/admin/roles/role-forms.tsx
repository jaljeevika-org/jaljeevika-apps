"use client";

import { useActionState, useEffect, useId } from "react";
import { toast } from "sonner";
import { Lock, Plus } from "lucide-react";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "./actions";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field } from "@/components/ui";
import { ConfirmSubmit, SubmitButton, useKeepValuesSubmit } from "@/components/client";
import type { FormState } from "@/lib/validation";

type Permission = { key: string; name: string; description: string };
type Role = { id: number; key: string; name: string; description: string; rank: number; isSystem: boolean; permissions: string[]; userCount: number };

function useToastResult(state: FormState) {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok && state.message) toast.success(state.message);
  }, [state]);
}

function PermissionList({ permissions, selected, grantable, disabled }: { permissions: Permission[]; selected: string[]; grantable: string[]; disabled: boolean }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {permissions.map((p) => {
        const off = disabled || !grantable.includes(p.key);
        return (
          <li key={p.key}>
            <label className={`flex items-start gap-2.5 rounded-xl border border-line p-3 text-sm ${off ? "opacity-70" : "cursor-pointer hover:bg-surface-2/60"}`}>
              <input type="checkbox" name="permissions" value={p.key} defaultChecked={selected.includes(p.key)} disabled={off} className="mt-0.5 size-4 accent-brand-600" />
              <span>
                <span className="block font-medium text-ink">{p.name}</span>
                <span className="block text-xs text-ink-2">{p.description}</span>
              </span>
            </label>
            {/* Keep permissions the actor may not touch (disabled inputs are not submitted). */}
            {off && !disabled && selected.includes(p.key) ? <input type="hidden" name="permissions" value={p.key} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function RoleCard({ role, permissions, locked, lockedReason, grantable }: { role: Role; permissions: Permission[]; locked: boolean; lockedReason?: string; grantable: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateRoleAction, {});
  const onSubmit = useKeepValuesSubmit(action);
  const deleteId = useId();
  useToastResult(state);
  const fe = state.fieldErrors ?? {};
  return (
    <Card className="p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="id" value={role.id} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-ink">{role.name}</h2>
            {role.isSystem ? <Badge tone="brand">Built-in</Badge> : <Badge tone="teal">Custom</Badge>}
            <Badge>Rank {role.rank}</Badge>
            <Badge>{role.userCount} user{role.userCount === 1 ? "" : "s"}</Badge>
          </div>
          {locked ? <span className="flex items-center gap-1.5 text-xs text-ink-3"><Lock className="size-3.5" aria-hidden />{lockedReason}</span> : null}
        </div>
        {locked ? (
          <>
            <p className="text-sm text-ink-2">{role.description}</p>
            <input type="hidden" name="name" value={role.name} />
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
            <Field label="Name" htmlFor={`name-${role.id}`} error={fe.name}>
              <input id={`name-${role.id}`} name="name" defaultValue={role.name} className="field" maxLength={60} readOnly={role.isSystem} />
            </Field>
            <Field label="Description" htmlFor={`desc-${role.id}`} error={fe.description}>
              <input id={`desc-${role.id}`} name="description" defaultValue={role.description} className="field" maxLength={300} />
            </Field>
            <Field label="Rank" htmlFor={`rank-${role.id}`} error={fe.rank}>
              <input id={`rank-${role.id}`} name="rank" type="number" min={1} max={999} defaultValue={role.rank} className="field" />
            </Field>
          </div>
        )}
        <PermissionList permissions={permissions} selected={role.key === "super_admin" ? permissions.map((p) => p.key) : role.permissions} grantable={grantable} disabled={locked} />
        {!locked ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <SubmitButton size="sm" pending={pending} pendingText="Saving…">Save role</SubmitButton>
          </div>
        ) : null}
      </form>
      {!locked && !role.isSystem ? (
        <ActionForm action={deleteRoleAction} id={deleteId} className="mt-3 flex justify-end">
          <input type="hidden" name="id" value={role.id} />
          <ConfirmSubmit formId={deleteId} label="Delete role" title={`Delete the ${role.name} role?`} body="Only roles without users can be deleted." confirmLabel="Delete role" />
        </ActionForm>
      ) : null}
    </Card>
  );
}

export function NewRoleForm({ permissions, grantable, maxRank }: { permissions: Permission[]; grantable: string[]; maxRank: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createRoleAction, {});
  const onSubmit = useKeepValuesSubmit(action);
  useToastResult(state);
  const fe = state.fieldErrors ?? {};
  return (
    <details className="card mt-6 p-6">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-base font-semibold text-ink">
        <Plus className="size-4" aria-hidden /> Create a custom role
      </summary>
      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
          <Field label="Name" htmlFor="new-name" error={fe.name}>
            <input id="new-name" name="name" className="field" maxLength={60} placeholder="Field coordinator" />
          </Field>
          <Field label="Description" htmlFor="new-desc" error={fe.description}>
            <input id="new-desc" name="description" className="field" maxLength={300} />
          </Field>
          <Field label="Rank" htmlFor="new-rank" error={fe.rank} hint={`1–${maxRank}`}>
            <input id="new-rank" name="rank" type="number" min={1} max={maxRank} defaultValue={Math.min(100, maxRank)} className="field" />
          </Field>
        </div>
        <PermissionList permissions={permissions} selected={[]} grantable={grantable} disabled={false} />
        <div className="flex justify-end"><SubmitButton size="sm" pending={pending} pendingText="Creating…">Create role</SubmitButton></div>
      </form>
    </details>
  );
}
