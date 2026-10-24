import type { Bindings } from "./types";
import type { Identity } from "../shared/api";
import type { Enquiry } from "../shared/domain";
import {
  importDocumentSchema,
  previewImport,
  type PreviewRow,
} from "../shared/import-preview";
import type {
  ImportBatch,
  ImportReview,
  StoredImportRow,
} from "../shared/imports";
import { ApiError } from "./errors";
import { digest } from "./request";
type DbRow = Omit<StoredImportRow, "data" | "review"> & {
  data: string;
  review: string | null;
};
const decode = (r: DbRow): StoredImportRow => ({
  ...r,
  data: JSON.parse(r.data),
  review: r.review ? JSON.parse(r.review) : null,
});
export class ImportService {
  constructor(
    readonly env: Bindings,
    readonly actor: Identity,
  ) {}
  async batch(id: string): Promise<ImportBatch> {
    const batch = await this.env.DB.prepare(
      "SELECT id,checksum,mapping_version,created_at FROM import_batches WHERE id=?",
    )
      .bind(id)
      .first<ImportBatch>();
    if (!batch)
      throw new ApiError(404, "IMPORT_NOT_FOUND", "Import batch not found.");
    const rows = (
      await this.env.DB.prepare(
        "SELECT * FROM import_rows WHERE batch_id=? ORDER BY row_number",
      )
        .bind(id)
        .all<DbRow>()
    ).results.map(decode);
    const counts = { review: 0, ready: 0, committed: 0, skip: 0 };
    for (const row of rows) counts[row.status]++;
    return { ...batch, rows, counts };
  }
  async upload(text: string) {
    if (new TextEncoder().encode(text).length > 1024 * 1024)
      throw new ApiError(
        413,
        "IMPORT_SIZE",
        "Import limit: 1 MB and 500 rows.",
      );
    const document = importDocumentSchema.parse(JSON.parse(text));
    let rows: PreviewRow[];
    try {
      rows = previewImport(document).rows;
    } catch {
      throw new ApiError(
        400,
        "IMPORT_MAPPING",
        "Unsupported mapping. Use the controlled preprocessing contract.",
      );
    }
    const checksum = await digest(text),
      id = `import-${checksum}`,
      now = new Date().toISOString(),
      objectKey = `imports/${checksum}.json`;
    if (
      await this.env.DB.prepare("SELECT id FROM import_batches WHERE id=?")
        .bind(id)
        .first()
    )
      return this.batch(id);
    // D1 retains the exact bounded source text too, so backup/restore retains
    // evidence even if the private R2 copy needs recovery.
    await this.env.FILES_BUCKET.put(objectKey, text, {
      httpMetadata: { contentType: "application/json" },
    });
    const db = this.env.DB;
    await db.batch([
      db
        .prepare(
          "INSERT OR IGNORE INTO import_batches(id,checksum,mapping_version,raw_text,object_key,created_by,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          id,
          checksum,
          document.mappingVersion || "synthetic-v1",
          text,
          objectKey,
          this.actor.id,
          now,
        ),
      ...rows.map((row) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO import_rows(id,batch_id,row_number,status,data) VALUES(?,?,?,?,?)",
          )
          .bind(
            `${id}:${row.row}`,
            id,
            row.row,
            row.status === "skip" ? "skip" : "review",
            JSON.stringify(row),
          ),
      ),
    ]);
    return this.batch(id);
  }
  async review(id: string, rowId: string, input: ImportReview) {
    const row = (await this.batch(id)).rows.find((r) => r.id === rowId);
    if (!row) throw new ApiError(404, "ROW_NOT_FOUND", "Import row not found.");
    const r = row.data;
    if (
      row.status === "committed" ||
      row.status === "skip" ||
      r.version === "unknown" ||
      !/^\d+$/.test(r.sourceId) ||
      !r.name.trim() ||
      r.name.length > 100 ||
      r.reasons.some((v) =>
        /Duplicate external ID|Incomplete row shape/.test(v),
      )
    )
      throw new ApiError(
        400,
        "ROW_BLOCKED",
        "This row cannot be committed. Correct its source mapping in a new batch; preserve the original batch.",
      );
    if (input.verifiedPhone && !r.phone)
      throw new ApiError(
        400,
        "PHONE_INVALID",
        "A shortened or missing phone cannot be verified.",
      );
    const valid = await this.env.DB.prepare(
      "SELECT 1 FROM trips WHERE id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND role='staff')",
    )
      .bind(input.tripId, input.ownerId)
      .first();
    if (!valid)
      throw new ApiError(
        400,
        "IMPORT_ASSIGNMENT",
        "Choose an existing trip and active staff owner.",
      );
    const result = await this.env.DB.prepare(
      "UPDATE import_rows SET status='ready',review=?,error=NULL,revision=revision+1 WHERE id=? AND batch_id=? AND revision=? AND status IN ('review','ready')",
    )
      .bind(
        JSON.stringify({
          ...input,
          actor: this.actor.id,
          at: new Date().toISOString(),
        }),
        rowId,
        id,
        input.revision,
      )
      .run();
    if (!result.meta.changes)
      throw new ApiError(
        409,
        "IMPORT_CHANGED",
        "Row changed. Reload before reviewing.",
      );
    return this.batch(id);
  }
  async commit(id: string, selected: string[]) {
    const batch = await this.batch(id);
    for (const rowId of selected) {
      const row = batch.rows.find((r) => r.id === rowId);
      if (!row)
        throw new ApiError(
          400,
          "ROW_NOT_FOUND",
          "Selected row is not in this batch.",
        );
      if (row.status !== "ready") continue;
      try {
        await this.commitRow(id, row);
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : "Commit failed; retry this row. No partial row writes were retained.";
        await this.env.DB.prepare(
          "UPDATE import_rows SET error=?,status=?,revision=revision+1 WHERE id=? AND status='ready' AND revision=?",
        )
          .bind(
            message,
            error instanceof ApiError && error.code === "CONTACT_CONFLICT"
              ? "review"
              : "ready",
            row.id,
            row.revision,
          )
          .run();
      }
    }
    return this.batch(id);
  }
  private async commitRow(batchId: string, row: StoredImportRow) {
    const db = this.env.DB,
      r = row.data,
      review = row.review!;
    const externalKey = `historical:${r.sourceId}`;
    const existing = await db
      .prepare("SELECT enquiry_id FROM enquiry_sources WHERE external_key=?")
      .bind(externalKey)
      .first<{ enquiry_id: string }>();
    if (existing) {
      await db
        .prepare(
          "UPDATE import_rows SET status='skip',enquiry_id=?,error='Existing external ID: preserved enquiry and staff edits; no source changes applied',revision=revision+1 WHERE id=? AND revision=? AND status='ready'",
        )
        .bind(existing.enquiry_id, row.id, row.revision)
        .run();
      return;
    }
    const phone = review.verifiedPhone ? r.phone : null;
    const matches = phone
      ? (
          await db
            .prepare(
              "SELECT id,name,email FROM customers WHERE phone_e164=? AND contact_validity='verified'",
            )
            .bind(phone)
            .all<{ id: string; name: string; email: string | null }>()
        ).results
      : [];
    const rawEmail = r.raw.cells[4]?.trim() || "";
    const email =
      rawEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
        ? rawEmail
        : "";
    if (
      matches.length > 1 ||
      (matches.length === 1 &&
        (matches[0].name.trim().toLowerCase() !== r.name.trim().toLowerCase() ||
          (email &&
            matches[0].email &&
            email.toLowerCase() !== matches[0].email.toLowerCase())))
    )
      throw new ApiError(
        409,
        "CONTACT_CONFLICT",
        "Contact evidence conflicts with an existing customer. Keep quarantined for manual resolution.",
      );
    const customerId = matches[0]?.id || crypto.randomUUID(),
      enquiryId = crypto.randomUUID(),
      token = crypto.randomUUID(),
      now = new Date().toISOString();
    const e: Enquiry = {
      id: enquiryId,
      customerId,
      name: r.name,
      email,
      phone,
      tripId: review.tripId,
      ownerId: review.ownerId,
      owner: "",
      stage: "NEW",
      temperature: "unassessed",
      group: "unknown",
      visa: "unknown",
      travellers: null,
      rank: null,
      rankReason:
        "Needs qualification: imported answers require staff assessment.",
      response: "none",
      source: "Historical import",
      createdAt: now,
      originalNote: r.notes.join("\n"),
      originalGroup: r.group,
      availability: "pending",
      tasks: [],
      activities: [],
      payments: [],
      revision: 0,
    };
    const gate =
      "EXISTS(SELECT 1 FROM import_rows WHERE id=? AND token=? AND status='ready')";
    const activity = {
      id: crypto.randomUUID(),
      type: "source",
      actor: "Historical import",
      at: now,
      text: `Imported source ${r.sourceId}. Received ${now}; source date (uninterpreted): ${r.raw.cells[1] || "missing"}. Original notes: ${e.originalNote || "none"}. No historical calls or booking inferred.`,
    };
    const statements = [
      db
        .prepare(
          "UPDATE import_rows SET token=? WHERE id=? AND revision=? AND status='ready' AND EXISTS(SELECT 1 FROM users WHERE id=? AND active=1 AND role='staff') AND NOT EXISTS(SELECT 1 FROM enquiry_sources WHERE external_key=?) AND (SELECT COUNT(*) FROM customers WHERE phone_e164=? AND contact_validity='verified')=? AND (? IS NULL OR EXISTS(SELECT 1 FROM customers WHERE id=? AND name=? AND email IS ? AND phone_e164=? AND contact_validity='verified'))",
        )
        .bind(
          token,
          row.id,
          row.revision,
          review.ownerId,
          externalKey,
          phone,
          matches.length,
          matches[0]?.id || null,
          matches[0]?.id || null,
          matches[0]?.name || null,
          matches[0]?.email || null,
          phone,
        ),
    ];
    if (!matches.length)
      statements.push(
        db
          .prepare(
            `INSERT INTO customers(id,name,email,phone_e164,contact_validity,created_at) SELECT ?,?,?,?,?,? WHERE ${gate}`,
          )
          .bind(
            customerId,
            r.name,
            email || null,
            phone,
            phone ? "verified" : "unknown",
            now,
            row.id,
            token,
          ),
      );
    statements.push(
      db
        .prepare(
          `INSERT INTO enquiries(id,customer_id,trip_id,owner_id,stage,revision,created_at,updated_at,data) SELECT ?,?,?,?,'NEW',0,?,?,? WHERE ${gate}`,
        )
        .bind(
          enquiryId,
          customerId,
          review.tripId,
          review.ownerId,
          now,
          now,
          JSON.stringify(e),
          row.id,
          token,
        ),
      db
        .prepare(
          `INSERT INTO enquiry_sources(id,enquiry_id,provider,external_key,original_note,raw_data) SELECT ?,?,'Historical import',?,?,? WHERE ${gate}`,
        )
        .bind(
          crypto.randomUUID(),
          enquiryId,
          externalKey,
          e.originalNote,
          JSON.stringify({ batchId, row: r, review }),
          row.id,
          token,
        ),
      db
        .prepare(
          `INSERT INTO activities(id,enquiry_id,actor_id,occurred_at,data) SELECT ?,?,'SYSTEM',?,? WHERE ${gate}`,
        )
        .bind(
          activity.id,
          enquiryId,
          now,
          JSON.stringify(activity),
          row.id,
          token,
        ),
      db
        .prepare(
          `INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) SELECT ?,?,?,'import.commit',?,?,? WHERE ${gate}`,
        )
        .bind(
          crypto.randomUUID(),
          this.actor.id,
          enquiryId,
          token,
          now,
          JSON.stringify({
            batchId,
            rowId: row.id,
            review,
            customerMatched: !!matches.length,
          }),
          row.id,
          token,
        ),
      db
        .prepare(
          "UPDATE import_rows SET status='committed',enquiry_id=?,error=NULL,token=NULL,revision=revision+1 WHERE id=? AND token=? AND status='ready'",
        )
        .bind(enquiryId, row.id, token),
    );
    const result = await db.batch(statements);
    if (!result[0].meta.changes)
      throw new ApiError(
        409,
        "IMPORT_CHANGED",
        "Source, contact or assignment changed. Reload and retry; no row was written.",
      );
  }
}
