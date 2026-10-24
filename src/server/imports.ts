import { Hono } from "hono";
import type { AppEnv } from "./types";
import { requireManager } from "./auth";
import { ApiError } from "./errors";
import { importDocumentSchema, previewImport } from "../shared/import-preview";
import { digest } from "./request";
import { ImportService } from "./import-service";
import { reviewSchema } from "../shared/imports";
import { z } from "zod";

export const importRoutes = new Hono<AppEnv>();
importRoutes.use("/management/imports/*", async (c, next) => {
  requireManager(c);
  await next();
});
importRoutes.get("/management/imports/batches", async (c) =>
  c.json(
    (
      await c.env.DB.prepare(
        "SELECT id,checksum,mapping_version,created_at FROM import_batches ORDER BY created_at DESC LIMIT 100",
      ).all()
    ).results,
  ),
);
importRoutes.get("/management/imports/options", async (c) => {
  const trips = (
    await c.env.DB.prepare("SELECT id,name FROM trips ORDER BY name").all()
  ).results;
  const owners = (
    await c.env.DB.prepare(
      "SELECT id,display_name AS name FROM users WHERE active=1 AND role='staff' ORDER BY display_name",
    ).all()
  ).results;
  return c.json({ trips, owners });
});
importRoutes.post("/management/imports/batches", async (c) =>
  c.json(
    await new ImportService(c.env, c.get("identity")).upload(
      await c.req.text(),
    ),
  ),
);
importRoutes.get("/management/imports/batches/:id", async (c) =>
  c.json(
    await new ImportService(c.env, c.get("identity")).batch(c.req.param("id")),
  ),
);
importRoutes.get("/management/imports/batches/:id/source", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT raw_text,checksum FROM import_batches WHERE id=?",
  )
    .bind(c.req.param("id"))
    .first<{ raw_text: string; checksum: string }>();
  if (!row)
    throw new ApiError(404, "IMPORT_NOT_FOUND", "Import batch not found.");
  if ((await digest(row.raw_text)) !== row.checksum)
    throw new ApiError(
      409,
      "IMPORT_CHECKSUM",
      "Source integrity check failed.",
    );
  c.header(
    "Content-Disposition",
    'attachment; filename="historical-source.json"',
  );
  c.header("Content-Type", "application/json");
  return c.body(row.raw_text);
});
importRoutes.put("/management/imports/batches/:id/rows/:row", async (c) =>
  c.json(
    await new ImportService(c.env, c.get("identity")).review(
      c.req.param("id"),
      c.req.param("row"),
      reviewSchema.parse(await c.req.json()),
    ),
  ),
);
importRoutes.post("/management/imports/batches/:id/commit", async (c) => {
  const body = z
    .object({
      rows: z.array(z.string().min(1)).min(1).max(25),
      confirmed: z.literal(true),
    })
    .strict()
    .parse(await c.req.json());
  return c.json(
    await new ImportService(c.env, c.get("identity")).commit(
      c.req.param("id"),
      [...new Set(body.rows)],
    ),
  );
});
importRoutes.post("/management/imports/preview", async (c) => {
  requireManager(c);
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > 1024 * 1024)
    throw new ApiError(
      413,
      "IMPORT_SIZE",
      "Preview is limited to 1 MB and 500 rows.",
    );
  const document = importDocumentSchema.parse(JSON.parse(text));
  try {
    return c.json({
      ...previewImport(document),
      checksum: await digest(text),
      mode: "review-only" as const,
    });
  } catch (error) {
    throw new ApiError(
      400,
      "IMPORT_MAPPING",
      error instanceof Error ? error.message : "Unsupported mapping",
    );
  }
});
