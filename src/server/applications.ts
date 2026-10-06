import "server-only";
import { pgConstraint, pgErrorCode, query, queryOne, withTransaction, type Db } from "./db";
import { ServiceError } from "./errors";
import { audit } from "./audit";
import { deleteFile, removeFileRow, removeStoredObjects, storeImage } from "./files";
import type { SessionUser } from "./session";
import { appBaseUrl } from "./config";
import { can } from "@/lib/permissions";
import { slugify } from "@/lib/validation";

export type AppRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  url: string;
  logoFileId: string | null;
  logoUrl: string | null;
  icon: string;
  accentColor: string;
  category: string | null;
  requiredRoleId: number | null;
  requiredRoleName: string | null;
  isActive: boolean;
  displayOrder: number;
  openInNewTab: boolean;
  autoGrant: boolean;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
};

const APP_COLUMNS = `
  a.id, a.slug, a.name, a.description, a.url, a.logo_file_id, a.icon, a.accent_color, a.category,
  a.required_role_id, rr.name AS required_role_name, a.is_active, a.display_order, a.open_in_new_tab,
  a.auto_grant, a.created_at, a.updated_at,
  (SELECT count(*)::int FROM user_applications ua WHERE ua.application_id = a.id) AS user_count`;

type AppRow = {
  id: string; slug: string; name: string; description: string; url: string; logo_file_id: string | null;
  icon: string; accent_color: string; category: string | null; required_role_id: number | null;
  required_role_name: string | null; is_active: boolean; display_order: number; open_in_new_tab: boolean;
  auto_grant: boolean; created_at: Date; updated_at: Date; user_count: number;
};

function mapApp(r: AppRow): AppRecord {
  return {
    id: r.id, slug: r.slug, name: r.name, description: r.description, url: r.url,
    logoFileId: r.logo_file_id, logoUrl: r.logo_file_id ? `/api/files/${r.logo_file_id}` : null,
    icon: r.icon, accentColor: r.accent_color, category: r.category, requiredRoleId: r.required_role_id,
    requiredRoleName: r.required_role_name, isActive: r.is_active, displayOrder: r.display_order,
    openInNewTab: r.open_in_new_tab, autoGrant: r.auto_grant, createdAt: r.created_at, updatedAt: r.updated_at,
    userCount: r.user_count,
  };
}

const ORDER = "ORDER BY a.display_order, lower(a.name), a.id";

export async function listApplications(): Promise<AppRecord[]> {
  const rows = await query<AppRow>(
    `SELECT ${APP_COLUMNS} FROM applications a LEFT JOIN roles rr ON rr.id = a.required_role_id ${ORDER}`,
  );
  return rows.map(mapApp);
}

export async function getApplication(id: string): Promise<AppRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const row = await queryOne<AppRow>(
    `SELECT ${APP_COLUMNS} FROM applications a LEFT JOIN roles rr ON rr.id = a.required_role_id WHERE a.id = $1`,
    [id],
  );
  return row ? mapApp(row) : null;
}

/**
 * The single access rule, evaluated in the database:
 *   application is active
 *   AND (user is Super Admin OR the application is assigned to the user)
 *   AND (no required role OR the user's role ranks at least as high).
 */
const ACCESS_RULE = `
  a.is_active
  AND ($2::boolean OR EXISTS (SELECT 1 FROM user_applications ua WHERE ua.user_id = $1 AND ua.application_id = a.id))
  AND (a.required_role_id IS NULL OR $2::boolean OR rr.rank <= $3::int)`;

export async function accessibleApplications(user: SessionUser): Promise<AppRecord[]> {
  const rows = await query<AppRow>(
    `SELECT ${APP_COLUMNS} FROM applications a LEFT JOIN roles rr ON rr.id = a.required_role_id
     WHERE ${ACCESS_RULE} ${ORDER}`,
    [user.id, user.isSuperAdmin, user.role.rank],
  );
  return rows.map(mapApp);
}

export type LaunchDecision =
  | { ok: true; app: AppRecord; target: string }
  | { ok: false; reason: "not_found" | "disabled" | "forbidden"; appName?: string };

