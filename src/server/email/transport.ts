import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { isProduction } from "../config";

/**
 * Email delivery. The provider is chosen with EMAIL_PROVIDER and configured
 * only through environment variables, so no secret ever reaches the browser
 * or the database.
 *
 *   smtp    – any SMTP server: Brevo, Zoho, Gmail/Google Workspace, Amazon SES, …
 *   resend  – Resend HTTP API (free tier: 3,000 emails/month)
 *   brevo   – Brevo HTTP API (free tier: 300 emails/day)
 *   console – development only: prints the email to the server console
 *   none    – email disabled
 */
export type EmailProvider = "smtp" | "resend" | "brevo" | "console" | "none";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type EmailStatus = {
  provider: EmailProvider;
  configured: boolean;
  from: string | null;
  checks: { label: string; ok: boolean; detail?: string }[];
};

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function provider(): EmailProvider {
  const raw = (env("EMAIL_PROVIDER") ?? "none").toLowerCase();
  if (raw === "smtp" || raw === "resend" || raw === "brevo" || raw === "console" || raw === "none") return raw;
  return "none";
}

export function emailStatus(): EmailStatus {
  const p = provider();
  const fromEmail = env("FROM_EMAIL");
  const fromName = env("FROM_NAME") ?? "Jaljeevika";
  const checks: EmailStatus["checks"] = [];
  const add = (label: string, ok: boolean, detail?: string) => checks.push({ label, ok, detail });

  add("EMAIL_PROVIDER", p !== "none", p === "none" ? "not set — emails are not sent" : p);
  if (p !== "none" && p !== "console") add("FROM_EMAIL", Boolean(fromEmail), fromEmail ? undefined : "required");
  if (p === "smtp") {
    add("SMTP_HOST", Boolean(env("SMTP_HOST")));
    add("SMTP_PORT", Boolean(env("SMTP_PORT")), env("SMTP_PORT") ?? "defaults to 587");
    add("SMTP_USER", Boolean(env("SMTP_USER")), env("SMTP_USER") ? "set" : "not set (only fine for servers without login)");
    add("SMTP_PASSWORD", Boolean(env("SMTP_PASSWORD")), env("SMTP_PASSWORD") ? "set (hidden)" : "not set");
  }
  if (p === "resend") add("RESEND_API_KEY", Boolean(env("RESEND_API_KEY")), env("RESEND_API_KEY") ? "set (hidden)" : "required");
  if (p === "brevo") add("BREVO_API_KEY", Boolean(env("BREVO_API_KEY")), env("BREVO_API_KEY") ? "set (hidden)" : "required");
  if (p === "console") add("Development only", !isProduction, isProduction ? "console delivery is ignored in production" : "emails are printed to the server log");

  let configured = false;
  switch (p) {
    case "smtp":
      configured = Boolean(env("SMTP_HOST") && fromEmail);
      break;
    case "resend":
      configured = Boolean(env("RESEND_API_KEY") && fromEmail);
      break;
    case "brevo":
      configured = Boolean(env("BREVO_API_KEY") && fromEmail);
      break;
    case "console":
      configured = !isProduction;
      break;
  }
  return {
    provider: p,
    configured,
    from: fromEmail ? `${fromName} <${fromEmail}>` : p === "console" ? `${fromName} <no-reply@localhost>` : null,
    checks,
  };
}

export function isEmailConfigured(): boolean {
  return emailStatus().configured;
}

const globalForMail = globalThis as unknown as { __jjSmtp?: Transporter };

function smtpTransport(): Transporter {
  if (!globalForMail.__jjSmtp) {
    const port = Number(env("SMTP_PORT") ?? 587);
    const secureEnv = env("SMTP_SECURE");
    const secure = secureEnv ? secureEnv === "true" : port === 465;
    const user = env("SMTP_USER");
    globalForMail.__jjSmtp = nodemailer.createTransport({
      host: env("SMTP_HOST"),
      port,
      secure,
      auth: user ? { user, pass: env("SMTP_PASSWORD") ?? "" } : undefined,
      // Refuse to send credentials over a connection that could not be upgraded to TLS
      // (opt out only for a local test mail server).
      requireTLS: !secure && Boolean(user) && env("SMTP_REQUIRE_TLS") !== "false",
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return globalForMail.__jjSmtp;
}

/** Sends one email. Throws when delivery fails or email is not configured. */
export async function deliver(mail: OutgoingEmail): Promise<void> {
  const status = emailStatus();
  if (!status.configured) {
    throw new Error(`Email is not configured (EMAIL_PROVIDER=${status.provider}).`);
  }
  const fromEmail = env("FROM_EMAIL") ?? "no-reply@localhost";
  const fromName = env("FROM_NAME") ?? "Jaljeevika";

  switch (status.provider) {
    case "smtp": {
      await smtpTransport().sendMail({
        from: { name: fromName, address: fromEmail },
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
      return;
    }
    case "resend": {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`);
      return;
    }
    case "brevo": {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env("BREVO_API_KEY") ?? "", "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { name: fromName, email: fromEmail },
          to: [{ email: mail.to }],
          subject: mail.subject,
          htmlContent: mail.html,
          textContent: mail.text,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Brevo responded ${res.status}`);
      return;
    }
    case "console": {
      // Development only (emailStatus marks console unconfigured in production).
      console.info(`\n[email:console] To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
      return;
    }
    default:
      throw new Error("Email is not configured.");
  }
}
