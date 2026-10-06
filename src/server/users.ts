import "server-only";
import type { PoolClient } from "pg";
import { getPool, pgErrorCode, query, queryOne, withTransaction, type Db } from "./db";
import { hashPassword } from "./crypto";
import { ServiceError } from "./errors";
import { audit } from "./audit";
import { revokeUserSessions, type SessionUser } from "./session";
import { issuePasswordToken } from "./tokens";
import { currentBrand, isEmailConfigured, sendEmail, templates } from "./email";
import { requestMeta } from "./request";
import { can, canAssignRole, outranks, SUPER_ADMIN_ROLE, type RoleRef } from "@/lib/permissions";
import { passwordProblems } from "@/lib/password-policy";

export type UserListRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  emailVerified: boolean;
  mustChangePassword: boolean;
  hasPassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  role: RoleRef;
  appCount: number;
};

export type UserFilters = { q?: string; roleId?: number; status?: "active" | "disabled" | "unverified"; page?: number; pageSize?: number };

const USER_COLUMNS = `
  u.id, u.name, u.email, u.is_active, u.email_verified, u.must_change_password,
  (u.password_hash IS NOT NULL) AS has_password, u.last_login_at, u.created_at,
  r.id AS role_id, r.key AS role_key, r.name AS role_name, r.rank AS role_rank,
  (SELECT count(*)::int FROM user_applications ua WHERE ua.user_id = u.id) AS app_count`;

type UserDbRow = {
  id: string; name: string; email: string; is_active: boolean; email_verified: boolean; must_change_password: boolean;
  has_password: boolean; last_login_at: Date | null; created_at: Date;
  role_id: number; role_key: string; role_name: string; role_rank: number; app_count: number;
};

function mapUser(r: UserDbRow): UserListRow {
  return {
    id: r.id, name: r.name, email: r.email, isActive: r.is_active, emailVerified: r.email_verified,
    mustChangePassword: r.must_change_password, hasPassword: r.has_password, lastLoginAt: r.last_login_at,
    createdAt: r.created_at, appCount: r.app_count,
    role: { id: r.role_id, key: r.role_key, name: r.role_name, rank: r.role_rank },
  };
}

export async function listUsers(filters: UserFilters): Promise<{ rows: UserListRow[]; total: number; page: number; pageSize: number }> {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 5), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.q) {
    params.push(`%${filters.q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    where.push(`(lower(u.name) LIKE $${params.length} OR u.email LIKE $${params.length})`);
  }
  if (filters.roleId) {
    params.push(filters.roleId);
    where.push(`u.role_id = $${params.length}`);
  }
  if (filters.status === "active") where.push("u.is_active");
  if (filters.status === "disabled") where.push("NOT u.is_active");
  if (filters.status === "unverified") where.push("NOT u.email_verified");
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM users u ${whereSql}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query<UserDbRow>(
    `SELECT ${USER_COLUMNS} FROM users u JOIN roles r ON r.id = u.role_id ${whereSql}
     ORDER BY r.rank DESC, lower(u.name), u.email
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows: rows.map(mapUser), total: total?.n ?? 0, page, pageSize };
}

