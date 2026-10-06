import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/server/session";
import { can, canAccessAdmin } from "@/lib/permissions";
import { AppHeader } from "@/components/app-header";
import { NoticeToast } from "@/components/client";
import { AdminNav, type NavItem } from "./admin-nav";
import { Forbidden } from "./guard";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" } };

const NOTICES = {
  user_created: "User created.",
  user_invited: "User created and invitation emailed.",
  user_invite_failed: "User created, but the invitation email could not be sent. Use “Send password link” to retry.",
  user_saved: "User saved.",
  user_deleted: "User deleted.",
  app_created: "Application added.",
  app_saved: "Application saved.",
  app_deleted: "Application deleted.",
  role_created: "Role created.",
  role_saved: "Role saved.",
  role_deleted: "Role deleted.",
  settings_saved: "Settings saved.",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!canAccessAdmin(user)) {
    return (
      <div className="min-h-dvh">
        <AppHeader user={user} />
        <Forbidden />
      </div>
    );
  }

  const items: NavItem[] = [{ href: "/admin", label: "Overview", icon: "overview" }];
  if (can(user, "users.view") || can(user, "users.manage")) items.push({ href: "/admin/users", label: "Users", icon: "users" });
  if (can(user, "applications.manage")) items.push({ href: "/admin/applications", label: "Applications", icon: "applications" });
  if (can(user, "access.manage")) items.push({ href: "/admin/access", label: "Access", icon: "access" });
  if (can(user, "roles.manage")) items.push({ href: "/admin/roles", label: "Roles", icon: "roles" });
  if (can(user, "settings.manage")) items.push({ href: "/admin/settings", label: "Settings", icon: "settings" });
  if (can(user, "audit.view")) items.push({ href: "/admin/audit", label: "Audit log", icon: "audit" });

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader user={user} section="Admin" />
      <Suspense>
        <NoticeToast messages={NOTICES} />
      </Suspense>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:flex-row lg:gap-8 lg:py-8">
        <aside className="lg:sticky lg:top-24 lg:h-fit lg:w-56 lg:shrink-0">
          <AdminNav items={items} />
        </aside>
        <main className="min-w-0 flex-1 pb-12">{children}</main>
      </div>
    </div>
  );
}
