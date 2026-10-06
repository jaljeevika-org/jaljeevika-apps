import "server-only";
import type { OutgoingEmail } from "./transport";

export type Brand = { portalName: string; organizationName: string; baseUrl: string; supportEmail: string | null };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Layout = {
  brand: Brand;
  to: string;
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footnote?: string;
};

function render({ brand, to, subject, preheader, heading, paragraphs, action, footnote }: Layout): OutgoingEmail {
  const e = escapeHtml;
  const help = brand.supportEmail
    ? `Need help? Contact <a href="mailto:${e(brand.supportEmail)}" style="color:#4f4cb8">${e(brand.supportEmail)}</a>.`
    : "Need help? Contact your administrator.";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4fb;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2133">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${e(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4fb;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e5f3">
<tr><td style="background:linear-gradient(135deg,#36347a,#4f4cb8 55%,#0e8fa3);padding:24px 32px">
<div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#d9dbff">${e(brand.organizationName)}</div>
<div style="font-size:20px;font-weight:700;color:#ffffff;margin-top:4px">${e(brand.portalName)}</div>
</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#1f2133">${e(heading)}</h1>
${paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3b3e56">${e(p)}</p>`).join("\n")}
${
  action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:10px;background:#4f4cb8">
<a href="${e(action.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${e(action.label)}</a>
</td></tr></table>
<p style="margin:0 0 6px;font-size:13px;color:#6b6f88">If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 14px;font-size:13px;word-break:break-all"><a href="${e(action.url)}" style="color:#4f4cb8">${e(action.url)}</a></p>`
    : ""
}
${footnote ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#6b6f88">${e(footnote)}</p>` : ""}
</td></tr>
<tr><td style="padding:18px 32px;background:#f8f9fe;border-top:1px solid #eceefa;font-size:12px;line-height:1.6;color:#80849c">
This email was sent to ${e(to)} by ${e(brand.portalName)}.<br>${help}
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const text = [
    `${brand.portalName}`,
    "",
    heading,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    ...(footnote ? [footnote, ""] : []),
    brand.supportEmail ? `Need help? Contact ${brand.supportEmail}.` : "Need help? Contact your administrator.",
  ].join("\n");

  return { to, subject, html, text };
}

export function passwordResetEmail(brand: Brand, to: string, name: string, url: string, minutes: number): OutgoingEmail {
  return render({
    brand,
    to,
    subject: `Reset your ${brand.portalName} password`,
    preheader: "Use this link to choose a new password.",
    heading: "Reset your password",
    paragraphs: [
      `Hello ${name},`,
      `We received a request to reset the password for your ${brand.portalName} account. Click the button below to choose a new password.`,
      `This link can be used once and expires in ${minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`}.`,
    ],
    action: { label: "Reset password", url },
    footnote: "If you did not ask to reset your password, you can ignore this email. Your password will not change.",
  });
}

export function inviteEmail(brand: Brand, to: string, name: string, url: string, hours: number, invitedBy: string): OutgoingEmail {
  return render({
    brand,
    to,
    subject: `You have been invited to ${brand.portalName}`,
    preheader: "Set your password to start using Jaljeevika applications.",
    heading: `Welcome to ${brand.portalName}`,
    paragraphs: [
      `Hello ${name},`,
      `${invitedBy} has created an account for you on ${brand.portalName}, the single sign-in for ${brand.organizationName} applications.`,
      `Click the button below to set your password. The link can be used once and expires in ${hours} hours.`,
    ],
    action: { label: "Set my password", url },
    footnote: "If you were not expecting this invitation, you can ignore this email.",
  });
}

export function verifyEmail(brand: Brand, to: string, name: string, url: string, hours: number): OutgoingEmail {
  return render({
    brand,
    to,
    subject: `Confirm your email for ${brand.portalName}`,
    preheader: "Confirm your email address to finish setting up your account.",
    heading: "Confirm your email address",
    paragraphs: [
      `Hello ${name},`,
      `Please confirm that this is your email address to finish setting up your ${brand.portalName} account.`,
      `The link expires in ${hours} hours.`,
    ],
    action: { label: "Confirm email address", url },
    footnote: "If you did not create an account, you can ignore this email.",
  });
}

export function passwordChangedEmail(brand: Brand, to: string, name: string): OutgoingEmail {
  return render({
    brand,
    to,
    subject: `Your ${brand.portalName} password was changed`,
    preheader: "Your password was just changed.",
    heading: "Your password was changed",
    paragraphs: [
      `Hello ${name},`,
      `The password for your ${brand.portalName} account was just changed, and you were signed out of your other devices.`,
    ],
    action: { label: "Sign in", url: `${brand.baseUrl}/login` },
    footnote: "If you did not make this change, reset your password immediately and contact your administrator.",
  });
}

export function existingAccountEmail(brand: Brand, to: string, name: string): OutgoingEmail {
  return render({
    brand,
    to,
    subject: `Sign-up attempt on ${brand.portalName}`,
    preheader: "Someone tried to register with your email address.",
    heading: "You already have an account",
    paragraphs: [
      `Hello ${name},`,
      `Someone (hopefully you) tried to create a new ${brand.portalName} account with this email address. You already have an account, so no new one was created.`,
      "If you have forgotten your password, you can reset it from the sign-in page.",
    ],
    action: { label: "Go to sign in", url: `${brand.baseUrl}/login` },
    footnote: "If this was not you, you can ignore this email.",
  });
}

export function testEmail(brand: Brand, to: string): OutgoingEmail {
  return render({
    brand,
    to,
    subject: `Test email from ${brand.portalName}`,
    preheader: "Your email settings work.",
    heading: "Email is working",
    paragraphs: [
      `This is a test message from ${brand.portalName}. If you can read it, password reset and invitation emails will be delivered too.`,
    ],
  });
}
