import { pbkdf2Sync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const persist = process.argv[2];
if (!persist || process.env.SOULSTEPS_PASSWORD_TEST !== "1")
  throw new Error("Isolated password test storage required.");
const sql = ["DEMO-MANAGER", "DEMO-STAFF"]
  .map((id) => {
    const salt = randomBytes(32).toString("hex");
    const hash = pbkdf2Sync(
      "Fictional browser passphrase 2026!",
      Buffer.from(salt, "hex"),
      600000,
      32,
      "sha256",
    ).toString("hex");
    return `INSERT INTO auth_credentials(user_id,salt,hash,version,updated_at) VALUES('${id}','${salt}','${hash}',1,'${new Date().toISOString()}');`;
  })
  .join("\n");
const file = ".wrangler/password-test-seed.sql";
writeFileSync(file, sql);
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "wrangler.password-test.jsonc",
    "--persist-to",
    persist,
    "--file",
    file,
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status || 0;
