import type { Metadata } from "next";
import { adminPage, Forbidden } from "../guard";
import { listPermissions, listRoles } from "@/server/roles";
import { outranks, SUPER_ADMIN_ROLE } from "@/lib/permissions";
import { Alert, PageHeader } from "@/components/ui";
import { RoleCard, NewRoleForm } from "./role-forms";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  const { user, allowed } = await adminPage("roles.manage");
  if (!allowed) return <Forbidden />;
  const [roles, permissions] = await Promise.all([listRoles(), listPermissions()]);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Roles & permissions" description="Roles decide what each person may do in the portal. Rank orders roles: admins can only manage people whose role ranks below their own." />
      <Alert tone="info" className="mb-6">
        Super Admin always has every permission. Application access is separate: it is given per user on the Access page.
      </Alert>
      <div className="space-y-4">
        {roles.map((role) => {
          const locked = role.key === SUPER_ADMIN_ROLE || role.id === user.role.id || !outranks(user, role);
          return (
            <RoleCard
              key={role.id}
              role={role}
              permissions={permissions}
              locked={locked}
              lockedReason={
                role.key === SUPER_ADMIN_ROLE ? "Always has every permission." : role.id === user.role.id ? "This is your own role." : !outranks(user, role) ? "Ranked at or above your role." : undefined
              }
              grantable={user.isSuperAdmin ? permissions.map((p) => p.key) : user.permissions}
            />
          );
        })}
      </div>
      <NewRoleForm permissions={permissions} grantable={user.isSuperAdmin ? permissions.map((p) => p.key) : user.permissions} maxRank={user.isSuperAdmin ? 999 : user.role.rank - 1} />
    </div>
  );
}
