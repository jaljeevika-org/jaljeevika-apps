import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonClass } from "./ui";

export function Pagination({
  page, pageSize, total, params, basePath,
}: { page: number; pageSize: number; total: number; params: Record<string, string>; basePath: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm text-ink-2" aria-label="Pagination">
      <span>Page {page} of {pages}</span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass({ variant: "secondary", size: "sm" })}><ChevronLeft className="size-4" aria-hidden />Previous</Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass({ variant: "secondary", size: "sm" })}>Next<ChevronRight className="size-4" aria-hidden /></Link>
        ) : null}
      </div>
    </nav>
  );
}
