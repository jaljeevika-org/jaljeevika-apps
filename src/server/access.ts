import "server-only";
import { query, queryOne, withTransaction } from "./db";
import { ServiceError } from "./errors";
import { audit } from "./audit";
import type { SessionUser } from "./session";
import { can } from "@/lib/permissions";

export type AccessMatrix = {
  users: { id: string; name: string; email: string; isActive: boolean; roleKey: string; roleName: string; appIds: string[] }[];
  total: number;
  page: number;
  pageSize: number;
};

/** Users (paged, searchable) with the application ids each one may open. */
export async function accessMatrix(opts: { q?: string; page?: number; pageSize?: number }): Promise<AccessMatrix> {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 5), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const params: unknown[] = [];
  let where = "";
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    where = `WHERE (lower(u.name) LIKE $1 OR u.email LIKE $1)`;
  }
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM users u ${where}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query<{ id: string; name: string; email: string; is_active: boolean; role_key: string; role_name: string; app_ids: string[] }>(
    `SELECT u.id, u.name, u.email, u.is_active, r.key AS role_key, r.name AS role_name,
            COALESCE(ARRAY(SELECT application_id::text FROM user_applications ua WHERE ua.user_id = u.id), '{}') AS app_ids
     FROM users u JOIN roles r ON r.id = u.role_id ${where}
     ORDER BY r.rank DESC, lower(u.name)
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    users: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, isActive: r.is_active, roleKey: r.role_key, roleName: r.role_name, appIds: r.app_ids })),
    total: total?.n ?? 0,
    page,
    pageSize,
  };
}

export async function setAccess(actor: SessionUser, userId: string, applicationId: string, granted: boolean): Promise<void> {
  if (!can(actor, "access.manage")) throw new ServiceError("You are not allowed to manage application access.");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(applicationId)) throw new ServiceError("Invalid request.");
  await withTransaction(async (client) => {
    const target = await queryOne<{ email: string; role_key: string; role_rank: number }>(
      "SELECT u.email, r.key AS role_key, r.rank AS role_rank FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1",
      [userId],
      client,
    );
    const app = await queryOne<{ name: string }>("SELECT name FROM applications WHERE id = $1", [applicationId], client);
    if (!target || !app) throw new ServiceError("User or application not found.");
    if (granted) {
      await client.query(
        `INSERT INTO user_applications (user_id, application_id, granted_by) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, application_id) DO NOTHING`,
        [userId, applicationId, actor.id],
      );
    } else {
      await client.query("DELETE FROM user_applications WHERE user_id = $1 AND application_id = $2", [userId, applicationId]);
    }
    await audit({
      actorId: actor.id, action: granted ? "access.granted" : "access.revoked", targetType: "user", targetId: userId,
      metadata: { email: target.email, application: app.name, applicationId },
    }, client);
  });
}

/** Grant or revoke one application for every user at once. */
export async function setAccessForAll(actor: SessionUser, applicationId: string, granted: boolean): Promise<number> {
  if (!can(actor, "access.manage")) throw new ServiceError("You are not allowed to manage application access.");
  if (!/^[0-9a-f-]{36}$/i.test(applicationId)) throw new ServiceError("Invalid request.");
  return withTransaction(async (client) => {
    const app = await queryOne<{ name: string }>("SELECT name FROM applications WHERE id = $1", [applicationId], client);
    if (!app) throw new ServiceError("Application not found.");
    const result = granted
      ? await client.query(
          `INSERT INTO user_applications (user_id, application_id, granted_by)
           SELECT u.id, $1, $2 FROM users u ON CONFLICT (user_id, application_id) DO NOTHING`,
          [applicationId, actor.id],
        )
      : await client.query("DELETE FROM user_applications WHERE application_id = $1", [applicationId]);
    await audit({
      actorId: actor.id, action: granted ? "access.granted_all" : "access.revoked_all", targetType: "application", targetId: applicationId,
      metadata: { application: app.name, users: result.rowCount ?? 0 },
    }, client);
    return result.rowCount ?? 0;
  });
}
