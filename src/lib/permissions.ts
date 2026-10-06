/**
 * Permission keys. The database holds the same list (table `permissions`);
 * adding a permission means adding a migration row and a key here.
 */
export const PERMISSIONS = [
  "users.view",
  "users.manage",
  "applications.manage",
  "access.manage",
  "roles.manage",
  "settings.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const SUPER_ADMIN_ROLE = "super_admin";
export const DEFAULT_USER_ROLE = "user";

export type RoleRef = { id: number; key: string; name: string; rank: number };

export type PermissionHolder = {
  role: RoleRef;
  permissions: readonly string[];
};

export function isSuperAdmin(holder: Pick<PermissionHolder, "role">): boolean {
  return holder.role.key === SUPER_ADMIN_ROLE;
}

export function can(holder: PermissionHolder, permission: Permission): boolean {
  return isSuperAdmin(holder) || holder.permissions.includes(permission);
}

export function canAccessAdmin(holder: PermissionHolder): boolean {
  return isSuperAdmin(holder) || PERMISSIONS.some((p) => holder.permissions.includes(p));
}

/**
 * A Super Admin may act on anyone. Everyone else may only act on users whose
 * role ranks strictly below their own, so an Admin can never edit, disable or
 * reset the password of a Super Admin or another Admin.
 */
export function outranks(actor: Pick<PermissionHolder, "role">, targetRole: Pick<RoleRef, "key" | "rank">): boolean {
  if (isSuperAdmin(actor)) return true;
  if (targetRole.key === SUPER_ADMIN_ROLE) return false;
  return targetRole.rank < actor.role.rank;
}

/** Roles the actor may hand out. */
export function canAssignRole(actor: Pick<PermissionHolder, "role">, role: Pick<RoleRef, "key" | "rank">): boolean {
  return outranks(actor, role);
}
