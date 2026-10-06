import type { Metadata } from "next";
import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { adminPage, Forbidden } from "../guard";
import { listUsers } from "@/server/users";
import { listRoles } from "@/server/roles";
import { can, outranks } from "@/lib/permissions";
import { Avatar, Badge, Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { timeAgo } from "@/lib/cn";
import { Pagination } from "@/components/pagination";

export const metadata: Metadata = { title: "Users" };

type Search = Record<string, string | string[] | undefined>;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { user, allowed } = await adminPage();
  if (!allowed || !(can(user, "users.view") || can(user, "users.manage"))) return <Forbidden />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const roleId = typeof sp.role === "string" ? Number(sp.role) || undefined : undefined;
  const status = sp.status === "active" || sp.status === "disabled" || sp.status === "unverified" ? sp.status : undefined;
  const page = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const [result, roles] = await Promise.all([listUsers({ q, roleId, status, page, pageSize: 20 }), listRoles()]);
  const canManage = can(user, "users.manage");
  const filtered = Boolean(q || roleId || status);

  return (
    <div>
      <PageHeader
        title="Users"
        description={`${result.total} user${result.total === 1 ? "" : "s"}${filtered ? " match your filters" : ""}`}
        actions={canManage ? <Link href="/admin/users/new" className={buttonClass()}><UserPlus className="size-4" aria-hidden />Add user</Link> : null}
      />

      <form className="mb-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" role="search">
        <label className="relative">
          <span className="sr-only">Search by name or email</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Search name or email" className="field pl-9" type="search" />
        </label>
        <select name="role" defaultValue={roleId ?? ""} className="field sm:w-40" aria-label="Filter by role">
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ""} className="field sm:w-40" aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="unverified">Email unconfirmed</option>
        </select>
        <button className={buttonClass({ variant: "secondary" })} type="submit">Filter</button>
      </form>

      {result.rows.length === 0 ? (
        <EmptyState icon={<Users className="size-7" aria-hidden />} title={filtered ? "No users match" : "No users yet"}>
          {filtered ? <Link href="/admin/users" className="text-brand-600 hover:underline">Clear filters</Link> : "Add the first user to get started."}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="border-b border-line bg-surface-2/60 text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Apps</th>
                  <th className="px-5 py-3 text-right">Last sign-in</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.rows.map((u) => {
                  const editable = canManage && (u.id === user.id || outranks(user, u.role));
                  return (
                    <tr key={u.id} className="hover:bg-surface-2/50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={u.name} />
                          <div className="min-w-0">
                            <Link href={`/admin/users/${u.id}`} className="block truncate font-semibold text-ink hover:text-brand-600">
                              {u.name}{u.id === user.id ? <span className="ml-1.5 text-xs font-normal text-ink-3">(you)</span> : null}
                            </Link>
                            <p className="truncate text-xs text-ink-2">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><Badge tone={u.role.key === "super_admin" ? "brand" : u.role.key === "user" ? "neutral" : "teal"}>{u.role.name}</Badge></td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
                          {!u.emailVerified ? <Badge tone="amber">Unconfirmed</Badge> : null}
                          {!u.hasPassword ? <Badge tone="amber">Invited</Badge> : u.mustChangePassword ? <Badge tone="amber">Temp. password</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-2">{u.role.key === "super_admin" ? "All" : u.appCount}</td>
                      <td className="px-5 py-3 text-right text-ink-2">
                        {timeAgo(u.lastLoginAt)}
                        {!editable ? <span className="sr-only"> (view only)</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={{ q, role: roleId ? String(roleId) : "", status: status ?? "" }} basePath="/admin/users" />
    </div>
  );
}
