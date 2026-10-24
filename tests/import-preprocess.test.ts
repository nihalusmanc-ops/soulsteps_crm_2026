import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { preprocessImport } from "../scripts/preprocess-import";
const mapping = {
  reviewed: true,
  version: "synthetic-xlsx-v1",
  sheetName: "Sheet1",
  sheetPath: "xl/worksheets/sheet1.xml",
  headerRow: 1,
  formIdColumn: 8,
  forms: {
    "fictional-v3": {
      version: "v3",
      columns: {
        id: 0,
        created_time: 1,
        name: 2,
        phone: 3,
        email: 4,
        group: 5,
        visa: 6,
        lead_status: 7,
      },
      notesFrom: 9,
    },
  },
};
function workbook(idType = "inlineStr", formula = false) {
  const values = [
    "90071992547409931",
    "Wednesday",
    "Synthetic XLSX traveller",
    "SHORTENED",
    "fixture@example.invalid",
    "couple",
    "all",
    "CREATED",
    "fictional-v3",
    "Converted: review only",
  ];
  const row = values
    .map(
      (value, i) =>
        `<c r="${String.fromCharCode(65 + i)}2" s="12" t="${i === 0 ? idType : "inlineStr"}">${i === 0 && idType === "n" ? `<v>${value}</v>` : `<is><t>${value}</t></is>`}${formula && i === 0 ? '<f>HYPERLINK("https://example.invalid")</f>' : ""}</c>`,
    )
    .join("");
  return zipSync({
    "xl/worksheets/sheet1.xml": strToU8(
      `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c></row><row r="2">${row}</row></sheetData></worksheet>`,
    ),
    "xl/styles.xml": strToU8(
      '<styleSheet><fills><fill><patternFill><fgColor rgb="FF0000"/></patternFill></fill></fills></styleSheet>',
    ),
  });
}
describe("controlled XLSX preprocessing", () => {
  it("preserves text IDs, raw cell references, notes and style XML", () => {
    const result = preprocessImport(workbook(), JSON.stringify(mapping));
    expect(result.rows[0].formVersion).toBe("v3");
    expect(result.rows[0].cells[0]).toBe("90071992547409931");
    expect(result.rows[0].cells[8]).toBe("Converted: review only");
    expect(result.rows[0].sourceCells?.[0]).toMatchObject({
      reference: "A2",
      style: "12",
    });
    expect(result.evidence?.stylesXml).toContain("FF0000");
  });
  it("quarantines numeric IDs and formulas without evaluating them", () => {
    expect(
      preprocessImport(workbook("n"), JSON.stringify(mapping)).rows[0]
        .formVersion,
    ).toBe("unknown");
    const result = preprocessImport(
      workbook("inlineStr", true),
      JSON.stringify(mapping),
    );
    expect(result.rows[0].formVersion).toBe("unknown");
    expect(result.rows[0].sourceCells?.[0].formula).toContain("HYPERLINK");
  });
  it("requires explicit reviewed mapping and quarantines unknown form IDs", () => {
    expect(() =>
      preprocessImport(
        workbook(),
        JSON.stringify({ ...mapping, reviewed: false }),
      ),
    ).toThrow();
    expect(
      preprocessImport(workbook(), JSON.stringify({ ...mapping, forms: {} }))
        .rows[0].formVersion,
    ).toBe("unknown");
  });
  it("rejects macros and XML entities", () => {
    const macro = zipSync({ "xl/vbaProject.bin": strToU8("never execute") });
    expect(() => preprocessImport(macro, JSON.stringify(mapping))).toThrow(
      "Macro",
    );
    const xml = zipSync({
      "xl/worksheets/sheet1.xml": strToU8(
        '<!DOCTYPE x [<!ENTITY x "danger">]><worksheet/>',
      ),
    });
    expect(() => preprocessImport(xml, JSON.stringify(mapping))).toThrow("DTD");
  });
});
