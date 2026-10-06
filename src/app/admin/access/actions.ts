"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActionUser } from "@/server/session";
import { toFormState } from "@/server/errors";
import { setAccess, setAccessForAll } from "@/server/access";
import type { FormState } from "@/lib/validation";

export async function setAccessAction(userId: string, applicationId: string, granted: boolean): Promise<FormState> {
  try {
    const actor = await requireActionUser("access.manage");
    await setAccess(actor, z.uuid().parse(userId), z.uuid().parse(applicationId), granted);
    revalidatePath("/admin/access");
    return { ok: true };
  } catch (err) {
    return toFormState(err);
  }
}

export async function setAccessForAllAction(applicationId: string, granted: boolean): Promise<FormState> {
  try {
    const actor = await requireActionUser("access.manage");
    const n = await setAccessForAll(actor, z.uuid().parse(applicationId), granted);
    revalidatePath("/admin/access");
    revalidatePath("/admin/applications");
    return { ok: true, message: granted ? `Access given to ${n} more user(s).` : `Access removed from ${n} user(s).` };
  } catch (err) {
    return toFormState(err);
  }
}
