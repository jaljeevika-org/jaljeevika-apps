import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireUser, type SessionUser } from "@/server/session";
import { can, canAccessAdmin, type Permission } from "@/lib/permissions";
import { buttonClass } from "@/components/ui";

/** Page-level permission check. Pages render <Forbidden/> when `allowed` is false. */
export async function adminPage(permission?: Permission): Promise<{ user: SessionUser; allowed: boolean }> {
  const user = await requireUser();
  const allowed = permission ? can(user, permission) : canAccessAdmin(user);
  return { user, allowed };
}

export function Forbidden() {
  return (
    <div className="flex flex-col items-center px-4 py-20 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
        <ShieldAlert className="size-7" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-ink">You don&apos;t have permission to view this page</h1>
      <p className="mt-2 max-w-md text-[15px] text-ink-2">Ask a Super Admin if you need access to this part of the admin dashboard.</p>
      <Link href="/" className={buttonClass({ className: "mt-8" })}>Back to my applications</Link>
    </div>
  );
}
