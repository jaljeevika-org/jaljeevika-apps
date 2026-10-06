import "server-only";
import type { FormState } from "@/lib/validation";
import { AuthError } from "./session";

/** An expected, user-facing failure (bad input, rule violation). */
export class ServiceError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "ServiceError";
  }
}

/**
 * Converts any error thrown inside a Server Action into form state. Unknown
 * errors are logged server-side and shown as a generic message, so internal
 * details never reach the browser.
 */
export function toFormState(err: unknown, values?: Record<string, string>): FormState {
  if (err instanceof ServiceError) {
    return err.field
      ? { fieldErrors: { [err.field]: err.message }, values }
      : { error: err.message, values };
  }
  if (err instanceof AuthError) return { error: err.message, values };
  console.error("[action] unexpected error:", err);
  return { error: "Something went wrong. Please try again.", values };
}

/** Next.js uses thrown errors for redirect()/notFound(); never swallow those. */
export function isNextControlFlow(err: unknown): boolean {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : "";
  return digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND";
}
