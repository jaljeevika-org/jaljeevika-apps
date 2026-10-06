import { describe, expect, it } from "vitest";
import { postLoginPath, safeNextPath } from "@/lib/safe-redirect";
import { passwordProblems, passwordScore } from "@/lib/password-policy";
import { isAllowedAppUrl, slugify } from "@/lib/validation";
import { pgConfig } from "@/lib/pg-config";
import { canAssignRole, outranks } from "@/lib/permissions";
import { inspectImage } from "@/server/files";
import { escapeHtml, passwordResetEmail } from "@/server/email/templates";
import { looksLikeToken, randomToken } from "@/server/crypto";

describe("safeNextPath (open-redirect protection)", () => {
  it.each(["/", "/admin/users?q=a", "/launch/jems", "/a#b"])("accepts %s", (p) => {
    expect(safeNextPath(p)).toBe(p);
  });
  it.each([
    "//evil.example", "/\\evil.example", "https://evil.example", "http:/evil", "javascript:alert(1)",
    "evil.example", "", "/\u0000x", "/a\\b", "\t/admin", " //evil", "/%0d%0aSet-Cookie:x",
  ])("rejects %j", (p) => {
    const out = safeNextPath(p);
    if (out !== null) expect(new URL(out, "https://app.jaljeevika.org").origin).toBe("https://app.jaljeevika.org");
    expect(out === null || out.startsWith("/")).toBe(true);
    expect(out?.startsWith("//") ?? false).toBe(false);
  });
  it("never sends people back to auth pages", () => {
    expect(postLoginPath("/login?next=/x")).toBe("/");
    expect(postLoginPath("/reset-password?token=abc")).toBe("/");
    expect(postLoginPath("/admin")).toBe("/admin");
    expect(postLoginPath(undefined)).toBe("/");
  });
});

describe("password policy", () => {
  it("requires length and blocks common or personal passwords", () => {
    expect(passwordProblems("short")).toContain("Use at least 10 characters.");
    expect(passwordProblems("password123").join()).toMatch(/too common/);
    expect(passwordProblems("Jaljeevika@123").join()).toMatch(/too common/);
    expect(passwordProblems("aaaaaaaaaaaa").join()).toMatch(/repeat/);
    expect(passwordProblems("vaibhav.mhaske-2026", { email: "vaibhav.mhaske@jaljeevika.org" }).join()).toMatch(/email/);
    expect(passwordProblems("x".repeat(129)).join()).toMatch(/at most 128/);
    expect(passwordProblems("monsoon river lotus 42")).toEqual([]);
  });
  it("scores", () => {
    expect(passwordScore("")).toBe(0);
    expect(passwordScore("password123")).toBe(0);
    expect(passwordScore("Monsoon-River-42!")).toBeGreaterThanOrEqual(3);
  });
});

describe("application URLs", () => {
  it.each(["https://gis.jaljeevika.org", "http://127.0.0.1:3199/x", "/admin", "https://www.appsheet.com/start/d632930e?platform=desktop"])("allows %s", (u) => {
    expect(isAllowedAppUrl(u)).toBe(true);
  });
  it.each(["javascript:alert(1)", "data:text/html,hi", "//evil.example", "/\\evil", "ftp://x", "https://user:pass@x.org", "gis.jaljeevika.org", "vbscript:x", "/ spaced"])("rejects %s", (u) => {
    expect(isAllowedAppUrl(u)).toBe(false);
  });
  it("slugifies names", () => {
    expect(slugify("Jaljeevika Pond Mapping")).toBe("jaljeevika-pond-mapping");
    expect(slugify("  JEMS!! ")).toBe("jems");
    expect(slugify("Água & Peixe")).toBe("agua-peixe");
  });
});

