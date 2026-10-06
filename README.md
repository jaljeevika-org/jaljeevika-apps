# Jaljeevika App Portal

One sign-in for every Jaljeevika application. People sign in once at
`https://app.jaljeevika.org`, see the applications they have been given, and open
them from one dashboard. Administrators manage users, roles, applications,
logos, ordering and access from the admin dashboard.

```
Browser ──► Next.js 16 (pages + Server Actions + route handlers)   ← src/app
               │  proxy: CSP nonce, security headers, CSRF origin check, sign-in redirect
               ▼
            Server layer (auth, sessions, users, roles, apps, access, audit)   ← src/server
               │                       │                        │
               ▼                       ▼                        ▼
       Neon PostgreSQL 18     Neon Object Storage        Email provider
       (users, sessions,      bucket "data"              (SMTP / Brevo /
        apps, audit, …)       (application logos)         Resend)
```

**Stack:** Next.js 16 (App Router, React 19, TypeScript), node-postgres, Argon2id
(`@node-rs/argon2`), Tailwind CSS 4, dnd-kit (drag and drop), nodemailer, AWS S3
SDK (for Neon Object Storage), zod. Tests: Vitest + Playwright.

**Features:** sign-in / sign-out, sessions with "keep me signed in", forgot and
reset password by email, email confirmation, optional self-registration,
temporary passwords with forced change, invitations by email, users / roles /
permissions, applications with uploaded logos or built-in icons, drag-and-drop
ordering, per-user application access, minimum role per application, launch
checks on the server, audit log, light and dark mode, phone-friendly layouts.

---

## Contents

