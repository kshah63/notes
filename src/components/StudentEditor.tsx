"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertStudent } from "@/app/actions/roster";
import { Button, Input, Textarea, Field } from "./ui";
import type { Student } from "@/lib/types";

export function StudentEditor({ student }: { student: Student }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(student.full_name);
  const [level, setLevel] = useState(student.level ?? "");
  const [ref, setRef] = useState(student.external_ref ?? "");
  const [notes, setNotes] = useState(student.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await upsertStudent({
        id: student.id,
        full_name: fullName,
        level,
        external_ref: ref,
        notes,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-50"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="mt-3 w-full space-y-3 rounded-lg border border-ink-200 bg-ink-50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Level">
          <Input value={level} onChange={(e) => setLevel(e.target.value)} />
        </Field>
        <Field label="MV ref">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      </div>
      <Field label="Standing notes">
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything worth remembering about this student…"
        />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
