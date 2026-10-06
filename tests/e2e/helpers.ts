import { expect, type Page } from "@playwright/test";

const MAIL_API = `http://127.0.0.1:${process.env.E2E_MAIL_HTTP_PORT ?? "2080"}/api/messages`;

export type Mail = { id: number; to: string[]; subject: string; text: string; html: string; date: string };

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "",
  password: process.env.E2E_ADMIN_PASSWORD ?? "",
};

export async function mailsFor(to: string): Promise<Mail[]> {
  const res = await fetch(`${MAIL_API}?to=${encodeURIComponent(to.toLowerCase())}`);
  return (await res.json()) as Mail[];
}

/** Waits for a new email to `to` whose subject matches. */
export async function waitForMail(to: string, subject: RegExp, after = 0, timeoutMs = 20_000): Promise<Mail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = (await mailsFor(to)).find((m) => m.id > after && subject.test(m.subject));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No email to ${to} matching ${subject} within ${timeoutMs} ms`);
}

export async function lastMailId(to: string): Promise<number> {
  const list = await mailsFor(to);
  return list.reduce((max, m) => Math.max(max, m.id), 0);
}

export function linkFrom(mail: Mail, path: "reset-password" | "verify-email"): string {
  const match = mail.text.match(new RegExp(`https?://[^\\s"<>]+/${path}\\?token=[A-Za-z0-9_-]{43}`));
  if (!match) throw new Error(`No ${path} link in email "${mail.subject}"`);
  return match[0];
}

export async function login(page: Page, email: string, password: string, opts: { expectUrl?: RegExp; remember?: boolean } = {}) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  if (opts.remember) await page.getByLabel("Keep me signed in on this device").check();
  await page.getByRole("button", { name: "Sign in" }).click();
  if (opts.expectUrl) await expect(page).toHaveURL(opts.expectUrl);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: /^Account menu for/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login\?notice=signed_out/);
}

/** 1×1 transparent PNG. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