1. [Connect Neon PostgreSQL](#1-connect-neon-postgresql)
2. [Environment variables](#2-environment-variables)
3. [Configure email](#3-configure-email)
4. [Create the first Super Admin](#4-create-the-first-super-admin)
5. [Add an application](#5-add-an-application)
6. [Upload application logos](#6-upload-application-logos)
7. [Connect app.jaljeevika.org](#7-connect-appjaljeevikaorg)
8. [Deploy](#8-deploy)
9. [Future single sign-on (SSO)](#9-future-single-sign-on-sso)
10. [Roles and access](#10-roles-and-access)
11. [Security](#11-security)
12. [Local development and tests](#12-local-development-and-tests)
13. [Operations](#13-operations)

---

## 1. Connect Neon PostgreSQL

This folder is already linked to the Neon project **Authentication Apps**
(`dark-frog-81837502`, branch `production`, AWS us-east-2, Postgres 18), and the
production database has been migrated and seeded with the four Jaljeevika
applications.

To link again (or on another computer):

```bash
npm i -g neon@latest
neon login
neon link --project-id dark-frog-81837502 --branch production -y
```

`neon link` writes `.env.local` with:

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | Pooled connection (`-pooler` host) used by the running app |
| `DATABASE_URL_UNPOOLED` | Direct connection used for migrations |
| `AWS_*` | Credentials for the Neon Object Storage bucket (logos) |

Then create the tables:

```bash
NODE_ENV=production npm run db:migrate
```

```bash
NODE_ENV=production npm run db:seed
```

`NODE_ENV=production` makes the scripts read `.env.local` (production) instead
of `.env.development.local` (your local database). These examples use Bash
syntax; in **Windows PowerShell** set the variable first, then run the command:
`$env:NODE_ENV="production"; npm run db:migrate` (close the window afterwards,
or run `Remove-Item Env:NODE_ENV`, before working on the local database again). Both commands are safe to run
again: applied migrations are skipped and existing applications are left alone.
Migrations live in `db/migrations/` and are recorded in `schema_migrations`;
never edit an applied migration — add `002_….sql` instead.

The connection strings from Neon contain `sslmode=require&channel_binding=require`.
The portal keeps full certificate checking and turns on SCRAM channel binding
(`src/lib/pg-config.ts`).

## 2. Environment variables

All configuration is environment variables; secrets never reach the browser or
the database. `.env.example` lists every variable. The important ones:

| Variable | Required | Example / default |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon pooled connection string |
| `DATABASE_URL_UNPOOLED` | for migrations | Neon direct connection string |
| `APP_BASE_URL` | yes in production | `https://app.jaljeevika.org` (dev: `http://localhost:3000`) |
| `API_BASE_URL` | no | defaults to `${APP_BASE_URL}/api` |
| `PASSWORD_RESET_URL` | no | defaults to `${APP_BASE_URL}/reset-password` |
| `EMAIL_VERIFICATION_URL` | no | defaults to `${APP_BASE_URL}/verify-email` |
| `EMAIL_PROVIDER` | for email | `smtp`, `brevo`, `resend`, `console` (dev only) or `none` |
| `FROM_EMAIL`, `FROM_NAME` | for email | `no-reply@jaljeevika.org`, `Jaljeevika App Portal` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | for `smtp` | see below |
| `BREVO_API_KEY` / `RESEND_API_KEY` | for `brevo` / `resend` | |
| `STORAGE_DRIVER` | no | `s3` when the `AWS_*` values exist, otherwise `database` |
| `STORAGE_BUCKET` | no | `data` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION` | for `s3` | written by `neon link` / `neon env pull` |
| `PASSWORD_RESET_TTL_MINUTES` | no | `60` |
| `INVITE_TTL_HOURS` | no | `72` |
| `EMAIL_VERIFICATION_TTL_HOURS` | no | `24` |

Every link in an email is built from `APP_BASE_URL` (or the overrides), so moving
from `localhost` to `app.jaljeevika.org` is only a change of this variable.
Cookies become `Secure` with the `__Host-` prefix automatically when the address
starts with `https://`.

## 3. Configure email

Password resets, invitations, email confirmation and "your password was
changed" notices are sent by email. Pick one free or low-cost option and set
its variables (in Vercel for production, in `.env.local` locally):

| Option | Free allowance | Settings |
| --- | --- | --- |
| **Brevo SMTP** (recommended to start) | 300 emails/day | `EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_USER`/`SMTP_PASSWORD` = Brevo SMTP login and key |
| Brevo API | 300 emails/day | `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY=…` |
| Resend API | 3,000 emails/month | `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=…` |
| Zoho Mail SMTP (if Jaljeevika uses Zoho) | included in Zoho Mail | `SMTP_HOST=smtp.zoho.in`, `SMTP_PORT=465`, `SMTP_USER`= mailbox, `SMTP_PASSWORD`= app password |
| Google Workspace SMTP | included | `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER`= mailbox, `SMTP_PASSWORD`= app password |

Always set `FROM_EMAIL` to an address on a domain you have verified with the
provider (SPF/DKIM DNS records), e.g. `no-reply@jaljeevika.org`, otherwise mail
lands in spam.

Check it in **Admin → Settings → Email delivery**: every required variable shows
✓ or ✗ (secret values are never shown), and **Send me a test email** sends a
message to your own address.

Without email the portal still works: admins set temporary passwords for people,
and the forgot-password page answers normally but nothing is sent.

## 4. Create the first Super Admin

After the migration, run once from this folder:

```bash
NODE_ENV=production npm run create-admin -- --email you@jaljeevika.org --name "Your Name"
```

It asks for the password twice (hidden). The password must be at least 10
characters and not a common one. Then sign in at `/login`.

PowerShell: `$env:NODE_ENV="production"; npm run create-admin -- --email you@jaljeevika.org --name "Your Name"`

- `--temporary` marks the password as temporary: the person must choose their
  own at first sign-in (use this when you set a password for someone else).
- `--force` turns an existing account into a Super Admin and replaces its password.
- For automation: `… --password-stdin < file` (avoid passwords in shell history).

Further admins and users are added in **Admin → Users → Add user**, either with an
emailed invitation (they choose their own password) or a temporary password
(they must change it at first sign-in).

## 5. Add an application

**Admin → Applications → Add application**:

| Field | Example |
| --- | --- |
| Application name | `Jaljeevika GIS` |
| Application URL | `https://gis.jaljeevika.org` — paste any full link, e.g. an AppSheet link; or a path on the portal such as `/admin` |
| Description | `Explore and analyse water bodies across India.` |
| Category | `GIS & planning` (adds a filter chip on the dashboard) |
| Short name | `jaljeevika-gis` (used in `/launch/jaljeevika-gis`; filled in automatically) |
| Logo / icon | upload a logo, or choose one of 60 built-in icons and a colour |
| Minimum role | optional, e.g. `Admin` for admin-only tools |
| Active | off = hidden from every dashboard and cannot be opened |
| Open in a new tab | on by default |
| Give to new users automatically | new users get access without an admin ticking it |

New applications are added at the end of the list. **Drag the handle** (⋮⋮) to
reorder; the order is saved immediately and is the order everyone sees on their
dashboard. The ↑/↓ buttons and the keyboard (space, arrows, space) work too.

Then give people access: tick applications on a user's page, or use
**Admin → Access** (a grid of users × applications, with "all/none" per
application). Super Admins can always open every active application.

The four applications already in production:

| Order | Name | URL |
| --- | --- | --- |
| 1 | JEMS | `https://www.appsheet.com/start/d632930e-4f1f-4e72-9248-f267073c7cd2?platform=desktop` |
| 2 | Field Flow | `https://chatbot-492915.el.r.appspot.com/` |
| 3 | Jaljeevika Pond Mapping | `https://jaljeevika-gis.vercel.app/` |
| 4 | Career Portal Admin | `https://careers.jaljeevika.org/admin` |

## 6. Upload application logos

- Formats: **PNG, JPG/JPEG, SVG, WebP**, up to **2 MB**. Square images look best.
- In the application form: **Upload logo** (or drop a file), preview it, **Replace**
  it, or **Use icon instead** to remove it. Changes apply when you save.
- The portal's own logo is in **Admin → Settings → Portal identity** (the
  Jaljeevika water-drop logo is the default).
- Files are checked by their content, not their name. SVGs containing scripts,
  event handlers, external links or embedded HTML are refused, and every file is
  served with a sandboxing Content-Security-Policy.
- Logos are stored in the private Neon Object Storage bucket `data`
  (`logos/<purpose>/<uuid>.<ext>`) and served through `/api/files/<id>`.
  Replacing or removing a logo deletes the old object. Without bucket
  credentials (`STORAGE_DRIVER=database`) they are kept in Postgres instead.

## 7. Connect app.jaljeevika.org

1. Deploy (section 8) and open the Vercel project → **Settings → Domains** →
   add `app.jaljeevika.org`.
2. At the DNS provider for `jaljeevika.org` (GoDaddy), add the record Vercel
   shows — normally `CNAME  app  →  cname.vercel-dns.com`. Vercel issues the
   HTTPS certificate automatically.
3. Set `APP_BASE_URL=https://app.jaljeevika.org` in Vercel (Production) and
   redeploy. Reset and invitation links now point to the new address.
4. Optional: add `SPF`/`DKIM` records for your email provider on the same DNS
   page so portal emails are trusted.

Nothing in the code refers to `localhost` or a fixed domain.

## 8. Deploy

Recommended: **Vercel (Hobby/free) + Neon (free)**.

1. Push this folder to a private GitHub repository. `.env*` files are ignored and
   stay on your computer.
2. In Vercel: **Add New → Project →** import the repository. Framework: Next.js
   (defaults are fine).
3. **Environment variables** (Production): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`,
   `APP_BASE_URL`, the email variables, and the four `AWS_*` values plus
   `STORAGE_BUCKET=data` (copy them from `.env.local`). Alternatively install the
   Neon integration in Vercel to inject the database variables.
4. Deploy. Check `https://<your-deployment>/api/health` → `{"ok":true,"database":"ok"}`.
5. For every new version that contains a migration, run
   `NODE_ENV=production npm run db:migrate` before (or right after) deploying.

The app runs anywhere Node.js 20.9+ runs (`npm run build && npm start`). Behind a
reverse proxy, forward `Host`/`X-Forwarded-Host` and `X-Forwarded-For`, and set
`SERVER_ACTIONS_ALLOWED_ORIGINS` only if the public host differs from the
forwarded one.

## 9. Future single sign-on (SSO)

Today the portal is the single place to sign in and to discover and open
applications. Every click goes through `/launch/<slug>`, which re-checks on the
server that the user is signed in and active, the application is active, and the
user has access, then redirects to the application's URL. No password, token or
session is ever put in a URL.

The next step is for applications to **trust the portal's sign-in** so people
don't type a password again. The portal is designed to become an **OpenID
Connect (OIDC) provider**:

1. **Clients.** Add a migration with an `oauth_clients` table: `client_id`
   (use the application `slug`), hashed `client_secret`, allowed `redirect_uris`,
   linked to `applications.id`.
2. **Endpoints.** Add `/.well-known/openid-configuration`, `/oauth/authorize`,
   `/oauth/token`, `/oauth/userinfo` and `/oauth/jwks.json` (for example with the
   `oidc-provider` library, or a small implementation of the authorization-code
   flow with PKCE). Sign ID tokens with an RS256/ES256 key kept in an environment
   variable; publish only the public key.
3. **Authorize = the existing rules.** `/oauth/authorize` uses the existing
   session cookie and the same access rule as `/launch` (`resolveLaunch` in
   `src/server/applications.ts`): active user, active application, assigned
   access, minimum role. A signed-in user with access gets a one-time code
   without seeing a password prompt.
4. **Launch.** For SSO-enabled applications, `/launch/<slug>` redirects to the
   application's own login URL, which immediately starts the OIDC flow.
5. **Applications.** Each app (e.g. the GIS backend) validates the ID token with
   the portal's JWKS, maps `sub`/`email` to its own user, and creates its own
   session. Sign-out can use OIDC front-channel/back-channel logout.

Do **not** share the portal cookie across `*.jaljeevika.org` or pass credentials
in URLs; OIDC gives the same experience safely. `/api/me` already returns the
current user and their applications and can become the `userinfo` endpoint.

## 10. Roles and access

| Role | Rank | Default permissions |
| --- | --- | --- |
| Super Admin | 1000 | Everything, always (cannot be reduced) |
| Admin | 500 | View/manage users, manage applications, manage application access, view audit log |
| User | 10 | Sign in, open assigned applications, manage own profile and password |

- **Admin → Roles** lets a Super Admin change what Admin may do (e.g. switch off
  "Manage applications" or "Manage application access") and create custom roles
  (e.g. "Field coordinator").
- Rank protects people: an Admin can only manage users whose role ranks *below*
  theirs, can never assign a role at or above their own, and can never touch a
  Super Admin. The last active Super Admin cannot be disabled, deleted or demoted.
- Access to an application = **active** AND (**Super Admin** OR **assigned**) AND
  (no minimum role OR the user's role ranks at least as high). This rule lives in
  one SQL fragment (`ACCESS_RULE` in `src/server/applications.ts`) used by both
  the dashboard and `/launch`.

Database tables: `users`, `roles`, `permissions`, `role_permissions`, `sessions`,
`applications`, `user_applications`, `files`, `password_reset_tokens`,
`email_verification_tokens`, `settings`, `audit_logs`, `rate_limits`
(`db/migrations/001_initial.sql`).

## 11. Security

- **Passwords:** Argon2id (19 MiB, t=2, p=1, OWASP). Never stored or logged in plain
  text; minimum 10 characters, common passwords refused. Changing or resetting a
  password signs out other devices and sends a notice email.
- **Sessions:** random 256-bit token in an `HttpOnly`, `SameSite=Lax` cookie
  (`Secure` + `__Host-` prefix on https); only its SHA-256 is stored. Idle timeout
  (default 12 h, capped at 7 days) or "keep me signed in" (default 30 days).
  Disabling a user ends their sessions immediately.
- **Reset / invite / confirm links:** 256-bit, stored hashed, single-use (atomic),
  expire (60 min / 72 h / 24 h), newest link replaces older ones, opening the page
  does not use the link (email scanners are harmless).
- **No account enumeration:** forgot-password answers identically (and in the
  same time — the work happens after the response) whether or not the email
  exists; sign-in says only "Incorrect email or password"; registration with a
  known email sends the owner a notice instead of revealing it.
- **Rate limits** (shared in Postgres): 8 failed sign-ins per account and 50 per
  IP per 15 min; password-reset requests 3 per email and 10 per IP per hour;
  registration, link use and test emails are limited too.
- **CSRF:** Server Actions only, POST-only, origin checked by Next.js and again in
  `src/proxy.ts` (cross-site and sibling-subdomain requests are refused);
  `SameSite=Lax` cookies.
- **XSS:** React escaping, nonce-based Content-Security-Policy with
  `strict-dynamic`, sanitised/sandboxed SVG logos, escaped email templates,
  application URLs restricted to http(s) or portal paths.
- **SQL injection:** every query is parameterised.
- **Authorisation on the server:** every page and every action checks the
  session and permission; the UI hiding a button is never relied on.
- **Headers:** CSP, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`,
  `Referrer-Policy` (`no-referrer` on pages with tokens), `Permissions-Policy`,
  HSTS in production, no `X-Powered-By`.
- **Open redirects:** `?next=` accepts only same-site paths.
- **Audit log:** sign-ins, failures, resets, user/app/access/role/settings
  changes and every application launch, with IP and user agent. Keys that look
  like secrets are stripped before writing.

## 12. Local development and tests

Requirements: Node.js 20.9+ (22 LTS recommended), PostgreSQL 16+ for a local
database (or a Neon branch).

```bash
npm install
```

Create `.env.development.local` (git-ignored) pointing at a local database, for
example:

```
DATABASE_URL=postgresql://postgres@127.0.0.1:5455/portal_dev
DATABASE_URL_UNPOOLED=postgresql://postgres@127.0.0.1:5455/portal_dev
APP_BASE_URL=http://localhost:3000
STORAGE_DRIVER=database
EMAIL_PROVIDER=smtp
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
FROM_EMAIL=no-reply@jaljeevika.local
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run create-admin -- --email you@example.org --name "Your Name"
```

```bash
npm run mail:dev
```

```bash
npm run dev
```

`npm run mail:dev` catches all outgoing email locally (inbox at
http://127.0.0.1:1080); nothing reaches real inboxes.

**Unit + database tests** (Vitest; the database tests need a local throwaway
database, which they wipe):

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5455/portal_unit npm test
```

**End-to-end tests** (Playwright in the installed Microsoft Edge; production build,
mail catcher and stub applications are started automatically):

```bash
E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:5455/portal_e2e npm run test:e2e
```

The runner wipes the database it is given, so it refuses the database in
`.env.local` and any remote host unless `E2E_ALLOW_REMOTE_DB=1` is set (use that
only for a disposable Neon branch, with `E2E_DATABASE_URL_UNPOOLED` for setup and
`E2E_STORAGE_DRIVER=s3` plus the branch's `AWS_*` to test bucket storage).

The end-to-end suite covers: security headers and protected routes; open
redirect and CSRF blocking; adding applications with an uploaded logo and
built-in icons; URL and SVG validation; drag-and-drop and button reordering; an
admin creating users with a temporary password and with an emailed invitation;
forced password change; the dashboard showing only assigned applications in the
saved order; opening an application in a new tab; server-side refusal of
unassigned, role-restricted, disabled and unknown applications; forgot password →
email → reset → sign in with the new password (old password refused, link
single-use, unknown emails get the same answer and no mail); Admin vs Super Admin
limits; disabling a user mid-session; registration with email confirmation;
brute-force lockout; audit-log contents with no secrets stored; phone layouts.

## 13. Operations

- **Backups / undo:** Neon keeps history (point-in-time restore within the
  project's history window). Before risky changes create a branch:
  `neon branches create --name before-change --parent production`.
- **Rotate the database password:** Neon Console → project → Branches →
  production → Roles → `neondb_owner` → Reset password; then `neon env pull`
  (updates `.env.local`) and update `DATABASE_URL`/`DATABASE_URL_UNPOOLED` in
  Vercel and redeploy.
- **Neon API key for the MCP server:** the setup created key
  `neon-cli-mcp-20261006T051722Z-995e` (id 3402412) with access to the whole
  account. Revoke it when not needed: `neon api-keys revoke 3402412`.
- **Health check:** `GET /api/health` (database round trip, no details exposed).
- **Logs:** the server logs errors without request bodies, passwords or tokens.

### Project layout

```
db/migrations/        SQL migrations (001_initial.sql: schema, built-in roles, defaults)
scripts/              migrate, seed, create-admin, dev mail catcher, e2e runner
src/proxy.ts          CSP nonce, security headers, CSRF origin check, sign-in redirect
src/app/(auth)/       login, register, forgot/reset password, verify email + actions
src/app/(portal)/     dashboard (launcher), profile, change password, launch-denied
src/app/launch/       /launch/<slug>: server-side access check + redirect
src/app/admin/        overview, users, applications (drag & drop), access, roles, settings, audit
src/app/api/          files (logos), health, me
src/server/           db, config, crypto, sessions, rate limits, audit, users, roles,
                      applications, access, files (bucket), email (providers + templates)
src/lib/              shared helpers: permissions, validation, password policy, icons
tests/unit/           Vitest: pure helpers + database rules (single-use tokens, access, roles)
tests/e2e/            Playwright: the complete flows
```
