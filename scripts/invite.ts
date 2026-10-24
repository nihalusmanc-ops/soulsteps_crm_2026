import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
const args = process.argv.slice(2);
const get = (key: string) => args[args.indexOf(key) + 1];
const email = get("--email"),
  subject = get("--subject"),
  name = get("--name"),
  role = get("--role");
if (
  !args.includes("--email") ||
  !args.includes("--subject") ||
  !args.includes("--name") ||
  !args.includes("--role") ||
  !email?.includes("@") ||
  !subject ||
  !name ||
  !["staff", "manager"].includes(role)
) {
  console.error(
    'Usage: npm run users:invite:local -- --email user@example.invalid --subject <verified-access-subject> --name "Staff name" --role staff|manager',
  );
  process.exit(1);
}
if (args.includes("--remote")) {
  console.error(
    "This command is local-only. Apply a reviewed invitation to the target environment using its separate operator procedure.",
  );
  process.exit(1);
}
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;
const id = crypto.randomUUID();
const sql = `INSERT INTO users(id,email,identity_subject,display_name,role,active) VALUES(${[id, email.toLowerCase(), subject, name, role].map(quote).join(",")},1);`;
mkdirSync(".wrangler", { recursive: true });
const file = `.wrangler/invite-${id}.sql`;
writeFileSync(file, sql);
try {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "wrangler.local.jsonc",
      "--file",
      file,
    ],
    { stdio: "inherit" },
  );
  process.exitCode = result.status || 0;
} finally {
  unlinkSync(file);
}
