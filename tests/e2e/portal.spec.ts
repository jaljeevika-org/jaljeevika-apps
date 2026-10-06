import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { ADMIN, TINY_PNG, lastMailId, linkFrom, login, logout, mailsFor, waitForMail } from "./helpers";

/**
 * The complete portal flow, in order, against a fresh database:
 * admin sets up applications → creates users → users sign in, see only their
 * applications in the admin's order, open them → forgot/reset password →
 * registration with email confirmation → disabling, rate limits, CSRF.
 */
test.describe.configure({ mode: "serial" });

const STUB = "http://127.0.0.1:3199";
const run = Date.now().toString(36);
const userA = { name: "Field Worker", email: `field.worker.${run}@e2e.jaljeevika.local`, temp: `Temp-${run}-Kh7vQ2`, password: `River-${run}-Lotus-91` };
const userB = { name: "Invited Planner", email: `invited.planner.${run}@e2e.jaljeevika.local`, password: `Pond-${run}-Monsoon-42` };
const deputy = { name: "Deputy Admin", email: `deputy.admin.${run}@e2e.jaljeevika.local`, password: `Deputy-${run}-Banyan-73` };
const selfReg = { name: "Self Registered", email: `self.registered.${run}@e2e.jaljeevika.local`, password: `Self-${run}-Tamarind-55` };

async function addApplication(page: Page, app: { name: string; url: string; slug: string; icon?: string; category?: string; minRole?: string; logo?: { name: string; mimeType: string; buffer: Buffer } }) {
  await page.goto("/admin/applications/new");
  await page.getByLabel("Application name").fill(app.name);
  await page.getByLabel("Application URL").fill(app.url);
  await page.getByLabel("Description").fill(`${app.name} for end-to-end tests`);
  if (app.category) await page.getByLabel("Category").fill(app.category);
  await page.getByLabel("Short name (used in links)").fill(app.slug);
  if (app.icon) {
    await page.getByTitle(app.icon, { exact: true }).click();
    await expect(page.getByRole("radio", { name: app.icon, exact: true })).toBeChecked();
  }
  if (app.minRole) await page.getByLabel("Minimum role").selectOption({ label: app.minRole });
  if (app.logo) await page.getByTestId("logo-input").setInputFiles(app.logo);
  await page.getByRole("button", { name: "Add application" }).click();
  await expect(page.getByText("Application added.")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/applications/);
  await expect(page.getByTestId(`app-row-${app.slug}`)).toBeVisible();
}

test("security headers, protected routes and health", async ({ page, request }) => {
  const res = await request.get("/login");
  expect(res.status()).toBe(200);
  const h = res.headers();
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-powered-by"]).toBeUndefined();

  for (const path of ["/", "/admin", "/admin/users", "/profile"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  await page.goto("/launch/e2e-gis");
  await expect(page).toHaveURL(/\/login\?next=%2Flaunch%2Fe2e-gis/);

  expect((await request.get("/api/me")).status()).toBe(401);
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({ ok: true, database: "ok" });

  // Registration is closed by default.
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "Accounts are created by your administrator" })).toBeVisible();
});

test("open redirect and cross-site requests are blocked", async ({ page, request }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await expect(page).toHaveURL(/\/$/);
  await logout(page);
  // A crafted next= pointing elsewhere must land on the portal, not evil.example.
  await page.goto("/login?next=%2F%2Fevil.example%2Fphish");
  await page.getByLabel("Email", { exact: true }).fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/$/);

  const cross = await request.post("/login", { headers: { Origin: "https://evil.example", "Content-Type": "text/plain" }, data: "x" });
  expect(cross.status()).toBe(403);
  const sibling = await request.post("/login", { headers: { "Sec-Fetch-Site": "cross-site" }, data: "x" });
  expect(sibling.status()).toBe(403);
});

