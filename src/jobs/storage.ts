import type { Bindings } from "../server/types";
export type StorageReport = {
  checkedAt: string;
  truncated: boolean;
  unlinked: { key: string; size: number; uploaded: string }[];
  missing: { id: string; enquiryId: string; key: string }[];
  automaticDeletion: false;
};
export async function reviewStorage(env: Bindings): Promise<StorageReport> {
  const rows = await env.DB.prepare(
    "SELECT id,enquiry_id,object_key FROM files",
  ).all<{ id: string; enquiry_id: string; object_key: string }>();
  const known = new Set(rows.results.map((f) => f.object_key));
  const seen = new Set<string>(),
    unlinked: StorageReport["unlinked"] = [];
  let cursor: string | undefined,
    truncated = false;
  for (let page = 0; page < 5; page++) {
    const listed = await env.FILES_BUCKET.list({
      prefix: "receipts/",
      limit: 1000,
      cursor,
    });
    for (const file of listed.objects) {
      seen.add(file.key);
      if (
        !known.has(file.key) &&
        file.uploaded.getTime() < Date.now() - 15 * 60000
      )
        unlinked.push({
          key: file.key,
          size: file.size,
          uploaded: file.uploaded.toISOString(),
        });
    }
    if (!listed.truncated) {
      truncated = false;
      break;
    }
    truncated = true;
    cursor = listed.cursor;
  }
  const report: StorageReport = {
    checkedAt: new Date().toISOString(),
    truncated,
    unlinked,
    missing: truncated
      ? []
      : rows.results
          .filter(
            (f) =>
              f.object_key.startsWith("receipts/") && !seen.has(f.object_key),
          )
          .map((f) => ({
            id: f.id,
            enquiryId: f.enquiry_id,
            key: f.object_key,
          })),
    automaticDeletion: false,
  };
  await env.DB.prepare(
    "INSERT INTO storage_review(id,created_at,data) VALUES('receipts',?,?) ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at,data=excluded.data",
  )
    .bind(report.checkedAt, JSON.stringify(report))
    .run();
  return report;
}
