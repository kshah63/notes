"use client";

import * as XLSX from "xlsx";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

// Parse an .xlsx or .csv file (first sheet) into headers + string rows, in the
// browser. Numbers/dates are stringified; empty cells become "".
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const ws = wb.Sheets[sheetName];

  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
    raw: false,
  });

  if (json.length === 0) return { headers: [], rows: [] };

  // Preserve column order from the header row.
  const headerOrder = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 })[0] ?? [];
  const headers = (headerOrder as unknown[])
    .map((h) => String(h ?? "").trim())
    .filter(Boolean);

  const rows = json.map((r) => {
    const o: Record<string, string> = {};
    for (const key of Object.keys(r)) {
      o[key.trim()] = String(r[key] ?? "").trim();
    }
    return o;
  });

  return { headers: headers.length ? headers : Object.keys(json[0]), rows };
}
