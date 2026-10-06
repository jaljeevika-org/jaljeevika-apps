import "server-only";
import { getPool, type Db } from "./db";
import { requestMeta } from "./request";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  targetType?: string;
  targetId?: string | number | null;
  /** Never put passwords, tokens or secrets here. */
  metadata?: Record<string, unknown>;
};

const FORBIDDEN_KEYS = /pass|token|secret|hash/i;

function scrub(metadata: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (FORBIDDEN_KEYS.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/** Writes an audit row. Failures are logged, never thrown, so auditing cannot break a request. */
export async function audit(entry: AuditEntry, db: Db = getPool()): Promise<void> {
  try {
    const meta = await requestMeta();
    await db.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.actorId,
        entry.action,
        entry.targetType ?? null,
        entry.targetId == null ? null : String(entry.targetId),
        JSON.stringify(scrub(entry.metadata ?? {})),
        meta.ip,
        meta.userAgent,
      ],
    );
  } catch (err) {
    console.error("[audit] failed to record", entry.action, (err as Error).message);
  }
}
