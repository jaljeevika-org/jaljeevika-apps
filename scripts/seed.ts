/**
 * Adds Jaljeevika's applications (skipping any whose short name already
 * exists, so it is safe to run again). Roles, permissions and default
 * settings come from the migrations.
 *
 *   npm run db:seed
 *   npm run db:seed -- --demo-users   also create two demo users
 *                                     (password from SEED_DEMO_PASSWORD)
 */
import { connect, flag, loadEnv } from "./lib";
import { hashPassword } from "../src/lib/password-hash";
import { passwordProblems } from "../src/lib/password-policy";

type SeedApp = {
  slug: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  accent: string;
  category: string;
};

const JALJEEVIKA_APPS: SeedApp[] = [
  {
    slug: "jems",
    name: "JEMS",
    description: "Jaljeevika data management on AppSheet.",
    url: "https://www.appsheet.com/start/d632930e-4f1f-4e72-9248-f267073c7cd2?platform=desktop",
    icon: "database",
    accent: "indigo",
    category: "Field data",
  },
  {
    slug: "field-flow",
    name: "Field Flow",
    description: "AI assistant for field notes, notebooks and reports.",
    url: "https://chatbot-492915.el.r.appspot.com/",
    icon: "message-square",
    accent: "violet",
    category: "Field data",
  },
  {
    slug: "pond-mapping",
    name: "Jaljeevika Pond Mapping",
    description: "Explore, map and plan ponds and water bodies.",
    url: "https://jaljeevika-gis.vercel.app/",
    icon: "map",
    accent: "teal",
    category: "GIS & planning",
  },
  {
    slug: "career-portal-admin",
    name: "Career Portal Admin",
    description: "Manage job openings and applications on the careers site.",
    url: "https://careers.jaljeevika.org/admin",
    icon: "briefcase",
    accent: "amber",
    category: "Administration",
  },
];

async function main() {
  loadEnv();
  const { client, target } = await connect(["DATABASE_URL_UNPOOLED", "DATABASE_URL"]);
  console.log(`Database: ${target}`);
  try {
    await client.query("BEGIN");
    let added = 0;
    for (const app of JALJEEVIKA_APPS) {
      const res = await client.query(
        `INSERT INTO applications (slug, name, description, url, icon, accent_color, category, is_active, open_in_new_tab, display_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, true, (SELECT COALESCE(max(display_order), 0) + 1 FROM applications))
         ON CONFLICT (slug) DO NOTHING`,
        [app.slug, app.name, app.description, app.url, app.icon, app.accent, app.category],
      );
      if (res.rowCount) {
        added++;
        console.log(`  + ${app.name}  ${app.url}`);
      } else {
        console.log(`  = ${app.name} already exists, left unchanged`);
      }
    }

    if (flag("demo-users")) {
      const password = process.env.SEED_DEMO_PASSWORD ?? "";
      const problems = passwordProblems(password);
      if (problems.length) throw new Error(`SEED_DEMO_PASSWORD: ${problems[0]}`);
      const hash = await hashPassword(password);
      const demo = [
        { name: "Demo User A", email: "demo.a@example.org", apps: ["jems", "pond-mapping"] },
        { name: "Demo User B", email: "demo.b@example.org", apps: ["field-flow"] },
      ];
      for (const u of demo) {
        const row = await client.query<{ id: string }>(
          `INSERT INTO users (name, email, password_hash, role_id, email_verified, email_verified_at, password_changed_at)
           VALUES ($1, $2, $3, (SELECT id FROM roles WHERE key = 'user'), true, now(), now())
           ON CONFLICT (email) DO NOTHING RETURNING id`,
          [u.name, u.email, hash],
        );
        if (!row.rowCount) {
          console.log(`  = ${u.email} already exists`);
          continue;
        }
        await client.query(
          `INSERT INTO user_applications (user_id, application_id)
           SELECT $1, id FROM applications WHERE slug = ANY($2::text[]) ON CONFLICT DO NOTHING`,
          [row.rows[0].id, u.apps],
        );
        console.log(`  + ${u.email} (access: ${u.apps.join(", ")})`);
      }
    }
    await client.query("COMMIT");
    console.log(added ? `Added ${added} application(s).` : "Applications were already present.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`Seed failed: ${(err as Error).message}`);
  process.exit(1);
});
