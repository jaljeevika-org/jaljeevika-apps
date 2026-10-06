"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, useTransition, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LoaderCircle, Monitor, Moon, Sun } from "lucide-react";
import { Toaster as SonnerToaster, toast } from "sonner";
import { buttonClass } from "./ui";
import { cn } from "@/lib/cn";
import { passwordScore, PASSWORD_MIN } from "@/lib/password-policy";

export function SubmitButton({
  children, pendingText, variant = "primary", size = "md", full, className, name, value, disabled, pending: pendingProp,
}: {
  children: ReactNode; pendingText?: string; variant?: "primary" | "secondary" | "danger" | "soft" | "ghost";
  size?: "sm" | "md" | "lg"; full?: boolean; className?: string; name?: string; value?: string; disabled?: boolean;
  /** For forms submitted with useKeepValuesSubmit (useFormStatus does not see those). */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={pending}
      className={buttonClass({ variant, size, full, className })}
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

export function PasswordInput({
  id, name, autoComplete, required = true, invalid, describedBy, showStrength = false, placeholder, defaultValue,
}: {
  id: string; name: string; autoComplete: string; required?: boolean; invalid?: boolean; describedBy?: string;
  showStrength?: boolean; placeholder?: string; defaultValue?: string;
}) {
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(defaultValue ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  // The input is uncontrolled so React clears it when the form resets after
  // a submission; keep the strength meter in step with that.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => setValue("");
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  const score = passwordScore(value);
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-rose-500", "bg-rose-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];
  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          maxLength={128}
          placeholder={placeholder}
          defaultValue={defaultValue}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="field pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-ink-3 hover:text-ink"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4.5" aria-hidden /> : <Eye className="size-4.5" aria-hidden />}
        </button>
      </div>
      {showStrength && value ? (
        <div className="mt-2 flex items-center gap-2" aria-live="polite">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors", i < score ? colors[score] : "bg-surface-2")} />
            ))}
          </div>
          <span className="w-16 text-right text-xs text-ink-3">{value.length < PASSWORD_MIN ? `${value.length}/${PASSWORD_MIN}` : labels[score]}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Submits a form to an action without React's automatic form reset, so
 * checkboxes, selects and chosen files survive a validation error.
 */
export function useKeepValuesSubmit(dispatch: (formData: FormData) => void) {
  const [, startTransition] = useTransition();
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
}

type Theme = "light" | "dark" | "system";

function readTheme(): Theme {
  try {
    const t = localStorage.getItem("jj-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const themeListeners = new Set<() => void>();
function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onMedia = () => {
    if (readTheme() === "system") applyTheme("system");
  };
  media.addEventListener("change", onMedia);
  return () => {
    themeListeners.delete(cb);
    media.removeEventListener("change", onMedia);
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore<Theme>(subscribeTheme, readTheme, () => "system");
  const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const label = theme === "system" ? "Theme: system" : `Theme: ${theme}`;
  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.setItem("jj-theme", next);
        } catch {
          // Private mode: theme just won't persist.
        }
        applyTheme(next);
        themeListeners.forEach((l) => l());
      }}
      className={cn("inline-flex size-9 items-center justify-center rounded-xl text-ink-2 hover:bg-surface-2 hover:text-ink", className)}
      aria-label={`${label}. Switch to ${next}.`}
      title={`${label} (click for ${next})`}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}

export function Toaster() {
  const dark = useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  return <SonnerToaster position="top-center" theme={dark ? "dark" : "light"} richColors closeButton toastOptions={{ duration: 4000 }} />;
}

/** Shows a toast for ?notice=... once, then removes it from the URL. */
export function NoticeToast({ messages }: { messages: Record<string, string> }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef<string | null>(null);
  const notice = params.get("notice");
  useEffect(() => {
    if (!notice || shown.current === notice) return;
    shown.current = notice;
    const text = messages[notice];
    if (text) toast.success(text);
    const rest = new URLSearchParams(params.toString());
    rest.delete("notice");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [notice, messages, params, pathname, router]);
  return null;
}

/** A submit button that asks for confirmation in a dialog first. */
export function ConfirmSubmit({
  label, title, body, confirmLabel, variant = "danger", size = "sm", formId,
}: {
  label: ReactNode; title: string; body: ReactNode; confirmLabel: string;
  variant?: "danger" | "primary" | "secondary" | "soft"; size?: "sm" | "md"; formId: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return (
    <>
      <button type="button" className={buttonClass({ variant: variant === "danger" ? "secondary" : variant, size, className: variant === "danger" ? "text-rose-600 hover:text-rose-700 dark:text-rose-400" : undefined })} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        className="m-auto w-[min(92vw,420px)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 text-sm leading-relaxed text-ink-2">{body}</div>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className={buttonClass({ variant: "secondary" })} onClick={() => ref.current?.close()}>
              Cancel
            </button>
            <button type="submit" form={formId} className={buttonClass({ variant })} onClick={() => ref.current?.close()}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
