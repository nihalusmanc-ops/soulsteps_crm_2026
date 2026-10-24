import { seed } from "../src/shared/seed";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
const q = (v: unknown) =>
  v === null || v === undefined
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : `'${String(v).replaceAll("'", "''")}'`;
const insert = (table: string, row: Record<string, unknown>, ignore = false) =>
  `INSERT ${ignore ? "OR IGNORE " : ""}INTO ${table}(${Object.keys(row).join(",")}) VALUES(${Object.values(row).map(q).join(",")});`;
const state = seed();
const sql: string[] = [];
const now = new Date().toISOString();
for (const [id, email, role, name] of [
  ["DEMO-STAFF", "staff@example.invalid", "staff", "Demo staff"],
  ["DEMO-MANAGER", "manager@example.invalid", "manager", "Demo manager"],
  ["DEMO-OTHER", "other@example.invalid", "staff", "Other demo staff"],
])
  sql.push(
    insert(
      "users",
      { id, email, role, active: 1, display_name: name, created_at: now },
      true,
    ),
  );
for (const t of state.trips)
  sql.push(
    insert(
      "trips",
      { id: t.id, name: t.name, version: t.version, data: JSON.stringify(t) },
      true,
    ),
  );
for (const e of state.enquiries) {
  sql.push(
    insert(
      "customers",
      {
        id: e.customerId,
        name: e.name,
        email: e.email,
        phone_e164: null,
        created_at: e.createdAt,
      },
      true,
    ),
  );
  const { tasks, activities, payments, quote, booking, ...base } = e;
  sql.push(
    insert(
      "enquiries",
      {
        id: e.id,
        customer_id: e.customerId,
        trip_id: e.tripId,
        owner_id: "DEMO-STAFF",
        stage: e.stage,
        revision: e.revision,
        created_at: e.createdAt,
        updated_at: e.createdAt,
        data: JSON.stringify(base),
      },
      true,
    ),
  );
  sql.push(
    insert(
      "enquiry_sources",
      {
        id: `source-${e.id}`,
        enquiry_id: e.id,
        provider: e.source,
        external_key: `fixture:${e.id}`,
        original_note: e.originalNote,
      },
      true,
    ),
  );
  for (const t of tasks)
    sql.push(
      insert(
        "tasks",
        {
          id: t.id,
          enquiry_id: e.id,
          owner_id: "DEMO-STAFF",
          due_at: t.due,
          status: t.status,
          data: JSON.stringify(t),
        },
        true,
      ),
    );
  for (const a of activities)
    sql.push(
      insert(
        "activities",
        {
          id: a.id,
          enquiry_id: e.id,
          actor_id: "DEMO-STAFF",
          occurred_at: a.at,
          data: JSON.stringify(a),
        },
        true,
      ),
    );
  if (quote)
    sql.push(
      insert(
        "quotations",
        {
          id: quote.id,
          enquiry_id: e.id,
          amount: quote.total,
          required_deposit: quote.deposit,
          currency: quote.currency,
          data: JSON.stringify(quote),
        },
        true,
      ),
    );
  for (const p of payments)
    sql.push(
      insert(
        "payments",
        {
          id: p.id,
          enquiry_id: e.id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          received_at: p.date,
          data: JSON.stringify(p),
        },
        true,
      ),
    );
  if (booking)
    sql.push(
      insert(
        "bookings",
        {
          id: `booking-${e.id}`,
          enquiry_id: e.id,
          reference: booking.reference,
          quotation_id: quote!.id,
          amount: quote!.total,
          required_deposit: quote!.deposit,
          currency: quote!.currency,
          confirmed_at: booking.confirmedAt,
          confirmed_by: "DEMO-STAFF",
          data: JSON.stringify(booking),
        },
        true,
      ),
    );
}
// Explicitly separate an unassigned-to-primary-staff record to exercise API ownership.
const other = {
  ...state.enquiries[0],
  id: "DEMO-PRIVATE",
  ownerId: "DEMO-OTHER",
  name: "Other owner fixture",
  customerId: "CUSTOMER-OTHER",
  tasks: [],
  activities: [],
  payments: [],
};
sql.push(
  insert(
    "customers",
    { id: other.customerId, name: other.name, created_at: now },
    true,
  ),
);
sql.push(
  insert(
    "enquiries",
    {
      id: other.id,
      customer_id: other.customerId,
      trip_id: other.tripId,
      owner_id: "DEMO-OTHER",
      stage: "NEW",
      revision: 0,
      created_at: now,
      updated_at: now,
      data: JSON.stringify(other),
    },
    true,
  ),
);
mkdirSync(".wrangler", { recursive: true });
const file = ".wrangler/local-seed.sql";
writeFileSync(file, sql.join("\n"));
const args = [
  "node_modules/wrangler/bin/wrangler.js",
  "d1",
  "execute",
  "DB",
  "--local",
  "--config",
  "wrangler.local.jsonc",
  "--file",
  file,
];
const persist = process.argv[2];
if (persist) args.push("--persist-to", persist);
try {
  const r = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
  if (r.status !== 0) process.exitCode = r.status || 1;
} finally {
  unlinkSync(file);
}