/** Server-side authorization for opening an application. */
export async function resolveLaunch(user: SessionUser, slug: string): Promise<LaunchDecision> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return { ok: false, reason: "not_found" };
  const row = await queryOne<AppRow & { allowed: boolean }>(
    `SELECT ${APP_COLUMNS}, (${ACCESS_RULE}) AS allowed
     FROM applications a LEFT JOIN roles rr ON rr.id = a.required_role_id WHERE a.slug = $4`,
    [user.id, user.isSuperAdmin, user.role.rank, slug],
  );
  if (!row) return { ok: false, reason: "not_found" };
  if (!row.is_active) return { ok: false, reason: "disabled", appName: row.name };
  if (!row.allowed) return { ok: false, reason: "forbidden", appName: row.name };
  const target = row.url.startsWith("/") ? new URL(row.url, appBaseUrl()).toString() : row.url;
  return { ok: true, app: mapApp(row), target };
}

export type AppInput = {
  name: string;
  slug?: string;
  description: string;
  url: string;
  icon: string;
  accentColor: string;
  category: string | null;
  requiredRoleId: number | null;
  isActive: boolean;
  openInNewTab: boolean;
  autoGrant: boolean;
};

export type LogoChange = { action: "keep" } | { action: "remove" } | { action: "replace"; file: File };

async function uniqueSlug(db: Db, wanted: string, excludeId?: string): Promise<string> {
  const base = slugify(wanted) || "app";
  for (let i = 1; i < 100; i++) {
    const candidate = i === 1 ? base : `${base.slice(0, 56)}-${i}`;
    const taken = await queryOne("SELECT 1 FROM applications WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2)", [candidate, excludeId ?? null], db);
    if (!taken) return candidate;
  }
  throw new ServiceError("Could not find a free short name. Enter one yourself.", "slug");
}

async function checkRequiredRole(db: Db, roleId: number | null) {
  if (roleId == null) return;
  const role = await queryOne("SELECT 1 FROM roles WHERE id = $1", [roleId], db);
  if (!role) throw new ServiceError("Choose a valid role.", "requiredRoleId");
}

function translateDbError(err: unknown): never {
  if (pgErrorCode(err) === "23505" && pgConstraint(err)?.includes("slug")) {
    throw new ServiceError("Another application already uses this short name.", "slug");
  }
  throw err;
}

export async function createApplication(actor: SessionUser, input: AppInput, logo: File | null): Promise<string> {
  if (!can(actor, "applications.manage")) throw new ServiceError("You are not allowed to manage applications.");
  // Store the logo first (outside the transaction); undo it if saving fails.
  const logoId = logo ? await storeImage(logo, "app_logo", actor.id) : null;
  try {
    return await withTransaction(async (client) => {
      await checkRequiredRole(client, input.requiredRoleId);
      const slug = input.slug ? input.slug : await uniqueSlug(client, input.name);
      const row = await client.query<{ id: string }>(
        `INSERT INTO applications (slug, name, description, url, logo_file_id, icon, accent_color, category,
            required_role_id, is_active, open_in_new_tab, auto_grant, display_order, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 (SELECT COALESCE(max(display_order), 0) + 1 FROM applications), $13, $13)
         RETURNING id`,
        [slug, input.name, input.description, input.url, logoId, input.icon, input.accentColor, input.category,
          input.requiredRoleId, input.isActive, input.openInNewTab, input.autoGrant, actor.id],
      );
      const id = row.rows[0].id;
      await audit({ actorId: actor.id, action: "application.created", targetType: "application", targetId: id, metadata: { name: input.name, slug, url: input.url } }, client);
      return id;
    });
  } catch (err) {
    if (logoId) await deleteFile(logoId).catch(() => undefined);
    translateDbError(err);
  }
}

