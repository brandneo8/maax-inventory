import ExcelJS from "exceljs";

/** One priced product line read from a supplier's order form. */
export type OrderFormLine = {
  /** Where it sits in the file, for display ("Sheet1 row 9"). */
  source: string;
  sku: string;
  description: string;
  size: string;
  /** The supplier's price to the salon (cost). */
  cost: number | null;
  /** Suggested retail price, when the form gives one. */
  rrp: number | null;
  /** When the form is in another currency: the price and RRP as written, before converting to SGD. */
  originalCost?: number | null;
  originalRrp?: number | null;
};

/** Currency markers looked for in a form's title and heading rows, and the ISO code each means. */
const CURRENCY_MARKERS: [RegExp, string][] = [
  [/\bSGD\b|\bS\$/, "SGD"],
  [/\bRM\b|\bMYR\b|[Rr]inggit/, "MYR"],
  [/\bUSD\b|\bUS\$/, "USD"],
  [/\bEUR\b|€/, "EUR"],
  [/\bGBP\b|£/, "GBP"],
  [/\bAUD\b|\bA\$/, "AUD"],
  [/\bHKD\b|\bHK\$/, "HKD"],
  [/\bRMB\b|\bCNY\b/, "CNY"],
  [/\bJPY\b|¥/, "JPY"],
  [/\bTHB\b|฿/, "THB"],
  [/\bIDR\b/, "IDR"],
  [/\bKRW\b|₩/, "KRW"],
];

/** The currency a form's title and heading text name, if any (the first marker found wins). */
function currencyIn(texts: string[]) {
  const text = texts.join(" ");
  let found: { code: string; at: number } | null = null;
  for (const [pattern, code] of CURRENCY_MARKERS) {
    const at = text.search(pattern);
    if (at >= 0 && (!found || at < found.at)) found = { code, at };
  }
  return found?.code ?? null;
}

type Grid = { sheet: string; rows: string[][] };

const SKU_HEADER = /^(sku|code|sku code|code number|item code|product code)$/i;
const DESCRIPTION_HEADER = /(description|item name|product name|^product$|^item$|^name$)/i;
const SIZE_HEADER = /^(size|volume|volume ?\/ ?size|pack)$/i;
const RRP_HEADER = /(retail|rrp)/i;
const COST_HEADER = /(salon price|pro price|invoice price|salon \$|price)/i;

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    if ("result" in value && value.result != null) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return String(value.text);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return "";
  }
  return String(value);
}

async function readXlsx(buffer: ArrayBuffer): Promise<Grid[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook.worksheets.map((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const values: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        values[column - 1] = cellText(cell.value).replace(/\s+/g, " ").trim();
      });
      rows[rowNumber - 1] = Array.from(values, (value) => value ?? "");
    });
    return { sheet: sheet.name, rows: Array.from(rows, (row) => row ?? []) };
  });
}

/** A small CSV parser: quoted fields, doubled quotes, and line breaks inside quotes. */
function readCsv(text: string): Grid[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quoted) {
      if (ch === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return [{ sheet: "CSV", rows: rows.map((cells) => cells.map((cell) => cell.replace(/\s+/g, " ").trim())) }];
}

function money(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Reads an order form (CSV or Excel). Each sheet is scanned for a heading
 * row with a SKU/code column and a description column; the rows below it
 * that have a description and a price are product lines (category and
 * total rows have no price, so they're skipped). A later heading row on
 * the same sheet starts a new block with its own columns.
 */
export async function readOrderForm(buffer: ArrayBuffer, fileName: string): Promise<OrderFormLine[]> {
  return (await readOrderFormDetails(buffer, fileName)).lines;
}

/**
 * Reads an order form's lines (see readOrderForm), and the currency its
 * title or heading rows name ("Salon Price (RM)" = MYR), if any.
 */
export async function readOrderFormDetails(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<{ lines: OrderFormLine[]; currency: string | null }> {
  const grids = fileName.toLowerCase().endsWith(".csv")
    ? readCsv(new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, ""))
    : await readXlsx(buffer);

  const lines: OrderFormLine[] = [];
  /** Text above and on each sheet's first heading row: titles, notes and column headings. */
  const headingTexts: string[] = [];
  for (const grid of grids) {
    let columns: { sku: number; description: number; size: number; cost: number; rrp: number } | null = null;
    grid.rows.forEach((cells, rowIndex) => {
      if (!columns) headingTexts.push(...cells.filter(Boolean));
      const sku = cells.findIndex((cell) => SKU_HEADER.test(cell));
      const description = cells.findIndex((cell) => DESCRIPTION_HEADER.test(cell));
      if (sku >= 0 && description >= 0) {
        const rrp = cells.findIndex((cell) => RRP_HEADER.test(cell));
        const cost = cells.findIndex((cell, index) => index !== rrp && COST_HEADER.test(cell) && !RRP_HEADER.test(cell));
        columns = { sku, description, size: cells.findIndex((cell) => SIZE_HEADER.test(cell)), cost, rrp };
        return;
      }
      if (!columns) return;
      const at = (index: number) => (index >= 0 ? (cells[index] ?? "") : "");
      const text = at(columns.description);
      const cost = money(at(columns.cost));
      if (!text || cost == null) return;
      lines.push({
        source: `${grid.sheet} row ${rowIndex + 1}`,
        sku: at(columns.sku),
        description: text,
        size: at(columns.size),
        cost,
        rrp: money(at(columns.rrp)),
      });
    });
  }
  return { lines, currency: currencyIn(headingTexts) };
}
