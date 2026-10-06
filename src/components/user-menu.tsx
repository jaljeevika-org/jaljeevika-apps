"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, LayoutGrid, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { Avatar } from "./ui";
import { cn } from "@/lib/cn";

export function UserMenu({
  name, email, roleName, showAdmin, logoutAction,
}: { name: string; email: string; roleName: string; showAdmin: boolean; logoutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-surface-2"
      >
        <Avatar name={name} className="size-8 text-xs" />
        <span className="hidden max-w-[160px] truncate text-sm font-medium text-ink sm:block">{name}</span>
        <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={menuId} role="menu" className="absolute right-0 top-full z-50 mt-2 w-64 animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface shadow-xl shadow-slate-900/10">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-ink-2">{email}</p>
            <p className="mt-1 text-xs font-medium text-brand-600 dark:text-brand-300">{roleName}</p>
          </div>
          <div className="p-1.5">
            <Link role="menuitem" href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2">
              <LayoutGrid className="size-4 text-ink-3" aria-hidden /> My applications
            </Link>
            <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2">
              <UserRound className="size-4 text-ink-3" aria-hidden /> Profile &amp; password
            </Link>
            {showAdmin ? (
              <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-surface-2">
                <ShieldCheck className="size-4 text-ink-3" aria-hidden /> Admin dashboard
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button role="menuitem" type="submit" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10">
                <LogOut className="size-4" aria-hidden /> Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
