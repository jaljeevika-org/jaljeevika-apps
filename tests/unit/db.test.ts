import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/session";

/**
 * Database-level checks of the rules that matter most. They run against
 * TEST_DATABASE_URL (a local throwaway database, wiped by global-setup).
 */
const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("database rules", () => {
  let db: typeof import("@/server/db");
  let tokens: typeof import("@/server/tokens");
  let rate: typeof import("@/server/rate-limit");
  let apps: typeof import("@/server/applications");
  let users: typeof import("@/server/users");
  let roles: Record<string, { id: number; key: string; name: string; rank: number }>;
  let superAdmin: SessionUser;
  let admin: SessionUser;

  async function makeUser(name: string, roleKey: string): Promise<SessionUser> {
    const role = roles[roleKey];
    const row = await db.queryOne<{ id: string }>(
      "INSERT INTO users (name, email, password_hash, role_id, email_verified) VALUES ($1, $2, 'x', $3, true) RETURNING id",
      [name, `${name.toLowerCase().replace(/\W+/g, ".")}.${Date.now()}${Math.random().toString(36).slice(2, 6)}@t.local`, role.id],
    );
    const perms = await db.query<{ permission_key: string }>("SELECT permission_key FROM role_permissions WHERE role_id = $1", [role.id]);
    return {
      sessionId: "00000000-0000-0000-0000-000000000000", id: row!.id, name, email: `${name}@t.local`, emailVerified: true,
      mustChangePassword: false, role, permissions: perms.map((p) => p.permission_key), isSuperAdmin: roleKey === "super_admin",
    };
  }

  beforeAll(async () => {
    db = await import("@/server/db");
    tokens = await import("@/server/tokens");
    rate = await import("@/server/rate-limit");
    apps = await import("@/server/applications");
    users = await import("@/server/users");
    const rows = await db.query<{ id: number; key: string; name: string; rank: number }>("SELECT id, key, name, rank FROM roles");
    roles = Object.fromEntries(rows.map((r) => [r.key, r]));
    superAdmin = await makeUser("Super One", "super_admin");
    admin = await makeUser("Admin One", "admin");
  });

  afterAll(async () => {
    await db?.getPool().end();
  });

  it("a reset link works exactly once, even when used twice at the same moment", async () => {
    const u = await makeUser("Reset Race", "user");
    const { url } = await tokens.issuePasswordToken(u.id, "reset", null);
    const token = new URL(url).searchParams.get("token")!;
    expect(await tokens.findValidPasswordToken(token)).toMatchObject({ userId: u.id, purpose: "reset" });
    const attempt = () => db.withTransaction((c) => tokens.consumePasswordToken(token, c));
    const results = await Promise.all([attempt(), attempt(), attempt()]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await tokens.findValidPasswordToken(token)).toBeNull();
  });

  it("a newer link replaces older ones; expired links and disabled users are refused", async () => {
    const u = await makeUser("Reset Older", "user");
    const first = new URL((await tokens.issuePasswordToken(u.id, "reset", null)).url).searchParams.get("token")!;
    const second = new URL((await tokens.issuePasswordToken(u.id, "reset", null)).url).searchParams.get("token")!;
    expect(await tokens.findValidPasswordToken(first)).toBeNull();
    expect(await tokens.findValidPasswordToken(second)).not.toBeNull();

    await db.query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 second' WHERE user_id = $1", [u.id]);
    expect(await tokens.findValidPasswordToken(second)).toBeNull();
    expect(await db.withTransaction((c) => tokens.consumePasswordToken(second, c))).toBeNull();

    const third = new URL((await tokens.issuePasswordToken(u.id, "reset", null)).url).searchParams.get("token")!;
    await db.query("UPDATE users SET is_active = false WHERE id = $1", [u.id]);
    expect(await tokens.findValidPasswordToken(third)).toBeNull();
    expect(await db.withTransaction((c) => tokens.consumePasswordToken(third, c))).toBeNull();
  });

  it("an email confirmation link stops working if the address changes", async () => {
    const u = await makeUser("Verify Change", "user");
    const email = (await db.queryOne<{ email: string }>("SELECT email FROM users WHERE id = $1", [u.id]))!.email;
    const token = new URL((await tokens.issueEmailVerificationToken(u.id, email)).url).searchParams.get("token")!;
    await db.query("UPDATE users SET email = $2 WHERE id = $1", [u.id, `changed.${Date.now()}@t.local`]);
    expect(await tokens.consumeVerificationToken(token)).toBeNull();
  });

  it("rate limits count within a window and can give back an attempt", async () => {
    const key = `test:${Date.now()}`;
    for (let i = 1; i <= 3; i++) expect((await rate.hit(key, 3, 60)).allowed).toBe(true);
    expect((await rate.hit(key, 3, 60)).allowed).toBe(false);
    await rate.release(key);
    expect((await rate.peek(key, 4, 60)).count).toBe(3);
    await db.query("UPDATE rate_limits SET window_start = now() - interval '61 seconds' WHERE key = $1", [key]);
    expect(await rate.hit(key, 3, 60)).toMatchObject({ allowed: true, count: 1 });
    // Concurrent attempts are all counted (no lost updates).
    const k2 = `${key}:burst`;
    await Promise.all(Array.from({ length: 20 }, () => rate.hit(k2, 100, 60)));
    expect((await rate.peek(k2, 100, 60)).count).toBe(20);
  });

  it("access rule: active + assigned (or Super Admin) + minimum role", async () => {
    const id = await apps.createApplication(superAdmin, {
      name: "Rule GIS", slug: "rule-gis", description: "", url: "https://gis.example.org", icon: "map", accentColor: "teal",
      category: null, requiredRoleId: null, isActive: true, openInNewTab: true, autoGrant: false,
    }, null);
    const adminOnly = await apps.createApplication(superAdmin, {
      name: "Rule Admin", slug: "rule-admin", description: "", url: "/admin", icon: "settings", accentColor: "slate",
      category: null, requiredRoleId: roles.admin.id, isActive: true, openInNewTab: false, autoGrant: false,
    }, null);
    const worker = await makeUser("Rule Worker", "user");

    expect((await apps.resolveLaunch(worker, "rule-gis")).ok).toBe(false);
    await db.query("INSERT INTO user_applications (user_id, application_id) VALUES ($1, $2), ($1, $3)", [worker.id, id, adminOnly]);
    const ok = await apps.resolveLaunch(worker, "rule-gis");
    expect(ok).toMatchObject({ ok: true, target: "https://gis.example.org" });
    expect(await apps.resolveLaunch(worker, "rule-admin")).toMatchObject({ ok: false, reason: "forbidden" });
    expect((await apps.accessibleApplications(worker)).map((a) => a.slug)).toEqual(["rule-gis"]);

    // Relative URLs resolve against APP_BASE_URL.
    expect(await apps.resolveLaunch(superAdmin, "rule-admin")).toMatchObject({ ok: true, target: "https://app.jaljeevika.org/admin" });

    await apps.setApplicationActive(superAdmin, id, false);
    expect(await apps.resolveLaunch(worker, "rule-gis")).toMatchObject({ ok: false, reason: "disabled" });
    expect(await apps.resolveLaunch(superAdmin, "rule-gis")).toMatchObject({ ok: false, reason: "disabled" });
    expect(await apps.resolveLaunch(worker, "../../etc/passwd")).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("reordering keeps unknown and missing applications in a sensible order", async () => {
    const all = await apps.listApplications();
    const ids = all.map((a) => a.id);
    const reversed = [...ids].reverse();
    await apps.reorderApplications(superAdmin, [reversed[0], "11111111-1111-1111-1111-111111111111"]);
    const after = (await apps.listApplications()).map((a) => a.id);
    expect(after[0]).toBe(reversed[0]);
    expect(after.slice(1)).toEqual(ids.filter((id) => id !== reversed[0]));
    await expect(apps.reorderApplications(superAdmin, [ids[0], ids[0]])).rejects.toThrow(/duplicates/);
    await expect(apps.reorderApplications(await makeUser("Plain", "user"), ids)).rejects.toThrow(/not allowed/);
  });

  it("protects the last Super Admin and stops Admins from touching higher roles", async () => {
    // Make the earlier super admin the only active one.
    await db.query("UPDATE users SET is_active = false WHERE role_id = $1 AND id <> $2", [roles.super_admin.id, superAdmin.id]);
    const other = await makeUser("Super Two", "super_admin");
    await users.setUserActive(other, superAdmin.id, false); // allowed: Super Two remains
    await expect(users.setUserActive(superAdmin, other.id, false)).rejects.toThrow(/last active Super Admin/);
    await expect(users.deleteUser(superAdmin, other.id)).rejects.toThrow(/last active Super Admin/);
    await expect(users.updateUser(superAdmin, other.id, { name: "Super Two", email: `s2.${Date.now()}@t.local`, roleId: roles.user.id, emailVerified: true })).rejects.toThrow(/last active Super Admin/);
    await users.setUserActive(other, superAdmin.id, true);

    await expect(users.setUserActive(admin, superAdmin.id, false)).rejects.toThrow(/below yours/);
    await expect(users.adminSetPassword(admin, superAdmin.id, "Another-Long-Pass-1", false)).rejects.toThrow(/below yours/);
    const peer = await makeUser("Admin Two", "admin");
    await expect(users.deleteUser(admin, peer.id)).rejects.toThrow(/below yours/);
    await expect(
      users.createUser(admin, { name: "Escalate", email: `esc.${Date.now()}@t.local`, roleId: roles.super_admin.id, appIds: [], onboarding: "password", password: "Escalation-Pass-77", mustChangePassword: false, emailVerified: true }),
    ).rejects.toThrow(/role equal to or above/);
    await expect(users.setUserActive(admin, admin.id, false)).rejects.toThrow(/your own account/);

    const worker = await makeUser("Managed Worker", "user");
    await users.setUserActive(admin, worker.id, false);
    const row = await db.queryOne<{ is_active: boolean }>("SELECT is_active FROM users WHERE id = $1", [worker.id]);
    expect(row!.is_active).toBe(false);
  });

  it("duplicate emails are rejected case-insensitively", async () => {
    const email = `dup.${Date.now()}@t.local`;
    await users.createUser(superAdmin, { name: "Dup", email, roleId: roles.user.id, appIds: [], onboarding: "password", password: "Duplicate-Pass-12", mustChangePassword: true, emailVerified: true });
    await expect(
      users.createUser(superAdmin, { name: "Dup 2", email: email.toLowerCase(), roleId: roles.user.id, appIds: [], onboarding: "password", password: "Duplicate-Pass-12", mustChangePassword: true, emailVerified: true }),
    ).rejects.toThrow(/already exists/);
    await expect(db.query("INSERT INTO users (name, email, role_id) VALUES ('x', $1, $2)", [email.toUpperCase(), roles.user.id])).rejects.toThrow();
  });
});
