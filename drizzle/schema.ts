import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    role: text("role", { enum: ["staff", "manager"] }).notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    identitySubject: text("identity_subject").unique(),
    displayName: text("display_name").notNull().default("Staff member"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [check("valid_role", sql`${t.role} IN ('staff','manager')`)],
);
export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    phone: text("phone_e164"),
    email: text("email"),
    contactValidity: text("contact_validity").notNull().default("unknown"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("customer_phone").on(t.phone)],
);
export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: integer("version").notNull(),
  data: text("data", { mode: "json" }).notNull(),
});
export const enquiries = sqliteTable(
  "enquiries",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    stage: text("stage").notNull(),
    revision: integer("revision").notNull().default(0),
    writeToken: text("write_token"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    data: text("data", { mode: "json" }).notNull(),
  },
  (t) => [
    index("enquiry_owner_stage").on(t.ownerId, t.stage),
    index("enquiry_trip_stage").on(t.tripId, t.stage),
    index("enquiry_created").on(t.createdAt),
    check("nonnegative_revision", sql`${t.revision} >= 0`),
  ],
);
export const sources = sqliteTable("enquiry_sources", {
  id: text("id").primaryKey(),
  enquiryId: text("enquiry_id")
    .notNull()
    .references(() => enquiries.id),
  provider: text("provider").notNull(),
  externalKey: text("external_key").unique(),
  originalNote: text("original_note").notNull(),
  rawData: text("raw_data", { mode: "json" }),
});
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    dueAt: text("due_at").notNull(),
    status: text("status").notNull(),
    data: text("data", { mode: "json" }).notNull(),
  },
  (t) => [
    index("task_owner_status_due").on(t.ownerId, t.status, t.dueAt),
    check(
      "valid_task_status",
      sql`${t.status} IN ('pending','completed','cancelled')`,
    ),
  ],
);
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    occurredAt: text("occurred_at").notNull(),
    data: text("data", { mode: "json" }).notNull(),
  },
  (t) => [index("activity_enquiry_time").on(t.enquiryId, t.occurredAt)],
);
export const quotations = sqliteTable(
  "quotations",
  {
    id: text("id").primaryKey(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id),
    amount: integer("amount").notNull(),
    requiredDeposit: integer("required_deposit"),
    currency: text("currency").notNull(),
    data: text("data", { mode: "json" }).notNull(),
  },
  (t) => [
    uniqueIndex("quote_enquiry_id").on(t.enquiryId, t.id),
    check(
      "positive_quote_amount",
      sql`${t.amount} > 0 AND (${t.requiredDeposit} IS NULL OR (${t.requiredDeposit} > 0 AND ${t.requiredDeposit} <= ${t.amount}))`,
    ),
  ],
);
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    receivedAt: text("received_at").notNull(),
    data: text("data", { mode: "json" }).notNull(),
  },
  (t) => [
    index("payment_enquiry_status").on(t.enquiryId, t.status),
    check("positive_payment_amount", sql`${t.amount} > 0`),
    check(
      "valid_payment_status",
      sql`${t.status} IN ('pending','verified','reversed')`,
    ),
  ],
);
export const bookings = sqliteTable("bookings", {
  id: text("id").primaryKey(),
  enquiryId: text("enquiry_id")
    .notNull()
    .unique()
    .references(() => enquiries.id),
  reference: text("reference").notNull().unique(),
  quotationId: text("quotation_id")
    .notNull()
    .references(() => quotations.id),
  amount: integer("amount").notNull(),
  requiredDeposit: integer("required_deposit").notNull(),
  currency: text("currency").notNull(),
  confirmedAt: text("confirmed_at").notNull(),
  confirmedBy: text("confirmed_by")
    .notNull()
    .references(() => users.id),
  data: text("data", { mode: "json" }).notNull(),
});
export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id),
    paymentId: text("payment_id").references(() => payments.id),
    objectKey: text("object_key").notNull().unique(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: text("created_at").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
  },
  (t) => [index("file_enquiry").on(t.enquiryId)],
);
export const idempotency = sqliteTable("idempotency_keys", {
  key: text("key").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  resource: text("resource").notNull(),
  fingerprint: text("fingerprint").notNull(),
  response: text("response").notNull(),
  createdAt: text("created_at").notNull(),
});
export const audit = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id),
    objectId: text("object_id").notNull(),
    action: text("action").notNull(),
    requestId: text("request_id").notNull(),
    createdAt: text("created_at").notNull(),
    data: text("data", { mode: "json" }).notNull(),
  },
  (t) => [index("audit_object_time").on(t.objectId, t.createdAt)],
);
