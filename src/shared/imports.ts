import { z } from "zod";
import type { PreviewRow } from "./import-preview";
export const reviewSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    tripId: z.string().min(1).max(100),
    ownerId: z.string().min(1).max(100),
    acknowledged: z.literal(true),
    verifiedPhone: z.boolean(),
    reason: z.string().trim().min(8).max(2000),
  })
  .strict();
export type ImportReview = z.infer<typeof reviewSchema>;
export type StoredImportRow = {
  id: string;
  row_number: number;
  revision: number;
  status: "review" | "ready" | "committed" | "skip";
  data: PreviewRow;
  review: ImportReview | null;
  enquiry_id: string | null;
  error: string | null;
};
export type ImportBatch = {
  id: string;
  checksum: string;
  mapping_version: string;
  created_at: string;
  rows: StoredImportRow[];
  counts: Record<StoredImportRow["status"], number>;
};