export async function updateApplication(actor: SessionUser, id: string, input: AppInput, logo: LogoChange): Promise<void> {
  if (!can(actor, "applications.manage")) throw new ServiceError("You are not allowed to manage applications.");
  const newLogoId = logo.action === "replace" ? await storeImage(logo.file, "app_logo", actor.id) : null;
  let oldObjectKey: string | null = null;
  try {
    await withTransaction(async (client) => {
      const current = await queryOne<{ id: string; logo_file_id: string | null; slug: string; url: string; is_active: boolean }>(
        "SELECT id, logo_file_id, slug, url, is_active FROM applications WHERE id = $1 FOR UPDATE",
        [id],
        client,
      );
      if (!current) throw new ServiceError("Application not found.");
      await checkRequiredRole(client, input.requiredRoleId);
      const slug = input.slug || current.slug;
      const logoId = logo.action === "keep" ? current.logo_file_id : newLogoId;
      await client.query(
        `UPDATE applications SET slug = $2, name = $3, description = $4, url = $5, logo_file_id = $6, icon = $7,
           accent_color = $8, category = $9, required_role_id = $10, is_active = $11, open_in_new_tab = $12,
           auto_grant = $13, updated_by = $14
         WHERE id = $1`,
        [id, slug, input.name, input.description, input.url, logoId, input.icon, input.accentColor, input.category,
          input.requiredRoleId, input.isActive, input.openInNewTab, input.autoGrant, actor.id],
      );
      if (logo.action !== "keep" && current.logo_file_id) {
        oldObjectKey = await removeFileRow(current.logo_file_id, client);
      }
      await audit({
        actorId: actor.id, action: "application.updated", targetType: "application", targetId: id,
        metadata: {
          name: input.name, slug,
          ...(current.url !== input.url ? { url: input.url, previousUrl: current.url } : {}),
          ...(current.is_active !== input.isActive ? { isActive: input.isActive } : {}),
          ...(logo.action !== "keep" ? { logo: logo.action } : {}),
        },
      }, client);
    });
  } catch (err) {
    if (newLogoId) await deleteFile(newLogoId).catch(() => undefined);
    translateDbError(err);
  }
  await removeStoredObjects([oldObjectKey]);
}

export async function setApplicationActive(actor: SessionUser, id: string, active: boolean): Promise<void> {
  if (!can(actor, "applications.manage")) throw new ServiceError("You are not allowed to manage applications.");
  const row = await queryOne<{ name: string }>(
    "UPDATE applications SET is_active = $2, updated_by = $3 WHERE id = $1 RETURNING name",
    [id, active, actor.id],
  );
  if (!row) throw new ServiceError("Application not found.");
  await audit({ actorId: actor.id, action: active ? "application.enabled" : "application.disabled", targetType: "application", targetId: id, metadata: { name: row.name } });
}

export async function deleteApplication(actor: SessionUser, id: string): Promise<void> {
  if (!can(actor, "applications.manage")) throw new ServiceError("You are not allowed to manage applications.");
  const key = await withTransaction(async (client) => {
    const row = await queryOne<{ name: string; slug: string; logo_file_id: string | null }>(
      "DELETE FROM applications WHERE id = $1 RETURNING name, slug, logo_file_id",
      [id],
      client,
    );
    if (!row) throw new ServiceError("Application not found.");
    const objectKey = await removeFileRow(row.logo_file_id, client);
    await audit({ actorId: actor.id, action: "application.deleted", targetType: "application", targetId: id, metadata: { name: row.name, slug: row.slug } }, client);
    return objectKey;
  });
  await removeStoredObjects([key]);
}

/**
 * Saves a new display order. `orderedIds` is the order shown to the admin;
 * applications missing from it (e.g. added by someone else meanwhile) keep
 * their relative order after the listed ones.
 */
export async function reorderApplications(actor: SessionUser, orderedIds: string[]): Promise<void> {
  if (!can(actor, "applications.manage")) throw new ServiceError("You are not allowed to manage applications.");
  const ids = orderedIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (new Set(ids).size !== ids.length) throw new ServiceError("The new order contains duplicates.");
  await withTransaction(async (client) => {
    const all = await client.query<{ id: string; slug: string }>(
      `SELECT a.id, a.slug FROM applications a ${ORDER} FOR UPDATE`,
    );
    const known = new Set(all.rows.map((r) => r.id));
    const listed = ids.filter((id) => known.has(id));
    const rest = all.rows.map((r) => r.id).filter((id) => !listed.includes(id));
    const final = [...listed, ...rest];
    await client.query(
      `UPDATE applications a SET display_order = o.ord
       FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, ord)
       WHERE a.id = o.id AND a.display_order IS DISTINCT FROM o.ord`,
      [final],
    );
    const slugById = new Map(all.rows.map((r) => [r.id, r.slug]));
    await audit({ actorId: actor.id, action: "application.reordered", targetType: "application", metadata: { order: final.map((id) => slugById.get(id)) } }, client);
  });
}

export async function applicationStats(): Promise<{ total: number; active: number }> {
  const row = await queryOne<{ total: number; active: number }>(
    "SELECT count(*)::int AS total, count(*) FILTER (WHERE is_active)::int AS active FROM applications",
  );
  return row ?? { total: 0, active: 0 };
}

