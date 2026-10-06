import "server-only";

/**
 * Runtime configuration read from environment variables. Nothing here is ever
 * sent to the browser. URLs are never hard-coded: every link the portal sends
 * by email is built from APP_BASE_URL (or the explicit overrides).
 */

const isProduction = process.env.NODE_ENV === "production";

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function positiveNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function appBaseUrl(): string {
  const raw = process.env.APP_BASE_URL?.trim();
  if (raw) {
    const url = new URL(raw); // throws on a malformed value
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("APP_BASE_URL must start with http:// or https://");
    }
    return trimSlash(url.toString());
  }
  if (isProduction && process.env.ALLOW_MISSING_APP_BASE_URL !== "1") {
    throw new Error("APP_BASE_URL must be set in production (e.g. https://app.jaljeevika.org).");
  }
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export function apiBaseUrl(): string {
  return trimSlash(process.env.API_BASE_URL?.trim() || `${appBaseUrl()}/api`);
}

export function passwordResetUrl(): string {
  return trimSlash(process.env.PASSWORD_RESET_URL?.trim() || `${appBaseUrl()}/reset-password`);
}

export function emailVerificationUrl(): string {
  return trimSlash(process.env.EMAIL_VERIFICATION_URL?.trim() || `${appBaseUrl()}/verify-email`);
}

/** Cookies are marked Secure (and use the __Host- prefix) when served over https. */
export function secureCookiesEnabled(): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  try {
    return appBaseUrl().startsWith("https://");
  } catch {
    return isProduction;
  }
}

export const tokenLifetimes = {
  passwordResetMinutes: () => positiveNumber("PASSWORD_RESET_TTL_MINUTES", 60),
  inviteHours: () => positiveNumber("INVITE_TTL_HOURS", 72),
  emailVerificationHours: () => positiveNumber("EMAIL_VERIFICATION_TTL_HOURS", 24),
};

export { isProduction };
