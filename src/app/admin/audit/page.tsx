import type { Metadata } from "next";
import { ScrollText, Search } from "lucide-react";
import { adminPage, Forbidden } from "../guard";
import { listAudit } from "@/server/audit-log";
import { Badge, Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { Pagination } from "@/components/pagination";
import { formatDateTime } from "@/lib/cn";

export const metadata: Metadata = { title: "Audit log" };

const GROUPS = [
  { value: "", label: "All activity" },
  { value: "auth.", label: "Sign-in & passwords" },
  { value: "user.", label: "Users" },
  { value: "application.", label: "Applications" },
  { value: "access.", label: "Access" },
  { value: "role.", label: "Roles" },
  { value: "settings.", label: "Settings" },
];

function tone(action: string): "red" | "green" | "amber" | "brand" | "neutral" {
  if (/failed|denied|rate_limited|deleted|disabled|revoked/.test(action)) return "red";
  if (/login$|created|granted|enabled|launched|accepted|verified/.test(action)) return "green";
  if (/password/.test(action)) return "amber";
  if (/updated|reordered/.test(action)) return "brand";
  return "neutral";
}

function describe(meta: Record<string, unknown>): string {
  return Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { allowed } = await adminPage("audit.view");
  if (!allowed) return <Forbidden />;
  const sp = await searchParams;
  const action = typeof sp.action === "string" ? sp.action.slice(0, 40) : "";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = typeof sp.page === "string" ? Number(sp.page) || 1 : 1;
  const result = await listAudit({ action, q, page, pageSize: 50 });

  return (
    <div>
      <PageHeader title="Audit log" description="Security and admin activity. Passwords and links are never recorded." />
      <form className="mb-4 grid gap-2 sm:grid-cols-[220px_1fr_auto]" role="search">
        <select name="action" defaultValue={action} className="field" aria-label="Activity type">
          {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Search user, email or details" className="field pl-9" type="search" />
        </label>
        <button className={buttonClass({ variant: "secondary" })} type="submit">Filter</button>
      </form>
      {result.rows.length === 0 ? (
        <EmptyState icon={<ScrollText className="size-7" aria-hidden />} title="No activity found" />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {result.rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-1.5 px-5 py-3 text-sm sm:flex-row sm:items-start sm:gap-4">
                <span className="w-44 shrink-0 text-xs text-ink-3 sm:pt-0.5">{formatDateTime(r.createdAt)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={tone(r.action)}>{r.action}</Badge>
                    <span className="truncate text-ink">{r.actorName ?? (typeof r.metadata.email === "string" ? r.metadata.email : "System / anonymous")}</span>
                    {r.actorEmail ? <span className="truncate text-xs text-ink-3">{r.actorEmail}</span> : null}
                  </div>
                  {Object.keys(r.metadata).length ? <p className="mt-1 break-words text-xs text-ink-2">{describe(r.metadata)}</p> : null}
                </div>
                {r.ip ? <span className="shrink-0 font-mono text-xs text-ink-3">{r.ip}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination page={result.page} pageSize={result.pageSize} total={result.total} params={{ action, q }} basePath="/admin/audit" />
    </div>
  );
}