export async function getUser(id: string): Promise<(UserListRow & { appIds: string[]; activeSessions: number }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await queryOne<UserDbRow & { app_ids: string[]; active_sessions: number }>(
    `SELECT ${USER_COLUMNS},
       COALESCE(ARRAY(SELECT application_id::text FROM user_applications WHERE user_id = u.id), '{}') AS app_ids,
       (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS active_sessions
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [id],
  );
  return row ? { ...mapUser(row), appIds: row.app_ids, activeSessions: row.active_sessions } : null;
}

export type LoginUser = {
  id: string; name: string; email: string; password_hash: string | null; is_active: boolean;
  email_verified: boolean; must_change_password: boolean;
};

export async function findUserByEmail(email: string, db: Db = getPool()): Promise<LoginUser | null> {
  return queryOne<LoginUser>(
    `SELECT id, name, email, password_hash, is_active, email_verified, must_change_password
     FROM users WHERE email = $1`,
    [email.trim().toLowerCase()],
    db,
  );
}

/** Applications flagged "give new users access automatically". */
export async function grantAutoApps(userId: string, grantedBy: string | null, db: Db): Promise<void> {
  await db.query(
    `INSERT INTO user_applications (user_id, application_id, granted_by)
     SELECT $1, id, $2 FROM applications WHERE auto_grant
     ON CONFLICT (user_id, application_id) DO NOTHING`,
    [userId, grantedBy],
  );
}

async function assertKeepsASuperAdmin(client: PoolClient, userId: string): Promise<void> {
  // Lock all active super admins so two admins cannot demote each other at once.
  const rows = await client.query<{ id: string }>(
    `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.key = $1 AND u.is_active FOR UPDATE OF u`,
    [SUPER_ADMIN_ROLE],
  );
  const others = rows.rows.filter((r) => r.id !== userId);
  if (others.length === 0) {
    throw new ServiceError("This is the last active Super Admin. Make someone else Super Admin first.");
  }
}

async function loadTarget(client: Db, userId: string) {
  const target = await queryOne<{ id: string; name: string; email: string; is_active: boolean; role_id: number; role_key: string; role_rank: number }>(
    `SELECT u.id, u.name, u.email, u.is_active, u.role_id, r.key AS role_key, r.rank AS role_rank
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1 FOR UPDATE OF u`,
    [userId],
    client,
  );
  if (!target) throw new ServiceError("User not found.");
  return target;
}

function assertCanManage(actor: SessionUser, target: { id: string; role_key: string; role_rank: number }) {
  if (!can(actor, "users.manage")) throw new ServiceError("You are not allowed to manage users.");
  if (target.id !== actor.id && !outranks(actor, { key: target.role_key, rank: target.role_rank })) {
    throw new ServiceError("You can only manage users whose role is below yours.");
  }
}

async function loadAssignableRole(actor: SessionUser, roleId: number, db: Db): Promise<RoleRef> {
  const role = await queryOne<RoleRef>("SELECT id, key, name, rank FROM roles WHERE id = $1", [roleId], db);
  if (!role) throw new ServiceError("Choose a valid role.", "roleId");
  if (!canAssignRole(actor, role)) throw new ServiceError("You cannot give someone a role equal to or above your own.", "roleId");
  return role;
}

async function setUserApps(client: PoolClient, userId: string, appIds: string[], actorId: string): Promise<{ added: number; removed: number }> {
  const unique = [...new Set(appIds)].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const removed = await client.query(
    "DELETE FROM user_applications WHERE user_id = $1 AND NOT (application_id = ANY($2::uuid[]))",
    [userId, unique],
  );
  const added = await client.query(
    `INSERT INTO user_applications (user_id, application_id, granted_by)
     SELECT $1, a.id, $3 FROM applications a WHERE a.id = ANY($2::uuid[])
     ON CONFLICT (user_id, application_id) DO NOTHING`,
    [userId, unique, actorId],
  );
  return { added: added.rowCount ?? 0, removed: removed.rowCount ?? 0 };
}

export type CreateUserInput = {
  name: string;
  email: string;
  roleId: number;
  appIds: string[];
  onboarding: "invite" | "password";
  password?: string;
  mustChangePassword: boolean;
  emailVerified: boolean;
};

export async function createUser(actor: SessionUser, input: CreateUserInput): Promise<{ id: string; inviteSent: boolean }> {
  if (!can(actor, "users.manage")) throw new ServiceError("You are not allowed to add users.");
  if (input.onboarding === "password") {
    const problems = passwordProblems(input.password ?? "", { email: input.email, name: input.name });
    if (problems.length) throw new ServiceError(problems[0], "password");
  } else if (!isEmailConfigured()) {
    throw new ServiceError("Email is not configured, so an invitation cannot be sent. Set a temporary password instead.", "onboarding");
  }
  const passwordHash = input.onboarding === "password" ? await hashPassword(input.password!) : null;
  const meta = await requestMeta();

  let invite: { url: string; minutes: number } | null = null;
  let id: string;
  try {
    id = await withTransaction(async (client) => {
      await loadAssignableRole(actor, input.roleId, client);
      const row = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, role_id, email_verified, email_verified_at,
                            must_change_password, password_changed_at, created_by)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN now() END, $6, CASE WHEN $3::text IS NOT NULL THEN now() END, $7)
         RETURNING id`,
        [
          input.name, input.email, passwordHash, input.roleId,
          // An invited user proves ownership of the address by using the link.
          input.onboarding === "invite" ? false : input.emailVerified,
          input.onboarding === "password" ? input.mustChangePassword : false,
          actor.id,
        ],
      );
      const userId = row.rows[0].id;
      if (can(actor, "access.manage")) await setUserApps(client, userId, input.appIds, actor.id);
      await grantAutoApps(userId, actor.id, client);
      if (input.onboarding === "invite") invite = await issuePasswordToken(userId, "invite", meta.ip, client);
      await audit({
        actorId: actor.id, action: "user.created", targetType: "user", targetId: userId,
        metadata: { email: input.email, roleId: input.roleId, onboarding: input.onboarding, apps: input.appIds.length },
      }, client);
      return userId;
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") throw new ServiceError("A user with this email already exists.", "email");
    throw err;
  }

  let inviteSent = false;
  if (invite) {
    const { url, minutes } = invite as { url: string; minutes: number };
    const brand = await currentBrand();
    inviteSent = await sendEmail(templates.inviteEmail(brand, input.email, input.name, url, Math.round(minutes / 60), actor.name), "invite");
  }
  return { id, inviteSent };
}

