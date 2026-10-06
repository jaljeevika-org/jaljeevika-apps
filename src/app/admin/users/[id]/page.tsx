import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { adminPage, Forbidden } from "../../guard";
import { getUser } from "@/server/users";
import { listRoles } from "@/server/roles";
import { listApplications } from "@/server/applications";
import { isEmailConfigured } from "@/server/email";
import { can, canAssignRole, outranks } from "@/lib/permissions";
import { Alert, Avatar, Badge, Card, PageHeader } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/cn";
import { UserForm } from "../user-form";
import { UserAccountActions } from "./user-actions";

export const metadata: Metadata = { title: "Edit user" };

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user: actor, allowed } = await adminPage();
  if (!allowed || !(can(actor, "users.view") || can(actor, "users.manage"))) return <Forbidden />;
  const target = await getUser(id);
  if (!target) notFound();
  const [roles, apps] = await Promise.all([listRoles(), listApplications()]);
  const isSelf = target.id === actor.id;
  const editable = can(actor, "users.manage") && (isSelf || outranks(actor, target.role));
  // The current role is always listed so the select shows it even if the actor could not assign it.
  const roleOptions = roles.filter((r) => r.id === target.role.id || canAssignRole(actor, r));
  const appNames = new Map(apps.map((a) => [a.id, a.name]));

  return (
    <div className="max-w-3xl">
      <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> Users
      </Link>
      <PageHeader title={target.name} description={target.email} />

      <Card className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 p-5 text-sm">
        <div className="flex items-center gap-3">
          <Avatar name={target.name} className="size-11" />
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="brand">{target.role.name}</Badge>
            {target.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
            {!target.emailVerified ? <Badge tone="amber">Email unconfirmed</Badge> : null}
            {!target.hasPassword ? <Badge tone="amber">Invitation pending</Badge> : target.mustChangePassword ? <Badge tone="amber">Temporary password</Badge> : null}
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-2">
          <div><dt className="text-xs text-ink-3">Created</dt><dd className="text-ink">{formatDate(target.createdAt)}</dd></div>
          <div><dt className="text-xs text-ink-3">Last sign-in</dt><dd className="text-ink">{formatDateTime(target.lastLoginAt)}</dd></div>
          <div><dt className="text-xs text-ink-3">Active sessions</dt><dd className="text-ink">{target.activeSessions}</dd></div>
        </dl>
      </Card>

      {editable ? (
        <>
          <UserForm
            mode="edit"
            user={{ id: target.id, name: target.name, email: target.email, roleId: target.role.id, emailVerified: target.emailVerified, appIds: target.appIds, isSelf }}
            roles={roleOptions.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description }))}
            apps={apps.map((a) => ({ id: a.id, name: a.name, logoUrl: a.logoUrl, icon: a.icon, accentColor: a.accentColor, isActive: a.isActive, requiredRoleName: a.requiredRoleName }))}
            canManageAccess={can(actor, "access.manage")}
            emailConfigured={isEmailConfigured()}
          />
          <UserAccountActions
            id={target.id}
            name={target.name}
            isActive={target.isActive}
            isSelf={isSelf}
            hasPassword={target.hasPassword}
            emailConfigured={isEmailConfigured()}
          />
        </>
      ) : (
        <>
          <Alert tone="info" title="View only">
            {can(actor, "users.manage") ? "This user's role is equal to or above yours, so only a higher-ranked admin can change it." : "You can view users but not change them."}
          </Alert>
          <Card className="mt-6 p-6">
            <h2 className="text-base font-semibold text-ink">Application access</h2>
            {target.role.key === "super_admin" ? (
              <p className="mt-2 text-sm text-ink-2">All active applications.</p>
            ) : target.appIds.length === 0 ? (
              <p className="mt-2 text-sm text-ink-2">No applications assigned.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">{target.appIds.map((aid) => <li key={aid}><Badge>{appNames.get(aid) ?? "Unknown"}</Badge></li>)}</ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
