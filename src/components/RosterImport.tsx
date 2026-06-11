"use client";

import { useState, useTransition } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import {
  importRosterCsv,
  type RosterMapping,
  type RosterField,
  type ImportSummary,
} from "@/app/actions/roster";
import { Button, Card, Select, Field, Badge } from "./ui";

const FIELDS: { key: RosterField; label: string; required?: boolean }[] = [
  { key: "student_name", label: "Student name", required: true },
  { key: "student_level", label: "Student level" },
  { key: "student_ref", label: "Student ref (MV id)" },
  { key: "parent_name", label: "Parent name" },
  { key: "parent_relationship", label: "Parent relationship" },
  { key: "parent_phone", label: "Parent phone" },
  { key: "parent_email", label: "Parent email" },
];

// Best-effort auto-match a CSV header to one of our fields.
function guess(field: RosterField, headers: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  const aliases: Record<RosterField, string[]> = {
    student_name: ["studentname", "student", "childname", "name"],
    student_level: ["studentlevel", "level", "grade", "class", "course"],
    student_ref: ["studentref", "ref", "mvid", "studentid", "externalref"],
    parent_name: ["parentname", "parent", "guardian", "guardianname"],
    parent_relationship: ["parentrelationship", "relationship", "relation"],
    parent_phone: ["parentphone", "phone", "mobile", "whatsapp", "contact"],
    parent_email: ["parentemail", "email", "mail"],
  };
  const wanted = aliases[field];
  const found = headers.find((h) => wanted.includes(norm(h)));
  return found ?? "";
}

export function RosterImport() {
  const router = useRouter();
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<RosterMapping>({ student_name: "" });
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSummary(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setCsvText(text);
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: "greedy",
        preview: 1000,
      });
      const fields = parsed.meta.fields ?? [];
      setHeaders(fields);
      setRowCount(parsed.data.length);
      const next: RosterMapping = { student_name: guess("student_name", fields) };
      for (const f of FIELDS) {
        if (f.key === "student_name") continue;
        const g = guess(f.key, fields);
        if (g) next[f.key] = g;
      }
      setMapping(next);
    };
    reader.readAsText(file);
  }

  function setField(field: RosterField, value: string) {
    setMapping((m) => ({ ...m, [field]: value }));
  }

  function runImport() {
    setError(null);
    setSummary(null);
    startTransition(async () => {
      const res = await importRosterCsv(csvText, mapping);
      if (!res.ok) {
        setError(res.error ?? "Import failed.");
        return;
      }
      setSummary(res.summary ?? null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <Field label="CSV file">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="block w-full text-sm text-ink-600 file:mr-3 file:rounded-lg file:border-0 file:bg-accent-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-accent-700"
          />
        </Field>
        <p className="mt-2 text-xs text-ink-500">
          One row per parent–student pair. Siblings repeat the parent; a second
          parent repeats the student.
        </p>
        {headers.length > 0 && (
          <p className="mt-2 text-sm text-ink-600">
            Detected {headers.length} columns and {rowCount} rows.
          </p>
        )}
      </Card>

      {headers.length > 0 && (
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink-700">Map columns</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Field
                key={f.key}
                label={`${f.label}${f.required ? " *" : ""}`}
              >
                <Select
                  value={mapping[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
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
          <Button
            onClick={runImport}
            disabled={pending || !mapping.student_name}
          >
            {pending ? "Importing…" : "Import roster"}
          </Button>
          {!mapping.student_name && (
            <p className="text-xs text-amber-700">
              Map a column to student name to enable import.
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
          <h2 className="mb-3 text-sm font-semibold text-ink-700">
            Import complete
          </h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="green">
              {summary.studentsCreated} students created
            </Badge>
            <Badge>{summary.studentsMatched} students matched</Badge>
            <Badge tone="green">
              {summary.parentsCreated} parents created
            </Badge>
            <Badge>{summary.parentsMatched} parents matched</Badge>
            <Badge tone="accent">{summary.linksCreated} links</Badge>
            {summary.rowsSkipped > 0 && (
              <Badge tone="amber">{summary.rowsSkipped} rows skipped</Badge>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
