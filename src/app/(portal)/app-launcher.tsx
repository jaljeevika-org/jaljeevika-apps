"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { AppTile } from "@/components/app-tile";
import { cn } from "@/lib/cn";

export type LauncherApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string | null;
  logoUrl: string | null;
  icon: string;
  accentColor: string;
  openInNewTab: boolean;
  host: string | null;
};

export function AppLauncher({ apps }: { apps: LauncherApp[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(apps.map((a) => a.category).filter((c): c is string => Boolean(c)))], [apps]);
  const showTools = apps.length > 6 || categories.length > 1;

  const visible = apps.filter((a) => {
    if (category && a.category !== category) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q);
  });

  return (
    <div>
      {showTools ? (
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {categories.length > 1 ? (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by category">
              {[null, ...categories].map((c) => (
                <button
                  key={c ?? "all"}
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                    category === c ? "bg-brand-600 text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink",
                  )}
                >
                  {c ?? "All"}
                </button>
              ))}
            </div>
          ) : <span />}
          <label className="relative block sm:w-72">
            <span className="sr-only">Search applications</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search applications" className="field pl-9" type="search" />
          </label>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-2">No applications match your search.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((app, i) => (
            <li key={app.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
              <a
                href={`/launch/${app.slug}`}
                target={app.openInNewTab ? "_blank" : undefined}
                rel={app.openInNewTab ? "noopener noreferrer" : undefined}
                className="card group flex h-full flex-col p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-900/5 dark:hover:border-brand-500/50"
                data-testid={`app-card-${app.slug}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <AppTile name={app.name} logoUrl={app.logoUrl} icon={app.icon} accentColor={app.accentColor} size={56} />
                  {app.category ? <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">{app.category}</span> : null}
                </div>
                <h3 className="mt-4 text-[17px] font-semibold leading-snug text-ink">{app.name}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-sm leading-relaxed text-ink-2">{app.description || " "}</p>
                <div className="mt-5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-ink-3">{app.host ?? "Jaljeevika portal"}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors group-hover:bg-brand-700">
                    Open app
                    <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
                    {app.openInNewTab ? <span className="sr-only">(opens in a new tab)</span> : null}
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
