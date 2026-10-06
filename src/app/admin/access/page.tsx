import type { Metadata } from "next";
import Link from "next/link";
import { KeySquare, Search } from "lucide-react";
import { adminPage, Forbidden } from "../guard";
import { accessMatrix } from "@/server/access";
import { listApplications } from "@/server/applications";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { AccessGrid } from "./access-grid";

export const metadata: Metadata = { title: "Access" };

export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { allowed } = await adminPage("access.manage");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const [matrix, apps] = await Promise.all([accessMatrix({ q, page, pageSize: 25 }), listApplications()]);

  return (
    <div>
      <PageHeader
        title="Application access"
        description="Tick a box to let a user open an application. Changes save immediately. Super Admins can always open every active application."
      />
      <form className="mb-4 flex gap-2" role="search">
        <label className="relative flex-1">
          <span className="sr-only">Search users</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Search name or email" className="field pl-9" type="search" />
        </label>
        <button className={buttonClass({ variant: "secondary" })} type="submit">Search</button>
      </form>
      {apps.length === 0 ? (
        <EmptyState icon={<KeySquare className="size-7" aria-hidden />} title="No applications yet" action={<Link href="/admin/applications/new" className={buttonClass()}>Add an application</Link>}>
          Add an application first, then decide who can open it.
        </EmptyState>
      ) : matrix.users.length === 0 ? (
        <EmptyState title="No users found">{q ? "Try a different search." : "Add users first."}</EmptyState>
      ) : (
        <AccessGrid
          users={matrix.users}
          apps={apps.map((a) => ({ id: a.id, name: a.name, logoUrl: a.logoUrl, icon: a.icon, accentColor: a.accentColor, isActive: a.isActive }))}
        />
      )}
      <Pagination page={matrix.page} pageSize={matrix.pageSize} total={matrix.total} params={{ q }} basePath="/admin/access" />
    </div>
  );
}
