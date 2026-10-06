"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppWindow, KeySquare, LayoutDashboard, ScrollText, Settings, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const ICONS = {
  overview: LayoutDashboard,
  users: Users,
  applications: AppWindow,
  access: KeySquare,
  roles: ShieldCheck,
  settings: Settings,
  audit: ScrollText,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function AdminNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Admin sections">
      {/* Mobile: horizontal tabs */}
      <ul className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 pb-px lg:hidden">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium",
                  isActive(item.href) ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Desktop: sidebar */}
      <ul className="hidden space-y-0.5 lg:block">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-brand-600 text-white shadow-sm shadow-brand-900/20" : "text-ink-2 hover:bg-surface hover:text-ink",
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
