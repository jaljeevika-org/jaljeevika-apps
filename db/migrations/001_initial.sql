-- Jaljeevika App Portal: initial schema.
-- Applied by scripts/migrate.ts inside one transaction.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Roles and permissions
-- ---------------------------------------------------------------------------
-- rank orders roles by privilege: a non-super-admin may only manage users and
-- roles ranked strictly below their own role.
CREATE TABLE roles (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key         text NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  rank        integer NOT NULL DEFAULT 10 CHECK (rank BETWEEN 1 AND 1000),
  is_system   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roles_name_key ON roles (lower(name));
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z]+(\.[a-z_]+)+$'),
  name        text NOT NULL,
  description text NOT NULL DEFAULT ''
);

CREATE TABLE role_permissions (
  role_id        integer NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES permissions (key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

-- ---------------------------------------------------------------------------
-- Users and sessions
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- Stored lower-cased so the unique index is case-insensitive.
  email                text NOT NULL CHECK (
                         email = lower(email)
                         AND char_length(email) BETWEEN 3 AND 254
                         AND email LIKE '_%@_%'),
  -- Argon2id PHC string. NULL until an invited user sets a password.
  password_hash        text,
  role_id              integer NOT NULL REFERENCES roles (id) ON DELETE RESTRICT,
  is_active            boolean NOT NULL DEFAULT true,
  email_verified       boolean NOT NULL DEFAULT false,
  email_verified_at    timestamptz,
  must_change_password boolean NOT NULL DEFAULT false,
  password_changed_at  timestamptz,
  last_login_at        timestamptz,
  created_by           uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE INDEX users_role_id_idx ON users (role_id);
CREATE INDEX users_name_idx ON users (lower(name));
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only the SHA-256 of the session token is stored; the token itself lives in
-- an HTTP-only cookie.
CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  remember     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ip           text,
  user_agent   text
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- One-time tokens (only hashes are stored)
-- ---------------------------------------------------------------------------
-- purpose 'reset'  = forgot-password link (short-lived)
-- purpose 'invite' = admin-created user sets their first password (longer)
CREATE TABLE password_reset_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  purpose      text NOT NULL DEFAULT 'reset' CHECK (purpose IN ('reset', 'invite')),
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz,
  requested_ip text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id);

-- The token is bound to the address it was sent to, so it stops working if
-- the user's email changes before it is used.
CREATE TABLE email_verification_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  email      text NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_tokens_user_id_idx ON email_verification_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Uploaded files (logos)
-- ---------------------------------------------------------------------------
-- storage 's3'       = object in the Neon Object Storage bucket (storage_key)
-- storage 'database' = bytes kept in this row (fallback when no bucket)
CREATE TABLE files (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage       text NOT NULL CHECK (storage IN ('database', 's3')),
  storage_key   text,
  data          bytea,
  content_type  text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/svg+xml', 'image/webp')),
  size_bytes    integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),
  sha256        text NOT NULL,
  original_name text CHECK (original_name IS NULL OR char_length(original_name) <= 255),
  purpose       text NOT NULL CHECK (purpose IN ('app_logo', 'portal_logo')),
  created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (storage = 'database' AND data IS NOT NULL AND storage_key IS NULL)
    OR (storage = 's3' AND storage_key IS NOT NULL AND data IS NULL)
  )
);

-- ---------------------------------------------------------------------------
-- Applications and access
-- ---------------------------------------------------------------------------
CREATE TABLE applications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable identifier used in launch URLs (/launch/<slug>) and, later, as the
  -- OAuth/OIDC client id.
  slug             text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) <= 60),
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description      text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  -- Absolute http(s) URL, or a path on this portal starting with '/'.
  url              text NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048 AND (url ~* '^https?://' OR url ~ '^/[^/\\]')),
  logo_file_id     uuid REFERENCES files (id) ON DELETE SET NULL,
  icon             text NOT NULL DEFAULT 'app-window' CHECK (icon ~ '^[a-z0-9-]{1,40}$'),
  accent_color     text NOT NULL DEFAULT 'indigo' CHECK (accent_color ~ '^[a-z]{1,20}$'),
  category         text CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 60),
  required_role_id integer REFERENCES roles (id) ON DELETE SET NULL,
  is_active        boolean NOT NULL DEFAULT true,
  display_order    integer NOT NULL DEFAULT 0,
  open_in_new_tab  boolean NOT NULL DEFAULT true,
  -- Give every newly registered or newly created user access automatically.
  auto_grant       boolean NOT NULL DEFAULT false,
  created_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_by       uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX applications_display_order_idx ON applications (display_order, name);
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_applications (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  granted_by     uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, application_id)
);
CREATE INDEX user_applications_application_id_idx ON user_applications (application_id);

-- ---------------------------------------------------------------------------
-- Settings, audit log, rate limits
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- user_id is the actor. Rows survive user deletion (actor becomes NULL; the
-- actor's email is kept in metadata). Never store passwords or tokens here.
CREATE TABLE audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid REFERENCES users (id) ON DELETE SET NULL,
  action      text NOT NULL CHECK (char_length(action) <= 80),
  target_type text,
  target_id   text,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);

-- Fixed-window counters shared by every server instance.
CREATE TABLE rate_limits (
  key          text PRIMARY KEY,
  count        integer NOT NULL,
  window_start timestamptz NOT NULL
);
CREATE INDEX rate_limits_window_start_idx ON rate_limits (window_start);

-- ---------------------------------------------------------------------------
-- Built-in roles, permissions and default settings
-- ---------------------------------------------------------------------------
INSERT INTO permissions (key, name, description) VALUES
  ('users.view',          'View users',               'See the user list and user details.'),
  ('users.manage',        'Manage users',             'Add, edit, disable and delete users, and reset their passwords.'),
  ('applications.manage', 'Manage applications',      'Add, edit, delete, enable/disable and reorder applications and upload logos.'),
  ('access.manage',       'Manage application access','Decide which users can open which applications.'),
  ('roles.manage',        'Manage roles',             'Create roles and change what each role may do.'),
  ('settings.manage',     'Manage portal settings',   'Change portal name, logo, organisation and authentication settings.'),
  ('audit.view',          'View audit log',           'See the security and activity log.');

INSERT INTO roles (key, name, description, rank, is_system) VALUES
  ('super_admin', 'Super Admin', 'Full control of the portal, all users and all applications.', 1000, true),
  ('admin',       'Admin',       'Manages users and applications as permitted by the Super Admin.', 500, true),
  ('user',        'User',        'Signs in and opens the applications assigned to them.', 10, true);

-- Super Admin implicitly has every permission (enforced in code); rows are
-- stored as well so the role page shows them.
INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r CROSS JOIN permissions p WHERE r.key = 'super_admin';

INSERT INTO role_permissions (role_id, permission_key)
SELECT r.id, p.key FROM roles r
JOIN permissions p ON p.key IN ('users.view', 'users.manage', 'applications.manage', 'access.manage', 'audit.view')
WHERE r.key = 'admin';

INSERT INTO settings (key, value) VALUES
  ('portal_name',                '"Jaljeevika App Portal"'),
  ('organization_name',          '"Jaljeevika"'),
  ('portal_logo_file_id',        'null'),
  ('support_email',              'null'),
  ('allow_registration',         'false'),
  ('require_email_verification', 'true'),
  ('session_idle_hours',         '12'),
  ('remember_me_days',           '30');
