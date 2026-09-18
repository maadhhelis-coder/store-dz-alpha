// CSV حتمي للتصدير (P8): BOM لـExcel، فواصل أسطر CRLF، اقتباس مضاعف، تواريخ ISO UTC،
// أرقام كما هي (DZD أعداد صحيحة — لا تنسيق ولا فواصل آلاف). null/undefined = خلية فارغة.
// حماية من حقن الصيغ: خلية تبدأ بـ = + - @ تُسبق بفاصلة عليا (OWASP CSV injection).

export type CsvCell = string | number | boolean | Date | null | undefined;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "number" || typeof value === "boolean") return String(value);
  else s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: readonly string[], rows: readonly CsvCell[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
