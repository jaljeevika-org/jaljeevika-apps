import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn, initials } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

export function buttonClass({ variant = "primary", size = "md", full = false, className }: { variant?: Variant; size?: Size; full?: boolean; className?: string } = {}) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150",
    "disabled:pointer-events-none disabled:opacity-55 active:scale-[0.98]",
    size === "sm" && "h-8 px-3 text-[13px]",
    size === "md" && "h-10 px-4 text-sm",
    size === "lg" && "h-12 px-5 text-[15px]",
    variant === "primary" && "bg-brand-600 text-white shadow-sm shadow-brand-900/20 hover:bg-brand-700",
    variant === "secondary" && "border border-line bg-surface text-ink hover:border-brand-300 hover:bg-surface-2",
    variant === "ghost" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
    variant === "soft" && "bg-brand-50 text-brand-700 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-200 dark:hover:bg-brand-500/25",
    variant === "danger" && "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
    full && "w-full",
    className,
  );
}

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("card", className)} {...props} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const ALERT_STYLES = {
  error: { box: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200", Icon: CircleAlert },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200", Icon: CircleCheck },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200", Icon: TriangleAlert },
  info: { box: "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-100", Icon: Info },
} as const;

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof ALERT_STYLES; title?: string; children?: ReactNode; className?: string }) {
  const { box, Icon } = ALERT_STYLES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-surface-2 text-ink-2 ring-line",
  brand: "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  red: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  teal: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-500/30",
} as const;

export function Badge({ tone = "neutral", children, className }: { tone?: keyof typeof BADGE_TONES; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-water-600 text-[13px] font-semibold text-white",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center">
      {icon ? <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</div> : null}
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children ? <div className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-2">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Field({
  label, htmlFor, error, hint, children, className, optional,
}: { label: string; htmlFor: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string; optional?: boolean }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-sm font-medium text-ink">
        <span>{label}</span>
        {optional ? <span className="text-xs font-normal text-ink-3">Optional</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13px] text-rose-600 dark:text-rose-400">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

export function StatCard({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-ink-2">{label}</p>
          <p className="mt-1 text-[28px] font-bold tracking-tight text-ink tabular-nums">{value}</p>
        </div>
        {icon ? <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">{icon}</div> : null}
      </div>
      {hint ? <p className="mt-2 text-xs text-ink-3">{hint}</p> : null}
    </Card>
  );
}
