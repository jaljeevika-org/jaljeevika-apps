import "server-only";
import { getPool, pgErrorCode, query, queryOne, withTransaction } from "./db";
import { ServiceError } from "./errors";
import { audit } from "./audit";
import type { SessionUser } from "./session";
import { can, outranks, PERMISSIONS, SUPER_ADMIN_ROLE, type RoleRef } from "@/lib/permissions";

export type RoleWithDetails = RoleRef & {
  description: string;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
};

export type PermissionInfo = { key: string; name: string; description: string };

export async function listRoles(): Promise<RoleWithDetails[]> {
  const rows = await query<{
    id: number; key: string; name: string; rank: number; description: string; is_system: boolean;
    permissions: string[]; user_count: number;
  }>(
    `SELECT r.id, r.key, r.name, r.rank, r.description, r.is_system,
            COALESCE(ARRAY(SELECT permission_key FROM role_permissions rp WHERE rp.role_id = r.id ORDER BY 1), '{}') AS permissions,
            (SELECT count(*)::int FROM users u WHERE u.role_id = r.id) AS user_count
     FROM roles r ORDER BY r.rank DESC, r.name`,
  );
  return rows.map((r) => ({
    id: r.id, key: r.key, name: r.name, rank: r.rank, description: r.description, isSystem: r.is_system,
    permissions: r.permissions, userCount: r.user_count,
  }));
}

export async function listPermissions(): Promise<PermissionInfo[]> {
  return query<PermissionInfo>("SELECT key, name, description FROM permissions ORDER BY key");
}

export async function getRole(id: number): Promise<RoleRef | null> {
  return queryOne<RoleRef>("SELECT id, key, name, rank FROM roles WHERE id = $1", [id]);
}

export async function getRoleByKey(key: string): Promise<RoleRef | null> {
  return queryOne<RoleRef>("SELECT id, key, name, rank FROM roles WHERE key = $1", [key]);
}

function checkGrantable(actor: SessionUser, permissions: string[]) {
  for (const p of permissions) {
    if (!(PERMISSIONS as readonly string[]).includes(p)) throw new ServiceError(`Unknown permission: ${p}`);
    // Nobody can hand out a permission they do not hold themselves.
    if (!actor.isSuperAdmin && !actor.permissions.includes(p)) {
      throw new ServiceError("You cannot grant a permission you do not have.");
    }
  }
}

export type RoleInput = { name: string; description: string; rank: number; permissions: string[] };

export async function createRole(actor: SessionUser, input: RoleInput): Promise<number> {
  if (!can(actor, "roles.manage")) throw new ServiceError("You are not allowed to manage roles.");
  if (!actor.isSuperAdmin && input.rank >= actor.role.rank) {
    throw new ServiceError("A new role must rank below your own role.", "rank");
  }
  if (input.rank >= 1000) throw new ServiceError("Rank must be below 1000 (reserved for Super Admin).", "rank");
  checkGrantable(actor, input.permissions);
  const baseKey = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "role";
  const key = /^[a-z]/.test(baseKey) ? baseKey : `role_${baseKey}`;
  try {
    return await withTransaction(async (client) => {
      const exists = await client.query("SELECT 1 FROM roles WHERE key = $1", [key]);
      const finalKey = exists.rowCount ? `${key}_${Date.now().toString(36).slice(-4)}` : key;
      const row = await client.query<{ id: number }>(
        "INSERT INTO roles (key, name, description, rank, is_system) VALUES ($1, $2, $3, $4, false) RETURNING id",
        [finalKey, input.name, input.description, input.rank],
      );
      const id = row.rows[0].id;
      for (const p of input.permissions) {
        await client.query("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [id, p]);
      }
      await audit({ actorId: actor.id, action: "role.created", targetType: "role", targetId: id, metadata: { name: input.name, permissions: input.permissions } }, client);
      return id;
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") throw new ServiceError("A role with this name already exists.", "name");
    throw err;
  }
}

export async function updateRole(actor: SessionUser, roleId: number, input: RoleInput): Promise<void> {
  if (!can(actor, "roles.manage")) throw new ServiceError("You are not allowed to manage roles.");
  const role = await queryOne<{ id: number; key: string; rank: number; is_system: boolean }>(
    "SELECT id, key, rank, is_system FROM roles WHERE id = $1",
    [roleId],
  );
  if (!role) throw new ServiceError("Role not found.");
  if (role.key === SUPER_ADMIN_ROLE) throw new ServiceError("The Super Admin role always has every permission and cannot be changed.");
  if (!outranks(actor, role)) throw new ServiceError("You can only change roles ranked below your own.");
  if (role.id === actor.role.id) throw new ServiceError("You cannot change your own role's permissions.");
  if (!actor.isSuperAdmin && input.rank >= actor.role.rank) throw new ServiceError("The role must rank below your own role.", "rank");
  if (input.rank >= 1000) throw new ServiceError("Rank must be below 1000 (reserved for Super Admin).", "rank");
  checkGrantable(actor, input.permissions);
  try {
    await withTransaction(async (client) => {
      await client.query("UPDATE roles SET name = $2, description = $3, rank = $4 WHERE id = $1", [
        roleId, input.name, input.description, input.rank,
      ]);
      await client.query("DELETE FROM role_permissions WHERE role_id = $1", [roleId]);
      for (const p of input.permissions) {
        await client.query("INSERT INTO role_permissions (role_id, permission_key) VALUES ($1, $2)", [roleId, p]);
      }
      await audit({ actorId: actor.id, action: "role.updated", targetType: "role", targetId: roleId, metadata: { name: input.name, rank: input.rank, permissions: input.permissions } }, client);
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") throw new ServiceError("A role with this name already exists.", "name");
    throw err;
  }
}

export async function deleteRole(actor: SessionUser, roleId: number): Promise<void> {
  if (!can(actor, "roles.manage")) throw new ServiceError("You are not allowed to manage roles.");
  const role = await queryOne<{ id: number; key: string; name: string; rank: number; is_system: boolean; users: number }>(
    "SELECT r.id, r.key, r.name, r.rank, r.is_system, (SELECT count(*)::int FROM users WHERE role_id = r.id) AS users FROM roles r WHERE r.id = $1",
    [roleId],
  );
  if (!role) throw new ServiceError("Role not found.");
  if (role.is_system) throw new ServiceError("Built-in roles cannot be deleted.");
  if (!outranks(actor, role)) throw new ServiceError("You can only delete roles ranked below your own.");
  if (role.users > 0) throw new ServiceError(`Move the ${role.users} user(s) with this role to another role first.`);
  await getPool().query("DELETE FROM roles WHERE id = $1", [roleId]);
  await audit({ actorId: actor.id, action: "role.deleted", targetType: "role", targetId: roleId, metadata: { name: role.name } });
}