test("super admin manages applications: logo upload, built-in icon, validation, drag-and-drop order", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password, { expectUrl: /\/$/ });
  await page.goto("/admin/applications");
  await expect(page.getByRole("heading", { name: "No applications yet" })).toBeVisible();

  // Real Jaljeevika logo (JPEG) as an uploaded logo.
  await addApplication(page, {
    name: "E2E GIS", url: `${STUB}/gis`, slug: "e2e-gis", category: "Maps",
    logo: { name: "jaljeevika-logo.jpg", mimeType: "image/jpeg", buffer: readFileSync("public/brand/jaljeevika-logo.jpg") },
  });
  await addApplication(page, { name: "E2E Reports", url: `${STUB}/reports`, slug: "e2e-reports", icon: "Bar chart", category: "Reports" });
  await addApplication(page, { name: "E2E Admin Tool", url: `${STUB}/admin-tool`, slug: "e2e-admin-tool", icon: "Admin", minRole: "Admin" });
  await addApplication(page, { name: "E2E Png", url: `${STUB}/png`, slug: "e2e-png", logo: { name: "tiny.png", mimeType: "image/png", buffer: TINY_PNG } });

  // The uploaded logo is served with safe headers.
  const logoSrc = await page.getByTestId("app-row-e2e-gis").locator("img").getAttribute("src");
  expect(logoSrc).toMatch(/^\/api\/files\/[0-9a-f-]{36}$/);
  const logoRes = await page.request.get(logoSrc!);
  expect(logoRes.status()).toBe(200);
  expect(logoRes.headers()["content-type"]).toBe("image/jpeg");
  expect(logoRes.headers()["content-security-policy"]).toContain("sandbox");

  // Validation: dangerous URL and a scripted SVG are rejected; values are kept.
  await page.goto("/admin/applications/new");
  await page.getByLabel("Application name").fill("Bad app");
  await page.getByLabel("Application URL").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Add application" }).click();
  await expect(page.getByText("Use a full address starting with https://")).toBeVisible();
  await expect(page.getByLabel("Application name")).toHaveValue("Bad app");
  await page.getByLabel("Application URL").fill(`${STUB}/bad`);
  await page.getByTestId("logo-input").setInputFiles({
    name: "evil.svg", mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  });
  await page.getByRole("button", { name: "Add application" }).click();
  await expect(page.getByText(/This SVG contains scripts/)).toBeVisible();

  // Edit: replace the PNG logo by a built-in icon ("Use icon instead").
  await page.goto("/admin/applications");
  await page.getByRole("link", { name: "Edit E2E Png" }).click();
  await page.getByRole("button", { name: "Use icon instead" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Application saved.")).toBeVisible();
  await expect(page.getByTestId("app-row-e2e-png").locator("img")).toHaveCount(0);

  // Drag "E2E Reports" (2nd) above "E2E GIS" (1st).
  const order = page.getByTestId("app-order-list").locator("li");
  await expect(order.nth(0)).toContainText("E2E GIS");
  const handle = page.getByRole("button", { name: "Drag to reorder E2E Reports" });
  const target = page.getByTestId("app-row-e2e-gis");
  const hb = (await handle.boundingBox())!;
  const tb = (await target.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 - 10, { steps: 5 });
  await page.mouse.move(hb.x + hb.width / 2, tb.y + 5, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByText("Order saved")).toBeVisible();
  await expect(order.nth(0)).toContainText("E2E Reports");
  await page.reload();
  await expect(order.nth(0)).toContainText("E2E Reports");
  await expect(order.nth(1)).toContainText("E2E GIS");

  // Keyboard alternative: move "E2E Png" up one place with its arrow button.
  await page.getByRole("button", { name: "Move E2E Png up" }).click();
  await expect(page.getByText("Order saved")).toBeVisible();
  await page.reload();
  await expect(order.nth(2)).toContainText("E2E Png");
  await expect(order.nth(3)).toContainText("E2E Admin Tool");
});

