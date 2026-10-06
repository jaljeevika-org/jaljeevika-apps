"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/server/session";
import { toFormState } from "@/server/errors";
import {
  createApplication, deleteApplication, reorderApplications, setApplicationActive, updateApplication, type AppInput, type LogoChange,
} from "@/server/applications";
import { APP_ICONS, ACCENT_COLORS } from "@/lib/app-icons";
import { appUrlSchema, checkbox, fieldErrors, formValues, slugSchema, type FormState } from "@/lib/validation";

const appSchema = z.object({
  name: z.string().trim().min(1, "Enter the application name.").max(100, "Use at most 100 characters."),
  slug: z.union([z.literal(""), slugSchema]).optional(),
  description: z.string().trim().max(500, "Use at most 500 characters.").default(""),
  url: appUrlSchema,
  icon: z.string().refine((v) => v in APP_ICONS, "Choose an icon."),
  accentColor: z.string().refine((v) => v in ACCENT_COLORS, "Choose a colour."),
  category: z.string().trim().max(60, "Use at most 60 characters.").optional(),
  requiredRoleId: z.string().optional(),
  isActive: checkbox,
  openInNewTab: checkbox,
  autoGrant: checkbox,
  logoAction: z.enum(["keep", "replace", "remove"]).default("keep"),
});

const KEEP = ["name", "slug", "description", "url", "icon", "accentColor", "category", "requiredRoleId"];

function toInput(d: z.infer<typeof appSchema>): AppInput {
  const roleId = d.requiredRoleId ? Number(d.requiredRoleId) : null;
  return {
    name: d.name,
    slug: d.slug || undefined,
    description: d.description,
    url: d.url,
    icon: d.icon,
    accentColor: d.accentColor,
    category: d.category ? d.category : null,
    requiredRoleId: roleId && Number.isInteger(roleId) ? roleId : null,
    isActive: d.isActive,
    openInNewTab: d.openInNewTab,
    autoGrant: d.autoGrant,
  };
}

function uploadedLogo(formData: FormData): File | null {
  const file = formData.get("logo");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function createApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, KEEP);
  let id: string;
  try {
    const actor = await requireActionUser("applications.manage");
    const parsed = appSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "logo")));
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    const logo = parsed.data.logoAction === "replace" ? uploadedLogo(formData) : null;
    id = await createApplication(actor, toInput(parsed.data), logo);
  } catch (err) {
    return toFormState(err, values);
  }
  revalidatePath("/admin/applications");
  revalidatePath("/");
  redirect(`/admin/applications?notice=app_created&highlight=${id}`);
}

export async function updateApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, KEEP);
  try {
    const actor = await requireActionUser("applications.manage");
    const id = z.uuid().parse(formData.get("id"));
    const parsed = appSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([k]) => k !== "logo")));
    if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
    let logo: LogoChange = { action: "keep" };
    if (parsed.data.logoAction === "remove") logo = { action: "remove" };
    if (parsed.data.logoAction === "replace") {
      const file = uploadedLogo(formData);
      logo = file ? { action: "replace", file } : { action: "keep" };
    }
    await updateApplication(actor, id, toInput(parsed.data), logo);
  } catch (err) {
    return toFormState(err, values);
  }
  revalidatePath("/admin/applications");
  revalidatePath("/");
  redirect("/admin/applications?notice=app_saved");
}

export async function deleteApplicationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const actor = await requireActionUser("applications.manage");
    await deleteApplication(actor, z.uuid().parse(formData.get("id")));
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath("/admin/applications");
  revalidatePath("/");
  redirect("/admin/applications?notice=app_deleted");
}

export async function toggleApplicationAction(id: string, active: boolean): Promise<FormState> {
  try {
    const actor = await requireActionUser("applications.manage");
    await setApplicationActive(actor, z.uuid().parse(id), active);
    revalidatePath("/admin/applications");
    revalidatePath("/");
    return { ok: true, message: active ? "Application enabled." : "Application disabled. Users no longer see it." };
  } catch (err) {
    return toFormState(err);
  }
}

export async function reorderApplicationsAction(orderedIds: string[]): Promise<FormState> {
  try {
    const actor = await requireActionUser("applications.manage");
    const ids = z.array(z.uuid()).max(1000).parse(orderedIds);
    await reorderApplications(actor, ids);
    revalidatePath("/admin/applications");
    revalidatePath("/");
    return { ok: true, message: "New order saved." };
  } catch (err) {
    return toFormState(err);
  }
}
