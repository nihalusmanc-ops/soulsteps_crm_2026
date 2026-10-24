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

export const settings = sqliteTable("workspace_settings", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(0),
  data: text("data", { mode: "json" }).notNull(),
  writeToken: text("write_token"),
});
export const ruleVersions = sqliteTable(
  "priority_rule_versions",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    version: integer("version").notNull(),
    rules: text("rules", { mode: "json" }).notNull(),
    reviewedBy: text("reviewed_by")
      .notNull()
      .references(() => users.id),
    reviewedAt: text("reviewed_at").notNull(),
  },
  (t) => [uniqueIndex("rule_trip_version").on(t.tripId, t.version)],
);
export const rulePreviews = sqliteTable("rule_previews", {
  id: text("id").primaryKey(),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => users.id),
  tripVersion: integer("trip_version").notNull(),
  snapshot: text("snapshot").notNull(),
  data: text("data", { mode: "json" }).notNull(),
  expiresAt: text("expires_at").notNull(),
});
export const scheduledActions = sqliteTable(
  "scheduled_actions",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    enquiryId: text("enquiry_id").references(() => enquiries.id),
    taskId: text("task_id").references(() => tasks.id),
    dueAt: text("due_at").notNull(),
    expectedDue: text("expected_due"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    dispatchAttempts: integer("dispatch_attempts").notNull().default(0),
    nextRetryAt: text("next_retry_at").notNull(),
    leaseUntil: text("lease_until"),
    token: text("token"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    index("jobs_due_status_retry").on(t.status, t.dueAt, t.nextRetryAt),
    index("jobs_task").on(t.taskId),
    check(
      "job_status_check",
      sql`${t.status} IN ('pending','queued','processing','succeeded','failed','cancelled','held')`,
    ),
    check("job_kind_check", sql`${t.kind} IN ('task_due','backup')`),
  ],
);
export const jobAttempts = sqliteTable(
  "job_attempts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => scheduledActions.id),
    phase: text("phase").notNull(),
    at: text("at").notNull(),
    outcome: text("outcome").notNull(),
    error: text("error"),
  },
  (t) => [index("job_attempt_history").on(t.jobId, t.at)],
);
export const notifications = sqliteTable(
  "in_app_notifications",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .unique()
      .references(() => scheduledActions.id),
    enquiryId: text("enquiry_id")
      .notNull()
      .references(() => enquiries.id),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull(),
    readAt: text("read_at"),
  },
  (t) => [index("notification_owner_unread").on(t.ownerId, t.readAt)],
);
export const backupRuns = sqliteTable("backup_runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
  objectKey: text("object_key"),
  checksum: text("checksum"),
  counts: text("counts"),
  cursor: integer("cursor").notNull().default(0),
  receiptManifest: text("receipt_manifest").notNull().default("[]"),
  lastError: text("last_error"),
});
export const tripContentVersions = sqliteTable(
  "trip_content_versions",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id")
      .notNull()
      .references(() => trips.id),
    version: integer("version").notNull(),
    content: text("content", { mode: "json" }).notNull(),
    publishedBy: text("published_by")
      .notNull()
      .references(() => users.id),
    publishedAt: text("published_at").notNull(),
  },
  (t) => [uniqueIndex("content_trip_version").on(t.tripId, t.version)],
);
export const serviceStatus = sqliteTable("service_status", {
  id: text("id").primaryKey(),
  lastStarted: text("last_started"),
  lastSuccess: text("last_success"),
  lastError: text("last_error"),
});
export const storageReview = sqliteTable("storage_review", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  data: text("data", { mode: "json" }).notNull(),
});
export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  checksum: text("checksum").notNull().unique(),
  mappingVersion: text("mapping_version").notNull(),
  rawText: text("raw_text").notNull(),
  objectKey: text("object_key").notNull(),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: text("created_at").notNull(),
});
export const importRows = sqliteTable(
  "import_rows",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatches.id),
    rowNumber: integer("row_number").notNull(),
    revision: integer("revision").notNull().default(0),
    status: text("status").notNull(),
    data: text("data").notNull(),
    review: text("review"),
    enquiryId: text("enquiry_id").references(() => enquiries.id),
    error: text("error"),
    token: text("token"),
  },
  (t) => [uniqueIndex("import_batch_row").on(t.batchId, t.rowNumber)],
);
