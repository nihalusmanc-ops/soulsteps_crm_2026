import { Hono } from "hono";
import type { AppEnv } from "./types";
import { requireManager } from "./auth";
import { ApiError } from "./errors";
import { importDocumentSchema, previewImport } from "../shared/import-preview";
import { digest } from "./request";

export const importRoutes = new Hono<AppEnv>();
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
