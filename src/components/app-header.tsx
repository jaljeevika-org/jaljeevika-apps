import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import type { SessionUser } from "@/server/session";
import { getSettings, portalLogoUrl } from "@/server/settings";
import { canAccessAdmin } from "@/lib/permissions";
import { logoutAction } from "@/app/(auth)/actions";
import { PortalLogo } from "./brand";
import { ThemeToggle } from "./client";
import { UserMenu } from "./user-menu";
import { buttonClass } from "./ui";

export async function AppHeader({ user, section }: { user: SessionUser; section?: string }) {
  const settings = await getSettings();
  const showAdmin = canAccessAdmin(user);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <PortalLogo src={portalLogoUrl(settings)} alt={`${settings.organization_name} logo`} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-semibold leading-tight text-ink">{settings.portal_name}</span>
            {section ? <span className="block text-xs leading-tight text-ink-3">{section}</span> : null}
          </span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          {showAdmin && section !== "Admin" ? (
            <Link href="/admin" className={buttonClass({ variant: "ghost", size: "sm", className: "max-sm:hidden" })}>
              <ShieldCheck className="size-4" aria-hidden /> Admin
            </Link>
          ) : null}
          {section === "Admin" ? (
            <Link href="/" className={buttonClass({ variant: "ghost", size: "sm", className: "max-sm:hidden" })}>My applications</Link>
          ) : null}
          <ThemeToggle />
          <UserMenu name={user.name} email={user.email} roleName={user.role.name} showAdmin={showAdmin} logoutAction={logoutAction} />
        </div>
      </div>
    </header>
  );
}
