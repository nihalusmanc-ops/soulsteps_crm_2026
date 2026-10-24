import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import {
  importDocumentSchema,
  type ImportDocument,
} from "../src/shared/import-preview";
const column = z.number().int().min(0).max(99);
const mappingSchema = z
  .object({
    reviewed: z.literal(true),
    version: z.string().min(1).max(100),
    sheetName: z.string().min(1).max(100),
    sheetPath: z.string().regex(/^xl\/worksheets\/sheet\d+\.xml$/),
    headerRow: z.number().int().min(1).max(500),
    formIdColumn: column,
    forms: z.record(
      z.string(),
      z
        .object({
          version: z.enum(["v2", "v3"]),
          columns: z
            .object({
              id: column,
              created_time: column,
              name: column,
              phone: column,
              email: column,
              group: column,
              visa: column,
              lead_status: column,
              journey: column.optional(),
            })
            .strict(),
          notesFrom: column,
        })
        .strict(),
    ),
  })
  .strict();
type Xml = Record<string, any>; // XML is bounded, untrusted input; output is Zod-validated.
const array = (value: any): any[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value: any): string =>
  typeof value === "object" && value !== null
    ? String(value["#text"] || "")
    : String(value ?? "");
const hash = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
export function preprocessImport(
  bytes: Uint8Array,
  mappingText: string,
): ImportDocument {
  if (bytes.length > 4 * 1024 * 1024)
    throw new Error("Workbook limit is 4 MB.");
  const mapping = mappingSchema.parse(JSON.parse(mappingText));
  let size = 0,
    entries = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      size += file.originalSize;
      entries++;
      if (size > 16 * 1024 * 1024 || entries > 1000)
        throw new Error("Workbook expansion limit exceeded.");
      if (/vbaProject|macros/i.test(file.name))
        throw new Error("Macro workbooks are not accepted.");
      return [
        mapping.sheetPath,
        "xl/sharedStrings.xml",
        "xl/styles.xml",
        "[Content_Types].xml",
      ].includes(file.name);
    },
  });
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  });
  function xml(path: string): Xml {
    const value = strFromU8(files[path] || new Uint8Array());
    if (/<!DOCTYPE|<!ENTITY|macroEnabled/i.test(value))
      throw new Error("DTD, entities and macro workbooks are not accepted.");
    return value ? parser.parse(value, true) : {};
  }
  xml("[Content_Types].xml");
  const shared = array(xml("xl/sharedStrings.xml").sst?.si).map((si) =>
    si.r
      ? array(si.r)
          .map((r) => text(r.t))
          .join("")
      : text(si.t),
  );
  const sheet = xml(mapping.sheetPath);
  if (!sheet.worksheet?.sheetData)
    throw new Error("Selected worksheet is missing.");
  const rows = array(sheet.worksheet.sheetData.row);
  if (rows.length > 501) throw new Error("Workbook limit is 500 data rows.");
  const cellsFor = (row: Xml) =>
    array(row.c).map((cell) => {
      const type = cell["@_t"] || "n",
        value =
          type === "s"
            ? shared[Number(text(cell.v))]
            : type === "inlineStr"
              ? cell.is?.r
                ? array(cell.is.r)
                    .map((r) => text(r.t))
                    .join("")
                : text(cell.is?.t)
              : text(cell.v);
      return {
        reference: String(cell["@_r"] || ""),
        type: String(type),
        value: value || "",
        style: String(cell["@_s"] || "0"),
        ...(cell.f !== undefined ? { formula: text(cell.f) } : {}),
      };
    });
  const positions = (cells: ReturnType<typeof cellsFor>) => {
    const output: string[] = [];
    for (const cell of cells) {
      const letters = cell.reference.match(/^[A-Z]+/)?.[0];
      if (!letters) throw new Error("Missing source cell reference.");
      let index = 0;
      for (const letter of letters)
        index = index * 26 + letter.charCodeAt(0) - 64;
      if (index > 100) throw new Error("Workbook limit is 100 columns.");
      output[index - 1] = cell.value;
    }
    return Array.from(output, (v) => v || "");
  };
  const headers = positions(
    cellsFor(rows.find((r) => Number(r["@_r"]) === mapping.headerRow) || {}),
  );
  const result: ImportDocument = {
    format: "soulsteps-import-v1",
    sheet: mapping.sheetName,
    mappingVersion: mapping.version,
    headers: [
      "id",
      "created_time",
      "name",
      "phone",
      "email",
      "group",
      "visa",
      "lead_status",
    ],
    evidence: {
      sourceChecksum: hash(bytes),
      mappingChecksum: hash(mappingText),
      stylesXml: strFromU8(files["xl/styles.xml"] || new Uint8Array()),
      sourceHeaders: headers,
    },
    rows: [],
  };
  for (const raw of rows.filter((r) => Number(r["@_r"]) > mapping.headerRow)) {
    const sourceCells = cellsFor(raw),
      source = positions(sourceCells),
      form = mapping.forms[source[mapping.formIdColumn]];
    if (!form) {
      result.rows.push({
        formVersion: "unknown",
        cells: source,
        styles: sourceCells.map((c) => `${c.reference}:style:${c.style}`),
        sourceCells,
      });
      continue;
    }
    const columns = form.columns,
      pick = (key: keyof typeof columns) => source[columns[key] ?? -1] || "";
    const cells = [
      pick("id"),
      pick("created_time"),
      pick("name"),
      pick("phone"),
      pick("email"),
      ...(form.version === "v2" ? [pick("journey")] : []),
      pick("group"),
      pick("visa"),
      pick("lead_status"),
      ...source.slice(form.notesFrom),
    ];
    const idRef = sourceCells.find(
      (c) =>
        c.reference.match(/^[A-Z]+/)?.[0] ===
        (() => {
          let n = columns.id + 1,
            s = "";
          while (n) {
            n--;
            s = String.fromCharCode(65 + (n % 26)) + s;
            n = Math.floor(n / 26);
          }
          return s;
        })(),
    );
    const unsafe =
      sourceCells.some((c) => c.formula !== undefined) ||
      !idRef ||
      !["s", "inlineStr", "str"].includes(idRef.type);
    result.rows.push({
      formVersion: unsafe ? "unknown" : form.version,
      cells,
      styles: sourceCells.map((c) => `${c.reference}:style:${c.style}`),
      sourceCells,
    });
  }
  return importDocumentSchema.parse(result);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [input, mapping, output] = process.argv.slice(2);
  if (!input?.toLowerCase().endsWith(".xlsx") || !mapping || !output)
    throw new Error(
      "Usage: npm run import:preprocess -- source.xlsx reviewed-mapping.json output.json",
    );
  const result = preprocessImport(
    readFileSync(input),
    readFileSync(mapping, "utf8"),
  );
  writeFileSync(output, JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(
    `Prepared ${result.rows.length} rows. Review all rows in the manager import preview; no CRM writes occurred.`,
  );
}
