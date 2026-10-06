/**
 * Password rules (NIST SP 800-63B style): length matters most, no forced
 * character classes, block obvious and very common choices. Shared by the
 * browser (live hints) and the server (the real check).
 */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd",
  "123456789", "1234567890", "12345678910", "0123456789", "987654321", "qwertyuiop",
  "qwerty123", "qwerty1234", "1q2w3e4r5t", "1qaz2wsx3edc", "iloveyou12", "welcome123",
  "welcome@123", "admin12345", "administrator", "letmein123", "football12", "baseball12",
  "sunshine12", "princess12", "monkey1234", "dragon1234", "abcdef1234", "abc1234567",
  "aaaaaaaaaa", "1111111111", "0000000000", "changeme123", "jaljeevika", "jaljeevika1",
  "jaljeevika123", "jaljeevika@123", "india12345", "india@1234", "bharat1234",
]);

export function passwordProblems(password: string, context: { email?: string; name?: string } = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX) problems.push(`Use at most ${PASSWORD_MAX} characters.`);
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) problems.push("This password is too common. Choose something less predictable.");
  if (/^(.)\1+$/.test(password)) problems.push("Do not repeat a single character.");
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) problems.push("Do not include your email address.");
  if (context.email && lower === context.email.toLowerCase()) problems.push("Do not use your email address.");
  return problems;
}

/** Rough strength 0–4 for the meter in the UI. */
export function passwordScore(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= PASSWORD_MIN) score++;
  if (password.length >= 14) score++;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes >= 3) score++;
  if (password.length >= 18 || (classes === 4 && password.length >= 12)) score++;
  if (COMMON.has(password.toLowerCase())) score = 0;
  return Math.min(score, 4);
}