test("admin creates users: temporary password and emailed invitation", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password, { expectUrl: /\/$/ });

  // User A: temporary password, access to GIS and Admin Tool (Admin Tool needs the Admin role).
  await page.goto("/admin/users/new");
  await page.getByLabel("Full name").fill(userA.name);
  await page.getByLabel("Email", { exact: true }).fill(userA.email);
  await page.getByLabel("Role", { exact: true }).selectOption({ label: "User" });
  await page.getByLabel(/Set a temporary password/).check();
  await page.getByLabel("Temporary password", { exact: true }).fill(userA.temp);
  await page.getByRole("checkbox", { name: /E2E GIS/ }).check();
  await page.getByRole("checkbox", { name: /E2E Admin Tool/ }).check();
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("User created.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/users\/[0-9a-f-]{36}/);
  await expect(page.getByText("Temporary password").first()).toBeVisible();

  // Duplicate email is refused with a clear message, and typed values stay.
  await page.goto("/admin/users/new");
  await page.getByLabel("Full name").fill("Duplicate");
  await page.getByLabel("Email", { exact: true }).fill(userA.email.toUpperCase());
  await page.getByLabel(/Set a temporary password/).check();
  await page.getByLabel("Temporary password", { exact: true }).fill(userA.temp);
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("A user with this email already exists.")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveValue("Duplicate");

  // User B: invited by email, access to GIS and Reports.
  const before = await lastMailId(userB.email);
  await page.goto("/admin/users/new");
  await page.getByLabel("Full name").fill(userB.name);
  await page.getByLabel("Email", { exact: true }).fill(userB.email);
  await page.getByLabel(/Email an invitation/).check();
  await page.getByRole("checkbox", { name: /E2E GIS/ }).check();
  await page.getByRole("checkbox", { name: /E2E Reports/ }).check();
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("User created and invitation emailed.")).toBeVisible();
  const invite = await waitForMail(userB.email, /invited/, before);
  const link = linkFrom(invite, "reset-password");
  expect(invite.text).toContain("expires in 72 hours");

  // Deputy: an Admin (cannot touch Super Admins).
  await page.goto("/admin/users/new");
  await page.getByLabel("Full name").fill(deputy.name);
  await page.getByLabel("Email", { exact: true }).fill(deputy.email);
  await page.getByLabel("Role", { exact: true }).selectOption({ label: "Admin" });
  await page.getByLabel(/Set a temporary password/).check();
  await page.getByLabel("Temporary password", { exact: true }).fill(deputy.password);
  await page.getByLabel(/Ask them to choose their own password/).uncheck();
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("User created.", { exact: true })).toBeVisible();
  await logout(page);

  // B accepts the invitation and sets a password.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Set your password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(userB.password);
  await page.getByLabel("Repeat new password").fill(userB.password);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page).toHaveURL(/\/login\?notice=password_set/);
  // The invitation works only once.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link can't be used" })).toBeVisible();
});

