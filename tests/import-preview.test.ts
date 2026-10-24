import { describe, expect, it } from "vitest";
import fixture from "../public/samples/import-preview.json";
import {
  importDocumentSchema,
  previewImport,
} from "../src/shared/import-preview";
describe("historical import preview", () => {
  it("maps versioned positions and preserves long IDs, notes and styles", () => {
    const source = importDocumentSchema.parse(fixture),
      before = JSON.stringify(source);
    const result = previewImport(source);
    expect(result.rows[0]).toMatchObject({
      sourceId: "90071992547409931",
      group: "couple",
      visa: "all",
      phone: null,
      status: "review",
    });
    expect(result.rows[1]).toMatchObject({
      group: "family",
      visa: "some",
      status: "review",
    });
    expect(result.rows[1].reasons).toContain(
      "Confirmation review only; no verified deposit or booking",
    );
    expect(result.rows[2].status).toBe("skip");
    expect(result.rows[3].reasons).toContain(
      "Unknown form version; do not infer column shifts",
    );
    expect(JSON.stringify(source)).toBe(before);
    expect(result.rows[0].raw.styles).toEqual(["fill:red", "style:12"]);
  });
  it("rejects numeric IDs instead of rounding them", () => {
    const source = structuredClone(fixture);
    (source.rows[0].cells as unknown[])[0] = 90071992547409930;
    expect(importDocumentSchema.safeParse(source).success).toBe(false);
  });
  it("flags both occurrences of duplicate source IDs", () => {
    const source = importDocumentSchema.parse(fixture);
    source.rows[1].cells[0] = source.rows[0].cells[0];
    const result = previewImport(source);
    for (const row of result.rows.slice(0, 2))
      expect(row.reasons).toContain("Duplicate external ID in this document");
  });
  it("rejects unreviewed header shapes", () => {
    const source = importDocumentSchema.parse(fixture);
    source.headers.reverse();
    expect(() => previewImport(source)).toThrow("Unsupported headers");
  });
});
