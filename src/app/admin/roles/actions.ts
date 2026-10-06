"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/server/session";
import { toFormState } from "@/server/errors";
import { createRole, deleteRole, updateRole } from "@/server/roles";
import { fieldErrors, type FormState } from "@/lib/validation";
import { PERMISSIONS } from "@/lib/permissions";

const roleSchema = z.object({
  name: z.string().trim().min(2, "Enter a role name.").max(60).refine((v) => !/[<>]/.test(v), "Name contains characters that are not allowed."),
  description: z.string().trim().max(300).default(""),
  rank: z.coerce.number({ error: "Enter a rank." }).int().min(1, "Rank must be at least 1.").max(999, "Rank must be below 1000."),
});

function permissionsFrom(formData: FormData): string[] {
  return formData.getAll("permissions").map(String).filter((p) => (PERMISSIONS as readonly string[]).includes(p));
}

export async function createRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("roles.manage");
    const parsed = roleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
    await createRole(actor, { ...parsed.data, permissions: permissionsFrom(formData) });
    revalidatePath("/admin/roles");
    return { ok: true, message: "Role created." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function updateRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("roles.manage");
    const id = z.coerce.number().int().positive().parse(formData.get("id"));
    const parsed = roleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
    await updateRole(actor, id, { ...parsed.data, permissions: permissionsFrom(formData) });
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Role saved." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function deleteRoleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("roles.manage");
    await deleteRole(actor, z.coerce.number().int().positive().parse(formData.get("id")));
    revalidatePath("/admin/roles");
    return { ok: true, message: "Role deleted." };
  } catch (err) {
    return toFormState(err);
  }
}
