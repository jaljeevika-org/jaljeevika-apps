"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/server/session";
import { toFormState } from "@/server/errors";
import {
  adminRevokeSessions, adminSendPasswordLink, adminSetPassword, createUser, deleteUser, setUserActive, updateUser,
} from "@/server/users";
import { checkbox, emailSchema, fieldErrors, formValues, nameSchema, type FormState } from "@/lib/validation";

const uuid = z.uuid();

const baseSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  roleId: z.coerce.number({ error: "Choose a role." }).int().positive("Choose a role."),
  emailVerified: checkbox,
});

const createSchema = baseSchema.extend({
  onboarding: z.enum(["invite", "password"], { error: "Choose how the user gets a password." }),
  password: z.string().max(256).optional(),
  mustChangePassword: checkbox,
});

const KEEP = ["name", "email", "roleId", "onboarding"];

export async function createUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, KEEP);
  let result: { id: string; inviteSent: boolean };
  try {
    const actor = await requireActionUser("users.manage");
    const parsed = createSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    const d = parsed.data;
    if (d.onboarding === "password" && !d.password) return { fieldErrors: { password: "Enter a temporary password." }, values };
    const appIds = formData.getAll("appIds").map(String).filter((id) => uuid.safeParse(id).success);
    result = await createUser(actor, {
      name: d.name, email: d.email, roleId: d.roleId, appIds, onboarding: d.onboarding, password: d.password,
      mustChangePassword: d.mustChangePassword, emailVerified: d.emailVerified,
    });
  } catch (err) {
    return toFormState(err, values);
  }
  revalidatePath("/admin/users");
  const notice = formData.get("onboarding") === "invite" ? (result.inviteSent ? "user_invited" : "user_invite_failed") : "user_created";
  redirect(`/admin/users/${result.id}?notice=${notice}`);
}

const updateSchema = baseSchema.extend({ id: uuid });

export async function updateUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["name", "email", "roleId"]);
  try {
    const actor = await requireActionUser("users.manage");
    const parsed = updateSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    const d = parsed.data;
    const appIds = formData.get("appsSubmitted") ? formData.getAll("appIds").map(String).filter((id) => uuid.safeParse(id).success) : undefined;
    await updateUser(actor, d.id, { name: d.name, email: d.email, roleId: d.roleId, emailVerified: d.emailVerified, appIds });
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${d.id}`);
    return { ok: true, message: "User saved.", values };
  } catch (err) {
    return toFormState(err, values);
  }
}

function idFrom(formData: FormData): string {
  const parsed = uuid.safeParse(formData.get("id"));
  if (!parsed.success) throw new Error("Invalid user id");
  return parsed.data;
}

export async function setUserActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("users.manage");
    const id = idFrom(formData);
    const active = formData.get("active") === "true";
    await setUserActive(actor, id, active);
    revalidatePath("/admin/users");
    revalidatePath(`/admin/users/${id}`);
    return { ok: true, message: active ? "User enabled." : "User disabled and signed out everywhere." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function deleteUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("users.manage");
    await deleteUser(actor, idFrom(formData));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?notice=user_deleted");
}

export async function sendPasswordLinkAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("users.manage");
    const sent = await adminSendPasswordLink(actor, idFrom(formData));
    return sent ? { ok: true, message: "Password link emailed." } : { error: "The email could not be sent. Check the email settings and try again." };
  } catch (err) {
    return toFormState(err);
  }
}

const setPasswordSchema = z.object({
  id: uuid,
  password: z.string().min(1, "Enter a password.").max(256),
  mustChangePassword: checkbox,
});

export async function setPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("users.manage");
    const parsed = setPasswordSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
    await adminSetPassword(actor, parsed.data.id, parsed.data.password, parsed.data.mustChangePassword);
    revalidatePath(`/admin/users/${parsed.data.id}`);
    return { ok: true, message: "Password set. The user has been signed out of all devices." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function revokeSessionsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("users.manage");
    const id = idFrom(formData);
    const n = await adminRevokeSessions(actor, id);
    revalidatePath(`/admin/users/${id}`);
    return { ok: true, message: n ? `Ended ${n} session${n === 1 ? "" : "s"}.` : "No active sessions." };
  } catch (err) {
    return toFormState(err);
  }
}