export type UpdateUserInput = {
  name: string;
  email: string;
  roleId: number;
  emailVerified: boolean;
  appIds?: string[];
};

export async function updateUser(actor: SessionUser, userId: string, input: UpdateUserInput): Promise<void> {
  try {
    await withTransaction(async (client) => {
      const target = await loadTarget(client, userId);
      assertCanManage(actor, target);
      const roleChanged = target.role_id !== input.roleId;
      if (roleChanged) {
        if (target.id === actor.id) throw new ServiceError("You cannot change your own role.", "roleId");
        await loadAssignableRole(actor, input.roleId, client);
        if (target.role_key === SUPER_ADMIN_ROLE) await assertKeepsASuperAdmin(client, userId);
      }
      const emailChanged = target.email !== input.email;
      await client.query(
        `UPDATE users SET name = $2, email = $3, role_id = $4,
           email_verified = $5,
           email_verified_at = CASE WHEN $5 THEN COALESCE(CASE WHEN $6 THEN NULL ELSE email_verified_at END, now()) ELSE NULL END
         WHERE id = $1`,
        [userId, input.name, input.email, input.roleId, input.emailVerified, emailChanged],
      );
      if (emailChanged) {
        // Links already mailed to the old address must stop working.
        await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
        await client.query("UPDATE email_verification_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
      }
      let access: { added: number; removed: number } | undefined;
      if (input.appIds && can(actor, "access.manage")) access = await setUserApps(client, userId, input.appIds, actor.id);
      await audit({
        actorId: actor.id, action: "user.updated", targetType: "user", targetId: userId,
        metadata: {
          email: input.email,
          ...(emailChanged ? { previousEmail: target.email } : {}),
          ...(roleChanged ? { roleId: input.roleId, previousRoleId: target.role_id } : {}),
          ...(access ? { appsAdded: access.added, appsRemoved: access.removed } : {}),
        },
      }, client);
    });
  } catch (err) {
    if (pgErrorCode(err) === "23505") throw new ServiceError("Another user already has this email.", "email");
    throw err;
  }
}

export async function setUserActive(actor: SessionUser, userId: string, active: boolean): Promise<void> {
  await withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    if (target.id === actor.id) throw new ServiceError("You cannot disable your own account.");
    assertCanManage(actor, target);
    if (!active && target.role_key === SUPER_ADMIN_ROLE) await assertKeepsASuperAdmin(client, userId);
    await client.query("UPDATE users SET is_active = $2 WHERE id = $1", [userId, active]);
    if (!active) await revokeUserSessions(userId, undefined, client);
    await audit({ actorId: actor.id, action: active ? "user.enabled" : "user.disabled", targetType: "user", targetId: userId, metadata: { email: target.email } }, client);
  });
}

