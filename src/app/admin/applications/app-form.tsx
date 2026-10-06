"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, ImageUp, Trash, Upload } from "lucide-react";
import { createApplicationAction, deleteApplicationAction, updateApplicationAction } from "./actions";
import { Alert, Card, Field, buttonClass } from "@/components/ui";
import { ConfirmSubmit, SubmitButton, useKeepValuesSubmit } from "@/components/client";
import { ActionForm } from "@/components/action-form";
import { AppTile } from "@/components/app-tile";
import { APP_ICONS, ACCENT_COLORS, DEFAULT_ACCENT, DEFAULT_APP_ICON } from "@/lib/app-icons";
import { slugify, type FormState } from "@/lib/validation";
import { cn } from "@/lib/cn";

export type AppFormValues = {
  id: string; slug: string; name: string; description: string; url: string; logoUrl: string | null; icon: string;
  accentColor: string; category: string | null; requiredRoleId: number | null; isActive: boolean; openInNewTab: boolean; autoGrant: boolean;
};

const ACCEPT = ".png,.jpg,.jpeg,.svg,.webp,image/png,image/jpeg,image/svg+xml,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export function AppForm({
  mode, app, roles, categories,
}: { mode: "create" | "edit"; app?: AppFormValues; roles: { id: number; name: string }[]; categories: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "create" ? createApplicationAction : updateApplicationAction, {});
  const onSubmit = useKeepValuesSubmit(action);
  const v = state.values;
  const [name, setName] = useState(v?.name ?? app?.name ?? "");
  const [description, setDescription] = useState(v?.description ?? app?.description ?? "");
  const [url, setUrl] = useState(v?.url ?? app?.url ?? "");
  const [category, setCategory] = useState(v?.category ?? app?.category ?? "");
  const [icon, setIcon] = useState(v?.icon ?? app?.icon ?? DEFAULT_APP_ICON);
  const [accent, setAccent] = useState(v?.accentColor ?? app?.accentColor ?? DEFAULT_ACCENT);
  const [slug, setSlug] = useState(v?.slug ?? app?.slug ?? "");
  const [logoAction, setLogoAction] = useState<"keep" | "replace" | "remove">("keep");
  const [preview, setPreview] = useState<string | null>(app?.logoUrl ?? null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deleteFormId = useId();
  const fe = state.fieldErrors ?? {};

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const onFile = (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type) && !/\.(png|jpe?g|svg|webp)$/i.test(file.name)) {
      setFileError("Choose a PNG, JPG, SVG or WebP image.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > MAX_BYTES) {
      setFileError("The logo must be 2 MB or smaller.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setPreview(URL.createObjectURL(file));
    setLogoAction("replace");
  };

  const removeLogo = () => {
    if (fileRef.current) fileRef.current.value = "";
    setPreview(null);
    setFileError(null);
    setLogoAction(app?.logoUrl ? "remove" : "keep");
  };

  const suggestedSlug = slugify(name);
  let host = "";
  try {
    host = url.startsWith("/") ? "Jaljeevika portal" : new URL(url).host;
  } catch {
    host = "";
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        {app ? <input type="hidden" name="id" value={app.id} /> : null}
        <input type="hidden" name="logoAction" value={logoAction} />

        <Card className="space-y-5 p-6">
          <h2 className="text-base font-semibold text-ink">Basics</h2>
          <Field label="Application name" htmlFor="name" error={fe.name}>
            <input id="name" name="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className="field" placeholder="Jaljeevika GIS" aria-invalid={Boolean(fe.name) || undefined} />
          </Field>
          <Field label="Application URL" htmlFor="url" error={fe.url} hint="Full address, e.g. https://gis.jaljeevika.org — or a path on this portal such as /admin.">
            <input id="url" name="url" required maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} className="field" placeholder="https://gis.jaljeevika.org" inputMode="url" aria-invalid={Boolean(fe.url) || undefined} />
          </Field>
          <Field label="Description" htmlFor="description" error={fe.description} hint={`${description.length}/500 · shown on the dashboard card`} optional>
            <textarea id="description" name="description" rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} className="field resize-y" placeholder="Explore and analyse water bodies across India." />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Category" htmlFor="category" error={fe.category} optional hint="Groups apps into filters on the dashboard.">
              <input id="category" name="category" maxLength={60} value={category} onChange={(e) => setCategory(e.target.value)} list="app-categories" className="field" placeholder="Maps & GIS" />
              <datalist id="app-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Short name (used in links)" htmlFor="slug" error={fe.slug} optional hint={`Link: /launch/${slug || suggestedSlug || "…"}`}>
              <input id="slug" name="slug" maxLength={60} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="field" placeholder={suggestedSlug || "jaljeevika-gis"} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-5 p-6">
          <div>
            <h2 className="text-base font-semibold text-ink">Logo</h2>
            <p className="mt-0.5 text-sm text-ink-2">Upload a PNG, JPG, SVG or WebP (max 2 MB). Square images look best. Without a logo the icon below is used.</p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <label
              className={cn(
                "flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors",
                fileError || fe.logo ? "border-rose-300 bg-rose-50/40 dark:bg-rose-500/5" : "border-line hover:border-brand-400 hover:bg-brand-50/40 dark:hover:bg-brand-500/5",
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && fileRef.current) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  fileRef.current.files = dt.files;
                  onFile(file);
                }
              }}
            >
              <ImageUp className="size-6 text-brand-500" aria-hidden />
              <span className="font-medium text-ink">{preview ? "Replace logo" : "Upload logo"}</span>
              <span className="text-xs text-ink-3">Click to choose, or drop an image here</span>
              <input ref={fileRef} type="file" name="logo" accept={ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid="logo-input" />
            </label>
            <div className="flex items-center gap-3 sm:flex-col">
              <AppTile name={name || "Application"} logoUrl={preview} icon={icon} accentColor={accent} size={80} />
              {preview ? (
                <button type="button" onClick={removeLogo} className={buttonClass({ variant: "ghost", size: "sm", className: "text-rose-600 dark:text-rose-400" })}>
                  <Trash className="size-3.5" aria-hidden /> Use icon instead
                </button>
              ) : (
                <span className="text-xs text-ink-3">Using built-in icon</span>
              )}
            </div>
          </div>
          {fileError || fe.logo ? <p className="text-[13px] text-rose-600 dark:text-rose-400" role="alert">{fileError ?? fe.logo}</p> : null}
          {logoAction === "replace" ? <p className="text-xs text-ink-3"><Upload className="mr-1 inline size-3" aria-hidden />The new logo is uploaded when you save.</p> : null}
          {logoAction === "remove" ? <p className="text-xs text-ink-3">The current logo will be removed when you save.</p> : null}

          <fieldset>
            <legend className="text-sm font-medium text-ink">Built-in icon</legend>
            <div className="mt-2 grid max-h-56 grid-cols-6 gap-1.5 overflow-y-auto rounded-xl border border-line p-2 sm:grid-cols-10">
              {Object.entries(APP_ICONS).map(([key, { label, Icon }]) => (
                <label key={key} title={label} className={cn("flex aspect-square cursor-pointer items-center justify-center rounded-lg transition-colors", icon === key ? "bg-brand-600 text-white" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
                  <input type="radio" name="icon" value={key} checked={icon === key} onChange={() => setIcon(key)} className="sr-only" aria-label={label} />
                  <Icon className="size-5" aria-hidden />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium text-ink">Icon colour</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(ACCENT_COLORS).map(([key, { label, swatch }]) => (
                <label key={key} title={label} className={cn("flex size-8 cursor-pointer items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-surface transition", accent === key ? "ring-brand-500" : "ring-transparent")}>
                  <input type="radio" name="accentColor" value={key} checked={accent === key} onChange={() => setAccent(key)} className="sr-only" aria-label={label} />
                  <span className={cn("size-6 rounded-full", swatch)} />
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card className="space-y-4 p-6">
          <h2 className="text-base font-semibold text-ink">Access &amp; behaviour</h2>
          <Field label="Minimum role" htmlFor="requiredRoleId" error={fe.requiredRoleId} hint="Even users given access must have at least this role to open it.">
            <select id="requiredRoleId" name="requiredRoleId" defaultValue={v?.requiredRoleId ?? (app?.requiredRoleId ? String(app.requiredRoleId) : "")} className="field">
              <option value="">Any role (just needs access)</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
          <Toggle name="isActive" defaultChecked={app?.isActive ?? true} title="Active" body="Disabled applications disappear from every dashboard and cannot be opened." />
          <Toggle name="openInNewTab" defaultChecked={app?.openInNewTab ?? true} title="Open in a new tab" body="Keeps the portal open in the original tab." />
          <Toggle name="autoGrant" defaultChecked={app?.autoGrant ?? false} title="Give to new users automatically" body="Every user created or registered from now on gets access. Existing users are not changed." />
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <SubmitButton size="lg" pending={pending} pendingText="Saving…">{mode === "create" ? "Add application" : "Save changes"}</SubmitButton>
        </div>
      </form>

      <aside className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Dashboard preview</p>
        <div className="card flex flex-col p-5" aria-hidden>
          <div className="flex items-start justify-between gap-3">
            <AppTile name={name || "Application"} logoUrl={preview} icon={icon} accentColor={accent} size={56} />
            {category ? <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-ink-2">{category}</span> : null}
          </div>
          <h3 className="mt-4 text-[17px] font-semibold text-ink">{name || "Application name"}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-ink-2">{description || "Short description of the application."}</p>
          <div className="mt-5 flex items-center justify-between gap-2">
            <span className="truncate text-xs text-ink-3">{host}</span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white">Open app <ArrowUpRight className="size-4" /></span>
          </div>
        </div>
        {mode === "edit" && app ? (
          <Card className="border-rose-200 p-5 dark:border-rose-500/30">
            <h2 className="text-sm font-semibold text-ink">Delete application</h2>
            <p className="mt-1 text-sm text-ink-2">Removes it from every dashboard and deletes all access assignments for it.</p>
            <ActionForm action={deleteApplicationAction} id={deleteFormId} className="mt-3">
              <input type="hidden" name="id" value={app.id} />
              <ConfirmSubmit formId={deleteFormId} label={<><Trash className="size-3.5" aria-hidden /> Delete</>} title={`Delete ${app.name}?`} body="Users lose access immediately. This cannot be undone — disable it instead if you may need it again." confirmLabel="Delete application" />
            </ActionForm>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}

function Toggle({ name, defaultChecked, title, body }: { name: string; defaultChecked: boolean; title: string; body: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5 text-sm hover:bg-surface-2/60">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 accent-brand-600" />
      <span>
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-ink-2">{body}</span>
      </span>
    </label>
  );
}
