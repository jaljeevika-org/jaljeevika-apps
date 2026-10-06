import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { adminPage, Forbidden } from "../../guard";
import { listRoles } from "@/server/roles";
import { listApplications } from "@/server/applications";
import { isEmailConfigured } from "@/server/email";
import { can, canAssignRole } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Add user" };

export default async function NewUserPage() {
  const { user, allowed } = await adminPage("users.manage");
  if (!allowed) return <Forbidden />;
  const [roles, apps] = await Promise.all([listRoles(), listApplications()]);
  const assignable = roles.filter((r) => canAssignRole(user, r));
  return (
    <div className="max-w-3xl">
      <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Users
      </Link>
      <PageHeader title="Add user" description="Create an account and choose which applications this person can open." />
      <UserForm
        mode="create"
        roles={assignable.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description }))}
        apps={apps.map((a) => ({ id: a.id, name: a.name, logoUrl: a.logoUrl, icon: a.icon, accentColor: a.accentColor, isActive: a.isActive, requiredRoleName: a.requiredRoleName }))}
        canManageAccess={can(user, "access.manage")}
        emailConfigured={isEmailConfigured()}
      />
    </div>
  );
}
