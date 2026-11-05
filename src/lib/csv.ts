// CSV writing for exports. Cells that a spreadsheet would treat as a formula
// (= + - @, tab, carriage return) are prefixed with an apostrophe so an
// exported value can never execute in Excel or Sheets (CSV injection).

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  // Leading BOM so Excel opens UTF-8 correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