export async function deleteUser(actor: SessionUser, userId: string): Promise<void> {
  await withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    if (target.id === actor.id) throw new ServiceError("You cannot delete your own account.");
    assertCanManage(actor, target);
    if (target.role_key === SUPER_ADMIN_ROLE) await assertKeepsASuperAdmin(client, userId);
    // Record first: the audit row keeps the email after the user is gone.
    await audit({ actorId: actor.id, action: "user.deleted", targetType: "user", targetId: userId, metadata: { email: target.email, name: target.name } }, client);
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
  });
}

/** Admin sets a password for someone else (optionally forcing a change at next sign-in). */
export async function adminSetPassword(actor: SessionUser, userId: string, password: string, mustChange: boolean): Promise<void> {
  await withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    if (target.id === actor.id) throw new ServiceError("Use your profile page to change your own password.");
    assertCanManage(actor, target);
    const problems = passwordProblems(password, { email: target.email, name: target.name });
    if (problems.length) throw new ServiceError(problems[0], "password");
    await client.query(
      `UPDATE users SET password_hash = $2, must_change_password = $3, password_changed_at = now() WHERE id = $1`,
      [userId, await hashPassword(password), mustChange],
    );
    await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
    await revokeUserSessions(userId, undefined, client);
    await audit({ actorId: actor.id, action: "user.password_set_by_admin", targetType: "user", targetId: userId, metadata: { email: target.email, mustChange } }, client);
  });
}

/** Admin emails someone a reset (or, if they never set a password, an invitation) link. */
export async function adminSendPasswordLink(actor: SessionUser, userId: string): Promise<boolean> {
  if (!isEmailConfigured()) throw new ServiceError("Email is not configured. Set a password for the user instead.");
  const meta = await requestMeta();
  const result = await withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    assertCanManage(actor, target);
    if (!target.is_active) throw new ServiceError("Enable the account before sending a password link.");
    const hasPassword = await queryOne<{ has: boolean }>("SELECT password_hash IS NOT NULL AS has FROM users WHERE id = $1", [userId], client);
    const purpose = hasPassword?.has ? "reset" : "invite";
    const link = await issuePasswordToken(userId, purpose, meta.ip, client);
    await audit({ actorId: actor.id, action: "user.password_link_sent", targetType: "user", targetId: userId, metadata: { email: target.email, purpose } }, client);
    return { target, link, purpose };
  });
  const brand = await currentBrand();
  const mail = result.purpose === "reset"
    ? templates.passwordResetEmail(brand, result.target.email, result.target.name, result.link.url, result.link.minutes)
    : templates.inviteEmail(brand, result.target.email, result.target.name, result.link.url, Math.round(result.link.minutes / 60), actor.name);
  return sendEmail(mail, result.purpose);
}

export async function adminRevokeSessions(actor: SessionUser, userId: string): Promise<number> {
  return withTransaction(async (client) => {
    const target = await loadTarget(client, userId);
    assertCanManage(actor, target);
    const n = await revokeUserSessions(userId, target.id === actor.id ? actor.sessionId : undefined, client);
    await audit({ actorId: actor.id, action: "user.sessions_revoked", targetType: "user", targetId: userId, metadata: { email: target.email, sessions: n } }, client);
    return n;
  });
}

export async function userStats(): Promise<{ total: number; active: number; disabled: number; admins: number }> {
  const row = await queryOne<{ total: number; active: number; disabled: number; admins: number }>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE u.is_active)::int AS active,
            count(*) FILTER (WHERE NOT u.is_active)::int AS disabled,
            count(*) FILTER (WHERE r.key <> 'user')::int AS admins
     FROM users u JOIN roles r ON r.id = u.role_id`,
  );
  return row ?? { total: 0, active: 0, disabled: 0, admins: 0 };
}
