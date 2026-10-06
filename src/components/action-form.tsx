"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import type { FormState } from "@/lib/validation";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Form bound to a Server Action that reports its result as a toast. Used for
 * small one-click operations (enable, disable, delete, send link, …).
 */
export function ActionForm({ action, children, className, id }: { action: Action; children: ReactNode; className?: string; id?: string }) {
  const [state, formAction] = useActionState(action, {});
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.ok && state.message) toast.success(state.message);
  }, [state]);
  return (
    <form id={id} action={formAction} className={className}>
      {children}
    </form>
  );
}