describe("Neon connection strings", () => {
  it("keeps full TLS verification and maps channel_binding", () => {
    const c = pgConfig("postgresql://u:p@ep-x-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require") as { connectionString: string; enableChannelBinding: boolean };
    expect(c.connectionString).toContain("sslmode=verify-full");
    expect(c.connectionString).not.toContain("channel_binding");
    expect(c.enableChannelBinding).toBe(true);
    const local = pgConfig("postgresql://postgres@127.0.0.1:5455/db") as { connectionString: string; enableChannelBinding: boolean };
    expect(local.enableChannelBinding).toBe(false);
    expect(local.connectionString).not.toContain("sslmode");
  });
});

describe("role ranking", () => {
  const superAdmin = { role: { id: 1, key: "super_admin", name: "Super Admin", rank: 1000 } };
  const admin = { role: { id: 2, key: "admin", name: "Admin", rank: 500 } };
  it("admins only manage roles below them", () => {
    expect(outranks(admin, { key: "user", rank: 10 })).toBe(true);
    expect(outranks(admin, { key: "admin", rank: 500 })).toBe(false);
    expect(outranks(admin, { key: "super_admin", rank: 1000 })).toBe(false);
    expect(outranks(admin, { key: "super_admin", rank: 1 })).toBe(false); // key wins over a tampered rank
    expect(canAssignRole(admin, { key: "admin", rank: 500 })).toBe(false);
    expect(outranks(superAdmin, { key: "super_admin", rank: 1000 })).toBe(true);
  });
});

describe("uploaded images are checked by content", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
  const webp = new Uint8Array([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);
  const svg = (body: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${body}</svg>`);

  it("detects real types", () => {
    expect(inspectImage(png)).toBe("image/png");
    expect(inspectImage(jpg)).toBe("image/jpeg");
    expect(inspectImage(webp)).toBe("image/webp");
    expect(inspectImage(svg('<defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="10" height="10"/>'))).toBe("image/svg+xml");
  });
  it.each([
    ["script", "<script>alert(1)</script>"],
    ["event handler", '<rect onload="alert(1)"/>'],
    ["foreignObject", "<foreignObject><div/></foreignObject>"],
    ["external href", '<image href="https://evil.example/x.png"/>'],
    ["javascript link", '<a xlink:href="javascript:alert(1)"><rect/></a>'],
    ["external css", '<style>@import url(https://evil.example/x.css);</style>'],
    ["external url()", '<rect style="fill:url(https://evil.example/x)"/>'],
  ])("rejects SVG with %s", (_, body) => {
    expect(() => inspectImage(svg(body))).toThrow(/not allowed/);
  });
  it("rejects disguised and oversized files", () => {
    expect(() => inspectImage(new TextEncoder().encode("<html><script>alert(1)</script></html>"))).toThrow(/PNG, JPG, SVG or WebP/);
    expect(() => inspectImage(new Uint8Array([0x4d, 0x5a, 0x90, 0]))).toThrow(/PNG, JPG, SVG or WebP/); // .exe
    expect(() => inspectImage(new Uint8Array(0))).toThrow(/empty/);
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(png);
    expect(() => inspectImage(big)).toThrow(/2 MB/);
    expect(() => inspectImage(new TextEncoder().encode('<!DOCTYPE svg [<!ENTITY x "y">]><svg/>'))).toThrow();
  });
});

describe("emails", () => {
  it("escape user-controlled text", () => {
    expect(escapeHtml(`<img src=x onerror="a">'`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;&#39;");
    const mail = passwordResetEmail(
      { portalName: "Jaljeevika App Portal", organizationName: "Jaljeevika", baseUrl: "https://app.jaljeevika.org", supportEmail: null },
      "a@b.org", "<script>x</script>", "https://app.jaljeevika.org/reset-password?token=abc", 60,
    );
    expect(mail.html).not.toContain("<script>x</script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.text).toContain("https://app.jaljeevika.org/reset-password?token=abc");
    expect(mail.text).toContain("60 minutes");
  });
});

describe("tokens", () => {
  it("are 256-bit and URL-safe", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => randomToken()));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(looksLikeToken(t)).toBe(true);
    expect(looksLikeToken("short")).toBe(false);
    expect(looksLikeToken("x".repeat(43) + "'")).toBe(false);
  });
});
