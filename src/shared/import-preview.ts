import { z } from "zod";

// Controlled preprocessing contract. IDs and dates must arrive as strings;
// raw cell positions/styles remain evidence, never business instructions.
export const importDocumentSchema = z
  .object({
    format: z.literal("soulsteps-import-v1"),
    sheet: z.string().min(1).max(100),
    mappingVersion: z.string().min(1).max(100).optional(),
    providerData: z.record(z.string(), z.unknown()).optional(),
    evidence: z
      .object({
        sourceChecksum: z.string().regex(/^[a-f0-9]{64}$/),
        mappingChecksum: z.string().regex(/^[a-f0-9]{64}$/),
        stylesXml: z.string().max(100000),
        sourceHeaders: z.array(z.string().max(10000)).max(100),
      })
      .strict()
      .optional(),
    headers: z.array(z.string().max(500)).max(100),
    rows: z
      .array(
        z
          .object({
            formVersion: z.enum(["v1", "v2", "v3", "v4", "unknown"]),
            cells: z.array(z.string().max(10000)).max(100),
            styles: z.array(z.string().max(500)).max(100),
            sourceCells: z
              .array(
                z
                  .object({
                    reference: z.string().max(20),
                    type: z.string().max(30),
                    value: z.string().max(10000),
                    style: z.string().max(500),
                    formula: z.string().max(10000).optional(),
                  })
                  .strict(),
              )
              .max(100)
              .optional(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();
export type ImportDocument = z.infer<typeof importDocumentSchema>;
export type PreviewRow = {
  row: number;
  version: string;
  sourceId: string;
  name: string;
  phone: string | null;
  group: string;
  visa: string;
  notes: string[];
  status: "candidate" | "review" | "skip";
  reasons: string[];
  raw: ImportDocument["rows"][number];
};
export type ImportPreview = {
  sheet: string;
  headers: string[];
  rows: PreviewRow[];
  counts: Record<PreviewRow["status"], number>;
};

// These mappings describe our synthetic fixtures only. Real form IDs must be
// reviewed against the original workbook before this contract can be used.
const fields = [
  "id",
  "created_time",
  "name",
  "phone",
  "email",
  "group",
  "visa",
  "lead_status",
];
export function previewImport(document: ImportDocument): ImportPreview {
  if (document.headers.join("|") !== fields.join("|"))
    throw new Error(
      "Unsupported headers. Use the reviewed synthetic mapping; original exports require preprocessing review.",
    );
  const seen = new Set<string>();
  const rows: PreviewRow[] = document.rows.map((raw, index) => {
    const reasons: string[] = [],
      c = raw.cells;
    const shifted = raw.formVersion === "v2" ? 1 : 0;
    const sourceId = c[0] || "",
      name = c[2] || "";
    const phone = /^\+[1-9]\d{7,14}$/.test(c[3] || "") ? c[3] : null;
    const group = c[5 + shifted] || "",
      visa = c[6 + shifted] || "";
    const notes = c.slice(8 + shifted).filter(Boolean);
    let status: PreviewRow["status"] = "candidate";
    if (c.every((v) => !v.trim()))
      return {
        row: index + 2,
        version: raw.formVersion,
        sourceId,
        name,
        phone,
        group,
        visa,
        notes,
        raw,
        status: "skip",
        reasons: ["Blank row"],
      };
    if (raw.formVersion === "unknown")
      reasons.push("Unknown form version; do not infer column shifts");
    if (c.length < 8 + shifted) reasons.push("Incomplete row shape");
    if (!sourceId || !/^\d+$/.test(sourceId))
      reasons.push("Missing or invalid external ID");
    if (seen.has(sourceId))
      reasons.push("Duplicate external ID in this document");
    seen.add(sourceId);
    if (!name.trim()) reasons.push("Missing name");
    if (!phone)
      reasons.push(
        "Incomplete contact; no automatic customer match or WhatsApp",
      );
    const timestamp = c[1] || "";
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        timestamp,
      ) ||
      !Number.isFinite(Date.parse(timestamp))
    )
      reasons.push("Ambiguous source date; preserve raw value");
    if (
      !["couple", "solo", "family", "friends"].includes(group) ||
      !["all", "none"].includes(visa)
    )
      reasons.push("Needs qualification");
    if (notes.length)
      reasons.push(
        "Review original notes; no historical follow-ups will be scheduled",
      );
    if (notes.some((n) => /converted/i.test(n)))
      reasons.push("Confirmation review only; no verified deposit or booking");
    if (reasons.length) status = "review";
    if (/^(dummy|test)(\b|_)/i.test(name.trim())) {
      status = "skip";
      reasons.push("Dummy/test excluded");
    }
    return {
      row: index + 2,
      version: raw.formVersion,
      sourceId,
      name,
      phone,
      group,
      visa,
      notes,
      status,
      reasons,
      raw,
    };
  });
  // Both occurrences require review, including the first occurrence.
  const frequency = new Map<string, number>();
  for (const row of rows)
    if (row.sourceId)
      frequency.set(row.sourceId, (frequency.get(row.sourceId) || 0) + 1);
  for (const row of rows)
    if (row.status !== "skip" && (frequency.get(row.sourceId) || 0) > 1) {
      row.status = "review";
      if (!row.reasons.includes("Duplicate external ID in this document"))
        row.reasons.push("Duplicate external ID in this document");
    }
  return {
    sheet: document.sheet,
    headers: document.headers,
    rows,
    counts: {
      candidate: rows.filter((r) => r.status === "candidate").length,
      review: rows.filter((r) => r.status === "review").length,
      skip: rows.filter((r) => r.status === "skip").length,
    },
  };
}