test("user A: temporary password → forced change → only assigned apps → open app → denied apps → logout", async ({ page, context }) => {
  await login(page, userA.email, userA.temp, { expectUrl: /\/change-password$/ });
  // Cannot skip the change: the dashboard and launches send them back.
  await page.goto("/");
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Temporary password", { exact: true }).fill(userA.temp);
  await page.getByLabel("New password", { exact: true }).fill("password123");
  await page.getByLabel("Repeat new password").fill("password123");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText(/too common|at least 10/i)).toBeVisible();
  await expect(page.getByLabel("Temporary password", { exact: true })).toHaveValue(""); // form cleared after the error
  await page.getByLabel("Temporary password", { exact: true }).fill(userA.temp);
  await page.getByLabel("New password", { exact: true }).fill(userA.password);
  await page.getByLabel("Repeat new password").fill(userA.password);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/(\?notice=password_changed)?$/);

  // Dashboard: GIS only (Reports not assigned; Admin Tool needs the Admin role).
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Field/ })).toBeVisible();
  await expect(page.getByTestId("app-card-e2e-gis")).toBeVisible();
  await expect(page.getByTestId("app-card-e2e-reports")).toHaveCount(0);
  await expect(page.getByTestId("app-card-e2e-admin-tool")).toHaveCount(0);
  await expect(page.getByTestId("app-card-e2e-gis").locator("img")).toBeVisible();

  // Open the application: a new tab lands on the application itself.
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByTestId("app-card-e2e-gis").click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toBe(`${STUB}/gis`);
  await expect(popup.getByRole("heading", { name: "STUB /gis" })).toBeVisible();
  // No portal URL (or token) leaks to the application.
  await expect(popup.locator("#referrer")).toHaveText("none");
  await popup.close();

  // The server refuses applications the user cannot open, whatever the UI shows.
  await page.goto("/launch/e2e-reports");
  await expect(page).toHaveURL(/\/launch-denied\?reason=forbidden/);
  await expect(page.getByRole("heading", { name: "You don't have access to this application" })).toBeVisible();
  await page.goto("/launch/e2e-admin-tool");
  await expect(page).toHaveURL(/reason=forbidden/);
  await page.goto("/launch/does-not-exist");
  await expect(page).toHaveURL(/reason=not_found/);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "You don't have permission to view this page" })).toBeVisible();

  const me = await page.request.get("/api/me");
  const body = await me.json();
  expect(body.user.email).toBe(userA.email);
  expect(body.applications.map((a: { slug: string }) => a.slug)).toEqual(["e2e-gis"]);

  await logout(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("user B sees applications in the order the admin saved; disabled apps vanish and cannot be launched", async ({ page, browser }) => {
  await login(page, userB.email, userB.password, { expectUrl: /\/$/ });
  const cards = page.locator("[data-testid^=app-card-]");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveAttribute("data-testid", "app-card-e2e-reports");
  await expect(cards.nth(1)).toHaveAttribute("data-testid", "app-card-e2e-gis");

  // Admin disables Reports in another browser.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, ADMIN.email, ADMIN.password, { expectUrl: /\/$/ });
  await admin.goto("/admin/applications");
  await admin.getByRole("switch", { name: "E2E Reports is enabled" }).click();
  await expect(admin.getByText("Application disabled")).toBeVisible();

  await page.reload();
  await expect(cards).toHaveCount(1);
  await page.goto("/launch/e2e-reports");
  await expect(page).toHaveURL(/reason=disabled/);

  await admin.getByRole("switch", { name: "E2E Reports is disabled" }).click();
  await expect(admin.getByText("Application enabled")).toBeVisible();
  await adminCtx.close();
});

test("forgot password → email → reset → sign in with the new password (single-use link, no account enumeration)", async ({ page }) => {
  const newPassword = `Reset-${run}-Kingfisher-08`;
  const before = await lastMailId(userA.email);
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(userA.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const knownText = await page.locator("[role=status]", { hasText: "Check your email" }).innerText();

  const mail = await waitForMail(userA.email, /Reset your/, before);
  const link = linkFrom(mail, "reset-password");
  expect(link.startsWith("http://localhost:")).toBe(true); // built from APP_BASE_URL

  // Unknown address: identical answer, and nothing is sent.
  const ghost = `nobody.${run}@e2e.jaljeevika.local`;
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(ghost);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect((await page.locator("[role=status]", { hasText: "Check your email" }).innerText()).replace(ghost, "X")).toBe(knownText.replace(userA.email, "X"));

  // Reset.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Repeat new password").fill(`${newPassword}x`);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("The passwords do not match.")).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue("");
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Repeat new password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/login\?notice=password_reset/);
  await waitForMail(userA.email, /password was changed/, before);

  // Old password no longer works; new one does.
  await page.getByLabel("Email", { exact: true }).fill(userA.email);
  await page.getByLabel("Password", { exact: true }).fill(userA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await login(page, userA.email, newPassword, { expectUrl: /\/$/ });
  userA.password = newPassword;

  // The link is single-use.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link can't be used" })).toBeVisible();
  // Tampered token.
  await page.goto(link.replace(/token=.{4}/, "token=AAAA"));
  await expect(page.getByRole("heading", { name: "This link can't be used" })).toBeVisible();

  await new Promise((r) => setTimeout(r, 1500));
  expect(await mailsFor(ghost)).toHaveLength(0);
});

test("admin limits: an Admin cannot manage a Super Admin or hand out higher roles", async ({ page }) => {
  await login(page, deputy.email, deputy.password, { expectUrl: /\/$/ });
  await page.goto("/admin/users");
  await page.getByRole("link", { name: "Asha Superadmin" }).click();
  await expect(page.getByText("View only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);

  await page.goto("/admin/users/new");
  const options = await page.getByLabel("Role", { exact: true }).locator("option").allTextContents();
  expect(options).toEqual(["User"]);

  // Settings and roles are Super Admin only by default.
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "You don't have permission to view this page" })).toBeVisible();
});

test("disabling a user signs them out immediately", async ({ page, browser }) => {
  await login(page, userA.email, userA.password, { expectUrl: /\/$/ });

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, ADMIN.email, ADMIN.password, { expectUrl: /\/$/ });
  await admin.goto(`/admin/users?q=${encodeURIComponent(userA.email)}`);
  await admin.getByRole("link", { name: userA.name }).click();
  await admin.getByRole("button", { name: "Disable" }).click();
  await admin.getByRole("button", { name: "Disable account" }).click();
  await expect(admin.getByText("User disabled and signed out everywhere.")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email", { exact: true }).fill(userA.email);
  await page.getByLabel("Password", { exact: true }).fill(userA.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("This account has been disabled.")).toBeVisible();

  await admin.getByRole("button", { name: "Enable" }).click();
  await expect(admin.getByText("User enabled.")).toBeVisible();
  await adminCtx.close();
});

test("registration (when enabled) requires email confirmation", async ({ page, browser }) => {
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, ADMIN.email, ADMIN.password, { expectUrl: /\/$/ });
  await admin.goto("/admin/settings");
  await admin.getByLabel("Allow people to create their own account").check();
  await admin.getByRole("button", { name: "Save" }).nth(1).click();
  await expect(admin.getByText("Authentication settings saved.")).toBeVisible();

  const before = await lastMailId(selfReg.email);
  await page.goto("/login");
  await page.getByRole("link", { name: "Create one" }).click();
  await page.getByLabel("Full name").fill(selfReg.name);
  await page.getByLabel("Email").fill(selfReg.email);
  await page.getByLabel("Password", { exact: true }).fill(selfReg.password);
  await page.getByLabel("Repeat password").fill(selfReg.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();

  // Cannot sign in before confirming.
  await login(page, selfReg.email, selfReg.password);
  await expect(page.getByText("Please confirm your email address before signing in.")).toBeVisible();

  const mail = await waitForMail(selfReg.email, /Confirm your email/, before);
  await page.goto(linkFrom(mail, "verify-email"));
  await page.getByRole("button", { name: "Confirm email address" }).click();
  await expect(page).toHaveURL(/\/login\?notice=email_verified/);
  await login(page, selfReg.email, selfReg.password, { expectUrl: /\/$/ });
  await expect(page.getByRole("heading", { name: "No applications assigned yet" })).toBeVisible();

  // Registering again with the same address reveals nothing new.
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto("/register");
  await p2.getByLabel("Full name").fill("Someone Else");
  await p2.getByLabel("Email").fill(selfReg.email);
  await p2.getByLabel("Password", { exact: true }).fill(`Other-${run}-Peepal-61`);
  await p2.getByLabel("Repeat password").fill(`Other-${run}-Peepal-61`);
  await p2.getByRole("button", { name: "Create account" }).click();
  await expect(p2.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await waitForMail(selfReg.email, /Sign-up attempt/, before);
  await ctx2.close();

  await admin.getByLabel("Allow people to create their own account").uncheck();
  await admin.getByRole("button", { name: "Save" }).nth(1).click();
  await expect(admin.getByText("Authentication settings saved.")).toBeVisible();
  await adminCtx.close();
});

test("brute force: sign-in is rate limited per account", async ({ page }) => {
  const victim = userB.email;
  await page.goto("/login");
  for (let i = 0; i < 8; i++) {
    await page.getByLabel("Email", { exact: true }).fill(victim);
    await page.getByLabel("Password", { exact: true }).fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue(""); // response handled, form cleared
  }
  await page.getByLabel("Email", { exact: true }).fill(victim);
  // Even the correct password is refused while the account is locked out.
  await page.getByLabel("Password", { exact: true }).fill(userB.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText(/Too many sign-in attempts/)).toBeVisible();
});

test("audit log records the flow and never stores secrets", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password, { expectUrl: /\/$/ });
  for (const action of ["application.launched", "application.reordered", "auth.password_reset", "user.created", "application.launch_denied", "auth.login_failed", "auth.login_rate_limited", "user.disabled"]) {
    await page.goto(`/admin/audit?action=${action}`);
    await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
  }
  // Check every stored row, not just what one page shows.
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  const rows = await db.query<{ t: string }>("SELECT action || ' ' || metadata::text || ' ' || coalesce(target_id, '') AS t FROM audit_logs");
  const sessions = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM sessions WHERE length(token_hash) <> 32");
  const tokens = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM password_reset_tokens WHERE length(token_hash) <> 32");
  const hashes = await db.query<{ h: string }>("SELECT password_hash AS h FROM users WHERE password_hash IS NOT NULL");
  await db.end();
  const all = rows.rows.map((r) => r.t).join(" | ");
  expect(rows.rows.length).toBeGreaterThan(20);
  for (const secret of [userA.password, userA.temp, userB.password, deputy.password, selfReg.password, ADMIN.password]) expect(all).not.toContain(secret);
  expect(all).not.toMatch(/token=[A-Za-z0-9_-]{43}/);
  expect(sessions.rows[0].n).toBe(0); // only 32-byte SHA-256 digests are stored
  expect(tokens.rows[0].n).toBe(0);
  for (const { h } of hashes.rows) expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
});

test("responsive: dashboard and admin work on a phone", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await login(page, ADMIN.email, ADMIN.password, { expectUrl: /\/$/ });
  await expect(page.getByTestId("app-card-e2e-gis")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: "test-results/mobile-dashboard.png", fullPage: true });
  await page.goto("/admin/applications");
  await expect(page.getByTestId("app-row-e2e-gis")).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-admin-apps.png", fullPage: true });
  await ctx.close();
});
