import { beforeEach, afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { Repository } from "../src/server/repository";
import { seed } from "../src/shared/seed";

let sqlite: DatabaseSync, db: D1Database;
class Statement {
  constructor(
    readonly query: string,
    readonly values: any[] = [],
  ) {}
  bind(...values: any[]) {
    return new Statement(this.query, values);
  }
  async all() {
    return {
      success: true,
      results: sqlite.prepare(this.query).all(...this.values),
      meta: {
        changes: Number(sqlite.prepare("SELECT changes() AS n").get()!.n),
      },
    };
  }
  async first(column?: string) {
    const row = sqlite.prepare(this.query).get(...this.values);
    return column ? (row?.[column] ?? null) : (row ?? null);
  }
  async raw() {
    return (await this.all()).results.map((row) => Object.values(row));
  }
  async run() {
    return this.all();
  }
}
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync("drizzle/migrations/" + file, "utf8"));
  for (const id of ["STAFF-A", "STAFF-B"])
    sqlite
      .prepare(
        "INSERT INTO users(id,email,role,active,display_name) VALUES(?,?,'staff',1,?)",
      )
      .run(id, id.toLowerCase() + "@example.invalid", id);
  const trip = seed().trips[0];
  sqlite
    .prepare("INSERT INTO trips(id,name,version,data) VALUES(?,?,?,?)")
    .run(trip.id, trip.name, trip.version, JSON.stringify(trip));
  for (const shared of [true, false]) {
    const id = shared ? "SHARED" : "PRIVATE",
      e = {
        ...seed().enquiries[0],
        id,
        customerId: id,
        ownerId: "STAFF-B",
        shared,
        tripId: trip.id,
        revision: 0,
        stage: "NEW",
        tasks: [],
        activities: [],
        payments: [],
        quote: undefined,
        booking: undefined,
      };
    sqlite
      .prepare(
        "INSERT INTO customers(id,name,contact_validity,created_at) VALUES(?,?,'unknown',?)",
      )
      .run(id, "Fictional " + id, new Date().toISOString());
    sqlite
      .prepare(
        "INSERT INTO enquiries(id,customer_id,trip_id,owner_id,stage,revision,created_at,updated_at,data) VALUES(?,?,?,'STAFF-B','NEW',0,?,?,?)",
      )
      .run(id, id, trip.id, e.createdAt, e.createdAt, JSON.stringify(e));
  }
  db = {
    prepare: (query: string) => new Statement(query),
    batch: async (statements: Statement[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const stmt of statements) results.push(await stmt.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
});
afterEach(() => sqlite.close());
it("persists contact and trip edits while preserving original notes", async () => {
  const repository = new Repository(db, staff);
  const before = await repository.enquiry("SHARED");
  await repository.command(
    "SHARED",
    0,
    {
      type: "qualify",
      group: "family",
      visa: "unknown",
      temperature: "warm",
      availability: "pending",
      name: "Fictional Updated",
      email: "updated@example.invalid",
      phone: "+971500000001",
      travellers: 3,
      selfDrive: "yes",
      desiredDeparture: "2027-02-15",
      bookingTimeframe: "Next month",
    },
    "edit-details",
    "edit-fingerprint",
    "edit-request",
  );
  const after = await repository.enquiry("SHARED");
  expect(after).toMatchObject({
    name: "Fictional Updated",
    email: "updated@example.invalid",
    phone: "+971500000001",
    travellers: 3,
    selfDrive: "yes",
    desiredDeparture: "2027-02-15",
    bookingTimeframe: "Next month",
    revision: 1,
  });
  expect(after.originalNote).toBe(before.originalNote);
  expect(
    sqlite
      .prepare("SELECT contact_validity FROM customers WHERE id='SHARED'")
      .get()!.contact_validity,
  ).toBe("submitted");
});
it("rejects contact numbers already used by another customer", async () => {
  sqlite
    .prepare("UPDATE customers SET phone_e164=? WHERE id='PRIVATE'")
    .run("+971500000002");
  const repository = new Repository(db, staff);
  await expect(
    repository.command(
      "SHARED",
      0,
      {
        type: "qualify",
        group: "solo",
        visa: "unknown",
        temperature: "warm",
        availability: "pending",
        phone: "+971500000002",
      },
      "duplicate-contact",
      "duplicate-fingerprint",
      "duplicate-request",
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect((await repository.enquiry("SHARED")).revision).toBe(0);
});
const staff = {
  id: "STAFF-A",
  name: "Fictional staff A",
  role: "staff" as const,
  local: false,
};
it("reuses the chosen customer and preserves their contact details", async () => {
  sqlite
    .prepare("UPDATE customers SET email=?,phone_e164=? WHERE id='SHARED'")
    .run("repeat@example.invalid", "+971500000003");
  const repository = new Repository(db, staff);
  const response = await repository.create(
    {
      name: "Ignored replacement",
      customerId: "SHARED",
      tripId: seed().trips[0].id,
    },
    "repeat-customer",
    "repeat",
    "request",
  );
  expect(await repository.enquiry(String(response.id))).toMatchObject({
    customerId: "SHARED",
    name: "Fictional SHARED",
    email: "repeat@example.invalid",
    phone: "+971500000003",
  });
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM customers").get()!.n).toBe(
    2,
  );
  await expect(
    repository.create(
      { name: "Private", customerId: "PRIVATE", tripId: seed().trips[0].id },
      "private-customer",
      "private",
      "request",
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("requires a manager to delete and cancels follow-ups while retaining history and customers", async () => {
  const repository = new Repository(db, staff);
  await expect(
    repository.remove("enquiry", "SHARED", 0, "staff-delete", "request"),
  ).rejects.toMatchObject({ status: 403 });
  await repository.command(
    "SHARED",
    0,
    {
      type: "task",
      kind: "Follow-up",
      due: "2027-01-20T10:00:00Z",
      note: "Synthetic follow-up",
    },
    "delete-task",
    "task",
    "request",
  );
  const manager = new Repository(db, { ...staff, role: "manager" });
  await expect(
    manager.remove("enquiry", "SHARED", 0, "stale-delete", "request"),
  ).rejects.toMatchObject({ status: 409 });
  await manager.remove("enquiry", "SHARED", 1, "manager-delete", "request");
  await expect(manager.enquiry("SHARED")).rejects.toMatchObject({
    status: 404,
  });
  expect(
    sqlite.prepare("SELECT status FROM tasks WHERE enquiry_id='SHARED'").get()!
      .status,
  ).toBe("cancelled");
  expect(
    sqlite
      .prepare("SELECT status FROM scheduled_actions WHERE enquiry_id='SHARED'")
      .get()!.status,
  ).toBe("cancelled");
  expect(
    sqlite
      .prepare("SELECT COUNT(*) AS n FROM activities WHERE enquiry_id='SHARED'")
      .get()!.n,
  ).toBeGreaterThan(0);
  expect(
    sqlite.prepare("SELECT id FROM customers WHERE id='SHARED'").get(),
  ).toBeTruthy();
  expect(
    await manager.remove("enquiry", "SHARED", 1, "manager-delete", "request"),
  ).toEqual({ ok: true });
  expect(await repository.customers("SHARED")).toEqual([
    expect.objectContaining({ id: "SHARED" }),
  ]);
  expect(await repository.customers("PRIVATE")).toEqual([]);
  const repeat = await repository.create(
    {
      name: "Fictional SHARED",
      customerId: "SHARED",
      tripId: seed().trips[0].id,
    },
    "reuse-deleted-customer",
    "reuse",
    "request",
  );
  expect((await repository.enquiry(String(repeat.id))).customerId).toBe(
    "SHARED",
  );
  await expect(
    repository.command(
      "SHARED",
      2,
      { type: "note", text: "Should not save" },
      "deleted-edit",
      "edit",
      "request",
    ),
  ).rejects.toMatchObject({ status: 404 });
});
it("protects financial records from deletion", async () => {
  const repository = new Repository(db, { ...staff, role: "manager" });
  sqlite
    .prepare(
      "INSERT INTO payments(id,enquiry_id,amount,currency,status,received_at,data) VALUES('PAY','SHARED',100,'AED','pending',?,'{}')",
    )
    .run(new Date().toISOString());
  await expect(
    repository.remove("enquiry", "SHARED", 0, "financial-delete", "request"),
  ).rejects.toMatchObject({ status: 409, code: "DELETE_BLOCKED" });
  expect((await repository.enquiry("SHARED")).revision).toBe(0);
  expect(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS n FROM audit_events WHERE action='enquiry.delete'",
      )
      .get()!.n,
  ).toBe(0);
});
it("protects linked trips and prevents reuse of deleted trips", async () => {
  const repository = new Repository(db, { ...staff, role: "manager" });
  const trip = seed().trips[0];
  await expect(
    repository.remove("trip", trip.id, trip.version, "linked-trip", "request"),
  ).rejects.toMatchObject({ status: 409 });
  const empty = { ...trip, id: "EMPTY" };
  sqlite
    .prepare("INSERT INTO trips(id,name,version,data) VALUES(?,?,?,?)")
    .run(empty.id, empty.name, empty.version, JSON.stringify(empty));
  await repository.remove(
    "trip",
    empty.id,
    empty.version,
    "empty-trip",
    "request",
  );
  expect((await repository.state()).trips.some((t) => t.id === empty.id)).toBe(
    false,
  );
  await expect(
    repository.saveTrip(empty, "restore-edit", "restore", "request"),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    repository.create(
      { name: "New", tripId: empty.id },
      "deleted-trip-create",
      "new",
      "request",
    ),
  ).rejects.toMatchObject({ status: 400 });
  expect(() =>
    sqlite
      .prepare("UPDATE enquiries SET trip_id='EMPTY' WHERE id='SHARED'")
      .run(),
  ).toThrow(/Trip is deleted/);
  expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
it("shares team enquiries across staff while preserving private ownership boundaries", async () => {
  const repository = new Repository(db, staff),
    state = await repository.state();
  expect(state.enquiries.map((e) => e.id)).toEqual(["SHARED"]);
  expect((await repository.enquiry("SHARED")).owner).toBe("Shared team");
  await expect(repository.enquiry("PRIVATE")).rejects.toMatchObject({
    status: 404,
  });
});
it("allows shared operational updates without granting manager financial permissions", async () => {
  const repository = new Repository(db, staff);
  await repository.command(
    "SHARED",
    0,
    {
      type: "stage",
      stage: "QUALIFYING",
      reason: "Fictional shared follow-up",
    },
    "shared-stage",
    "fingerprint",
    "request",
  );
  expect((await repository.enquiry("SHARED")).stage).toBe("QUALIFYING");
  await expect(
    repository.command(
      "SHARED",
      1,
      { type: "reverse", paymentId: "fictional", reason: "Not authorized" },
      "shared-reverse",
      "fingerprint",
      "request",
    ),
  ).rejects.toMatchObject({ status: 403 });
});
