"use client";

import Link from "next/link";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ExternalLink, GripVertical, LoaderCircle, Pencil, Users } from "lucide-react";
import { reorderApplicationsAction, toggleApplicationAction } from "./actions";
import { AppTile } from "@/components/app-tile";
import { Badge, buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";

export type SortableApp = {
  id: string; slug: string; name: string; url: string; description: string; logoUrl: string | null; icon: string;
  accentColor: string; category: string | null; isActive: boolean; openInNewTab: boolean; requiredRoleName: string | null;
  userCount: number; autoGrant: boolean;
};

export function SortableApps({ initial, highlight }: { initial: SortableApp[]; highlight?: string }) {
  const [items, setItems] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const dndId = useId();

  // Server data changed (e.g. after a save elsewhere): adopt it.
  useEffect(() => setItems(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persist = (next: SortableApp[], previous: SortableApp[]) => {
    setItems(next);
    startSaving(async () => {
      const result = await reorderApplicationsAction(next.map((a) => a.id));
      if (result.error) {
        setItems(previous);
        toast.error(result.error);
      } else {
        toast.success("Order saved", { id: "order-saved", duration: 1800 });
      }
    });
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((a) => a.id === active.id);
    const to = items.findIndex((a) => a.id === over.id);
    if (from < 0 || to < 0) return;
    persist(arrayMove(items, from, to), items);
  };

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= items.length) return;
    persist(arrayMove(items, index, to), items);
  };

  const activeItem = items.find((a) => a.id === activeId) ?? null;

  return (
    <div>
      <div className="mb-3 flex h-5 items-center gap-2 text-xs text-ink-3" aria-live="polite">
        {saving ? (<><LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Saving order…</>) : <span>{items.length} application{items.length === 1 ? "" : "s"} · shown to users in this order</span>}
      </div>
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
        accessibility={{
          screenReaderInstructions: { draggable: "To reorder, press space or enter on the handle, use the arrow keys to move, then press space or enter again to drop, or escape to cancel." },
        }}
      >
        <SortableContext items={items.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2.5" data-testid="app-order-list">
            {items.map((app, index) => (
              <SortableRow
                key={app.id}
                app={app}
                index={index}
                count={items.length}
                highlighted={app.id === highlight}
                onMove={move}
              />
            ))}
          </ol>
        </SortableContext>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" }}>
          {activeItem ? <RowBody app={activeItem} index={items.findIndex((a) => a.id === activeItem.id)} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function SortableRow({
  app, index, count, highlighted, onMove,
}: { app: SortableApp; index: number; count: number; highlighted: boolean; onMove: (index: number, delta: number) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
      data-testid={`app-row-${app.slug}`}
    >
      {isDragging ? (
        // Placeholder where the row will land.
        <div className="h-[86px] rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 dark:border-brand-500/50 dark:bg-brand-500/5" />
      ) : (
        <RowBody
          app={app}
          index={index}
          highlighted={highlighted}
          handle={
            <button
              ref={setActivatorNodeRef}
              type="button"
              className="flex w-10 shrink-0 self-stretch cursor-grab touch-none items-center justify-center rounded-l-2xl text-ink-3 hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
              aria-label={`Drag to reorder ${app.name}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-5" aria-hidden />
            </button>
          }
          moveButtons={
            <div className="flex flex-col">
              <button type="button" onClick={() => onMove(index, -1)} disabled={index === 0} className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label={`Move ${app.name} up`}>
                <ArrowUp className="size-3.5" aria-hidden />
              </button>
              <button type="button" onClick={() => onMove(index, 1)} disabled={index === count - 1} className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label={`Move ${app.name} down`}>
                <ArrowDown className="size-3.5" aria-hidden />
              </button>
            </div>
          }
        />
      )}
    </li>
  );
}

function RowBody({
  app, index, overlay, highlighted, handle, moveButtons,
}: { app: SortableApp; index: number; overlay?: boolean; highlighted?: boolean; handle?: React.ReactNode; moveButtons?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "card flex min-h-[86px] items-stretch overflow-hidden",
        overlay && "rotate-[0.6deg] scale-[1.02] cursor-grabbing border-brand-400 shadow-2xl shadow-brand-900/25 ring-2 ring-brand-500/30",
        highlighted && "ring-2 ring-emerald-400/60",
        !app.isActive && !overlay && "opacity-75",
      )}
    >
      {handle ?? (
        <span className="flex w-10 shrink-0 items-center justify-center text-brand-500"><GripVertical className="size-5" aria-hidden /></span>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-3 sm:gap-4">
        <span className="hidden w-6 shrink-0 text-center text-sm font-semibold tabular-nums text-ink-3 sm:block">{index + 1}</span>
        <AppTile name={app.name} logoUrl={app.logoUrl} icon={app.icon} accentColor={app.accentColor} size={48} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-semibold text-ink">{app.name}</span>
            {app.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}
            {app.category ? <Badge>{app.category}</Badge> : null}
            {app.requiredRoleName ? <Badge tone="amber">{app.requiredRoleName}+</Badge> : null}
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-3">
            <span className="truncate">{app.url}</span>
            {app.openInNewTab ? <ExternalLink className="size-3 shrink-0" aria-label="Opens in a new tab" /> : null}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
            <Users className="size-3" aria-hidden /> {app.userCount} user{app.userCount === 1 ? "" : "s"}{app.autoGrant ? " · given to new users" : ""}
          </p>
        </div>
        {overlay ? null : (
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {moveButtons}
            <ActiveSwitch id={app.id} name={app.name} active={app.isActive} />
            <Link href={`/admin/applications/${app.id}`} className={buttonClass({ variant: "secondary", size: "sm" })} aria-label={`Edit ${app.name}`}>
              <Pencil className="size-3.5" aria-hidden /><span className="hidden sm:inline">Edit</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ActiveSwitch({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();
  useEffect(() => setOn(active), [active]);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${name} is ${on ? "enabled" : "disabled"}`}
      disabled={pending}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          const res = await toggleApplicationAction(id, next);
          if (res.error) {
            setOn(!next);
            toast.error(res.error);
          } else if (res.message) toast.success(res.message);
        });
      }}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60", on ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600")}
    >
      <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}
