"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import type { ImportSummary, ImportResult } from "@/app/actions/roster";
import { Button, Card, Select, Field, Badge } from "./ui";

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
}

const normHeader = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function guess(field: ImportField, headers: string[]): string {
  const wanted = field.aliases.map(normHeader);
  return headers.find((h) => wanted.includes(normHeader(h))) ?? "";
}

export function ImportWizard({
  fields,
  helpText,
  onImport,
  importLabel = "Import",
}: {
  fields: ImportField[];
  helpText?: string;
  onImport: (
    records: Record<string, string>[],
    fileName?: string,
  ) => Promise<ImportResult>;
  importLabel?: string;
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [notes, setNotes] = useState<{ message?: string; warnings?: string[] }>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const requiredKey = fields.find((f) => f.required)?.key;
  const ready = requiredKey ? Boolean(mapping[requiredKey]) : true;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSummary(null);
    setFileName(file.name);
    setParsing(true);
    try {
      const { headers, rows } = await parseSpreadsheet(file);
      setHeaders(headers);
      setRows(rows);
      const next: Record<string, string> = {};
      for (const f of fields) {
        const g = guess(f, headers);
        if (g) next[f.key] = g;
      }
      setMapping(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file.");
      setHeaders([]);
      setRows([]);
    } finally {
      setParsing(false);
    }
  }

  function run() {
    setError(null);
    setSummary(null);
    setNotes({});
    const records = rows.map((row) => {
      const rec: Record<string, string> = {};
      for (const f of fields) {
        const col = mapping[f.key];
        rec[f.key] = col ? (row[col] ?? "") : "";
      }
      return rec;
    });
    startTransition(async () => {
      const res = await onImport(records, fileName);
      if (!res.ok) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setSummary(res.summary ?? null);
      setNotes({ message: res.message, warnings: res.warnings });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <Field label="File (.xlsx or .csv)">
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFile}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-accent-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-accent-700"
          />
        </Field>
        {helpText && <p className="mt-2 text-xs text-ink-500">{helpText}</p>}
        {parsing && <p className="mt-2 text-sm text-ink-500">Reading {fileName}…</p>}
        {!parsing && rows.length > 0 && (
          <p className="mt-2 text-sm text-ink-600">
            {fileName}: {headers.length} columns, {rows.length.toLocaleString()}{" "}
            rows.
          </p>
        )}
      </Card>

      {headers.length > 0 && (
        <Card className="space-y-4 p-5">
          <h3 className="text-sm font-semibold text-ink-700">Map columns</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <Field key={f.key} label={`${f.label}${f.required ? " *" : ""}`}>
                <Select
                  value={mapping[f.key] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [f.key]: e.target.value }))
                  }
                >
                  <option value="">— skip —</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
          <Button onClick={run} disabled={pending || !ready}>
            {pending
              ? `${importLabel}ing…`
              : `${importLabel} ${rows.length.toLocaleString()} rows`}
          </Button>
          {!ready && requiredKey && (
            <p className="text-xs text-amber-700">
              Map the required column to enable import.
            </p>
          )}
        </Card>
      )}

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {summary && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-semibold text-ink-700">
            {importLabel === "Import" ? "Import complete" : "Upload complete"}
          </h3>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="green">{summary.created.toLocaleString()} created</Badge>
            {(summary.updated ?? 0) > 0 && (
              <Badge tone="accent">{summary.updated!.toLocaleString()} updated</Badge>
            )}
            {summary.skippedExisting > 0 && (
              <Badge>
                {summary.skippedExisting.toLocaleString()} already existed
              </Badge>
            )}
            {summary.skippedBlank > 0 && (
              <Badge tone="amber">{summary.skippedBlank} blank rows skipped</Badge>
            )}
            <Badge tone="accent">{summary.total.toLocaleString()} rows read</Badge>
          </div>
          {notes.message && (
            <p className="mt-3 text-sm font-medium text-ink-700">{notes.message}</p>
          )}
          {(notes.warnings ?? []).length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
              {notes.warnings!.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
