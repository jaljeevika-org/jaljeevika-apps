import { z } from "zod";

export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(3, "Enter your email address.")
  .max(254, "That email address is too long.")
  .pipe(z.email({ error: "Enter a valid email address." }));

export const nameSchema = z
  .string({ error: "Enter a name." })
  .trim()
  .min(1, "Enter a name.")
  .max(120, "Use at most 120 characters.")
  // Strip control characters that have no business in a display name.
  .refine((v) => !/[\u0000-\u001f\u007f<>]/.test(v), "Name contains characters that are not allowed.");

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Application URL: absolute http(s) URL, or a path on this portal ("/admin"). */
export const appUrlSchema = z
  .string({ error: "Enter the application URL." })
  .trim()
  .min(1, "Enter the application URL.")
  .max(2048, "That URL is too long.")
  .refine((value) => isAllowedAppUrl(value), "Use a full address starting with https:// (or http://), or a path on this portal such as /admin.");

export function isAllowedAppUrl(value: string): boolean {
  if (/^\/[^/\\]/.test(value)) return !/[\s\u0000-\u001f]/.test(value);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password) return false; // never embed credentials in URLs
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(60, "Use at most 60 characters.")
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens (e.g. jaljeevika-gis).");

/** Turns zod issues into { field: firstMessage }. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted (non-secret) values so the form keeps them after an error. */
  values?: Record<string, string>;
};

export function formValues(formData: FormData, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const v = formData.get(key);
    if (typeof v === "string") out[key] = v;
  }
  return out;
}
