"use client";

import { useState, useTransition } from "react";
import { createFollowUp } from "@/app/actions/follow-ups";
import { Button, Input, Textarea, Field } from "./ui";
import { toDatetimeLocalValue } from "@/lib/dates";

export function FollowUpForm({
  interactionId,
  studentId,
  parentId,
  defaultDueInDays,
  defaultNote,
  onDone,
}: {
  interactionId?: string | null;
  studentId?: string | null;
  parentId?: string | null;
  defaultDueInDays?: number | null;
  defaultNote?: string | null;
  onDone?: () => void;
}) {
  const initialDue = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (defaultDueInDays ?? 3));
    d.setHours(9, 0, 0, 0);
    return toDatetimeLocalValue(d.toISOString());
  })();

  const [dueAt, setDueAt] = useState(initialDue);
  const [note, setNote] = useState(defaultNote ?? "");
  const [remindInApp, setRemindInApp] = useState(true);
  const [remindWhatsApp, setRemindWhatsApp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createFollowUp({
        interaction_id: interactionId ?? null,
        student_id: studentId ?? null,
        parent_id: parentId ?? null,
        due_at: new Date(dueAt).toISOString(),
        note,
        remind_in_app: remindInApp,
        remind_whatsapp: remindWhatsApp,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not create follow-up.");
        return;
      }
      onDone?.();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
      <Field label="Due">
        <Input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
        />
      </Field>
      <Field label="Note">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What to follow up on…"
        />
      </Field>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={remindInApp}
            onChange={(e) => setRemindInApp(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-400"
          />
          In-app reminder
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={remindWhatsApp}
            onChange={(e) => setRemindWhatsApp(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-400"
          />
          WhatsApp nudge
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending}>
          {pending ? "Saving…" : "Set follow-up"}
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
