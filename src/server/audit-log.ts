import "server-only";
import { query, queryOne } from "./db";

export type AuditRow = {
  id: number;
  createdAt: Date;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ip: string | null;
};

export async function listAudit(opts: { action?: string; q?: string; page?: number; pageSize?: number }) {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 10), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.action) {
    params.push(`${opts.action.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    where.push(`l.action LIKE $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    where.push(`(u.email LIKE $${params.length} OR lower(u.name) LIKE $${params.length} OR lower(l.metadata::text) LIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = await queryOne<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ${whereSql}`, params);
  params.push(pageSize, (page - 1) * pageSize);
  const rows = await query<{
    id: string; created_at: Date; action: string; name: string | null; email: string | null;
    target_type: string | null; target_id: string | null; metadata: Record<string, unknown>; ip: string | null;
  }>(
    `SELECT l.id, l.created_at, l.action, u.name, u.email, l.target_type, l.target_id, l.metadata, l.ip
     FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ${whereSql}
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    rows: rows.map<AuditRow>((r) => ({
      id: Number(r.id), createdAt: r.created_at, action: r.action, actorName: r.name, actorEmail: r.email,
      targetType: r.target_type, targetId: r.target_id, metadata: r.metadata ?? {}, ip: r.ip,
    })),
    total: total?.n ?? 0,
    page,
    pageSize,
  };
}

export async function recentLogins(limit = 8) {
  return query<{ created_at: Date; action: string; name: string | null; email: string | null; ip: string | null }>(
    `SELECT l.created_at, l.action, u.name, COALESCE(u.email, l.metadata->>'email') AS email, l.ip
     FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.action IN ('auth.login', 'auth.login_failed')
     ORDER BY l.created_at DESC LIMIT $1`,
    [limit],
  );
}

export async function launchStats(days = 30) {
  return query<{ name: string; launches: number }>(
    `SELECT COALESCE(a.name, l.metadata->>'application') AS name, count(*)::int AS launches
     FROM audit_logs l LEFT JOIN applications a ON a.id::text = l.target_id
     WHERE l.action = 'application.launched' AND l.created_at > now() - make_interval(days => $1)
     GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    [days],
  );
}
