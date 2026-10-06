/**
 * Creates the first Super Admin (or promotes an existing account).
 *
 *   npm run create-admin -- --email you@jaljeevika.org --name "Your Name"
 *
 * The password is asked for interactively and never echoed. For automation
 * pipe it on stdin (… --password-stdin < file) — avoid putting it in shell
 * history. Use --force to turn an existing account into a Super Admin and
 * replace its password. Use --temporary to make the person choose their own
 * password at first sign-in (for a password you hand over to someone).
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { arg, connect, flag, loadEnv } from "./lib";
import { hashPassword } from "../src/lib/password-hash";
import { passwordProblems } from "../src/lib/password-policy";

function ask(question: string, hidden = false): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding as BufferEncoding);
      callback();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY ?? false });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden;
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

async function main() {
  loadEnv();
  const email = (arg("email") ?? (await ask("Email: "))).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  const name = (arg("name") ?? (await ask("Full name: "))).trim();
  if (!name || name.length > 120) throw new Error("Enter a name (1–120 characters).");

  let password: string;
  if (flag("password-stdin")) {
    password = await readStdin();
  } else {
    if (!process.stdin.isTTY) throw new Error("No terminal for the password prompt. Use --password-stdin.");
    password = await ask("Password (hidden): ", true);
    const again = await ask("Repeat password: ", true);
    if (password !== again) throw new Error("The passwords do not match.");
  }
  const problems = passwordProblems(password, { email, name });
  if (problems.length) throw new Error(problems.join(" "));

  const temporary = flag("temporary");
  const { client, target } = await connect(["DATABASE_URL_UNPOOLED", "DATABASE_URL"]);
  console.log(`Database: ${target}`);
  try {
    const hash = await hashPassword(password);
    await client.query("BEGIN");
    const role = await client.query<{ id: number }>("SELECT id FROM roles WHERE key = 'super_admin'");
    if (!role.rowCount) throw new Error("Role super_admin is missing. Run `npm run db:migrate` first.");
    const existing = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1 FOR UPDATE", [email]);
    let userId: string;
    if (existing.rowCount) {
      if (!flag("force")) throw new Error(`${email} already has an account. Re-run with --force to make it a Super Admin and replace its password.`);
      userId = existing.rows[0].id;
      await client.query(
        `UPDATE users SET name = $2, password_hash = $3, role_id = $4, is_active = true, email_verified = true,
           email_verified_at = COALESCE(email_verified_at, now()), must_change_password = $5, password_changed_at = now()
         WHERE id = $1`,
        [userId, name, hash, role.rows[0].id, temporary],
      );
      await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    } else {
      const row = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, role_id, email_verified, email_verified_at, password_changed_at, must_change_password)
         VALUES ($1, $2, $3, $4, true, now(), now(), $5) RETURNING id`,
        [name, email, hash, role.rows[0].id, temporary],
      );
      userId = row.rows[0].id;
    }
    await client.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, metadata) VALUES ($1::uuid, $2, 'user', $1::text, $3)`,
      [userId, existing.rowCount ? "user.promoted_super_admin" : "user.created", JSON.stringify({ email, via: "cli", role: "super_admin", temporary })],
    );
    await client.query("COMMIT");
    console.log(`${existing.rowCount ? "Updated" : "Created"} Super Admin ${email}${temporary ? " (temporary password: they choose their own at first sign-in)" : ""}. Sign in at your portal address + /login`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`create-admin failed: ${(err as Error).message}`);
  process.exit(1);
});
