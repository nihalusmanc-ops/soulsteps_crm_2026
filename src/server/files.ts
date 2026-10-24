import { Hono } from "hono";
import { ApiError } from "./errors";
import { Repository } from "./repository";
import type { AppEnv } from "./types";
import { digest, requestKey } from "./request";
export const filesRoutes = new Hono<AppEnv>();
const allowed: Record<
  string,
  { extension: string; signature: (b: Uint8Array) => boolean }
> = {
  "application/pdf": {
    extension: "pdf",
    signature: (b) => new TextDecoder().decode(b.slice(0, 5)) === "%PDF-",
  },
  "image/png": {
    extension: "png",
    signature: (b) =>
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v),
  },
  "image/jpeg": {
    extension: "jpg",
    signature: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255,
  },
};
filesRoutes.get("/enquiries/:id/files", async (c) => {
  const id = c.req.param("id");
  await new Repository(c.env.DB, c.get("identity")).enquiry(id);
  const result = await c.env.DB.prepare(
    "SELECT id,enquiry_id AS enquiryId,payment_id AS paymentId,name,mime,size,created_at AS createdAt FROM files WHERE enquiry_id=? ORDER BY created_at DESC",
  )
    .bind(id)
    .all();
  return c.json(result.results);
});
filesRoutes.post("/enquiries/:id/files", async (c) => {
  const id = c.req.param("id");
  const actor = c.get("identity");
  const repo = new Repository(c.env.DB, actor);
  const enquiry = await repo.enquiry(id);
  const key = requestKey(c.req.header("Idempotency-Key"));
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    throw new ApiError(
      400,
      "FILE_REQUIRED",
      "Select a PDF, PNG or JPEG receipt.",
    );
  if (file.size === 0 || file.size > 5 * 1024 * 1024)
    throw new ApiError(
      413,
      "FILE_TOO_LARGE",
      "Receipts must be between 1 byte and 5 MB.",
    );
  const format = allowed[file.type];
  const bytes = await file.arrayBuffer();
  if (!format || !format.signature(new Uint8Array(bytes)))
    throw new ApiError(
      415,
      "INVALID_FILE",
      "Only valid PDF, PNG and JPEG files are accepted.",
    );
  const rawPayment = form.get("paymentId");
  const paymentId =
    typeof rawPayment === "string" && rawPayment ? rawPayment : null;
  if (paymentId && !enquiry.payments.some((p) => p.id === paymentId))
    throw new ApiError(
      400,
      "INVALID_PAYMENT",
      "Payment does not belong to this enquiry.",
    );
  const name =
    file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(-120) ||
    `receipt.${format.extension}`;
  if (
    !new RegExp(
      `\\.(${format.extension === "jpg" ? "jpg|jpeg" : format.extension})$`,
      "i",
    ).test(name)
  )
    throw new ApiError(
      415,
      "INVALID_EXTENSION",
      "File extension must match its content.",
    );
  const fingerprint = await digest(
    `${id}:${paymentId}:${name}:${await digest(bytes)}`,
  );
  const resource = `file:${id}`;
  const replay = await repo.receipt(key, resource, fingerprint);
  if (replay) return c.json(replay);
  const fileId = crypto.randomUUID();
  const objectKey = `receipts/${id}/${fileId}.${format.extension}`;
  const createdAt = new Date().toISOString();
  await c.env.FILES_BUCKET.put(objectKey, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: { enquiryId: id },
  });
  const response = { id: fileId };
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO files(id,enquiry_id,payment_id,object_key,name,mime,size,created_at,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)",
      ).bind(
        fileId,
        id,
        paymentId,
        objectKey,
        name,
        file.type,
        file.size,
        createdAt,
        actor.id,
      ),
      c.env.DB.prepare(
        "INSERT INTO idempotency_keys(key,actor_id,resource,fingerprint,response,created_at) VALUES(?,?,?,?,?,?)",
      ).bind(
        key,
        actor.id,
        resource,
        fingerprint,
        JSON.stringify(response),
        createdAt,
      ),
      c.env.DB.prepare(
        "INSERT INTO audit_events(id,actor_id,object_id,action,request_id,created_at,data) VALUES(?,?,?,?,?,?,?)",
      ).bind(
        crypto.randomUUID(),
        actor.id,
        id,
        "receipt.upload",
        c.get("requestId"),
        createdAt,
        JSON.stringify({ fileId, paymentId }),
      ),
    ]);
  } catch (error) {
    await c.env.FILES_BUCKET.delete(objectKey);
    const replay = await repo.receipt(key, resource, fingerprint);
    if (replay) return c.json(replay);
    throw error;
  }
  return c.json(response, 201);
});
filesRoutes.get("/files/:id", async (c) => {
  const file = await c.env.DB.prepare("SELECT * FROM files WHERE id=?")
    .bind(c.req.param("id"))
    .first<{
      enquiry_id: string;
      object_key: string;
      name: string;
      mime: string;
    }>();
  if (!file) throw new ApiError(404, "NOT_FOUND", "Receipt not found.");
  await new Repository(c.env.DB, c.get("identity")).enquiry(file.enquiry_id);
  const object = await c.env.FILES_BUCKET.get(file.object_key);
  if (!object)
    throw new ApiError(404, "NOT_FOUND", "Receipt content is unavailable.");
  c.header("Content-Type", file.mime);
  c.header("Content-Disposition", `attachment; filename="${file.name}"`);
  c.header("Content-Security-Policy", "default-src 'none'; sandbox");
  return c.body(object.body);
});
