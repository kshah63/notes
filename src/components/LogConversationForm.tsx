"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Input,
  Textarea,
  Select,
  Field,
  Badge,
} from "./ui";
import { CHANNELS, CHANNEL_LABELS } from "@/lib/types";
import type { Channel, Student, Parent, TidyResult } from "@/lib/types";
import { toDatetimeLocalValue } from "@/lib/dates";
import { tidyAndExtractAction, logInteraction } from "@/app/actions/interactions";
import { useDictation } from "@/lib/useDictation";

export function LogConversationForm({
  students,
  parents,
  links,
  defaultChannel,
  initialStudentId,
  initialParentId,
  prefill,
}: {
  students: Student[];
  parents: Parent[];
  links: { student_id: string; parent_id: string }[];
  defaultChannel: Channel;
  initialStudentId?: string;
  initialParentId?: string;
  // Optional prefill (used by the Granola paste import flow).
  prefill?: {
    rawNotes?: string;
    summary?: string;
    actionItems?: string[];
    source?: "manual" | "granola";
    granolaNoteId?: string;
    suggestedFollowUp?: TidyResult["suggested_follow_up"];
  };
}) {
  const router = useRouter();

  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const [parentId, setParentId] = useState(initialParentId ?? "");
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [occurredAt, setOccurredAt] = useState(toDatetimeLocalValue());
  const [rawNotes, setRawNotes] = useState(prefill?.rawNotes ?? "");
  const [summary, setSummary] = useState(prefill?.summary ?? "");
  const [actionItems, setActionItems] = useState<string[]>(
    prefill?.actionItems ?? [],
  );
  const [tidied, setTidied] = useState(Boolean(prefill?.summary));

  // Inline follow-up
  const [withFollowUp, setWithFollowUp] = useState(false);
  const [fuDue, setFuDue] = useState(() => defaultDue(3));
  const [fuNote, setFuNote] = useState("");
  const [fuInApp, setFuInApp] = useState(true);
  const [fuWhatsApp, setFuWhatsApp] = useState(false);

  const [tidying, setTidying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation((text) => {
    setRawNotes((prev) => (prev ? `${prev} ${text}` : text));
  });

  const studentName = useMemo(
    () => students.find((s) => s.id === studentId)?.full_name,
    [students, studentId],
  );
  const parentName = useMemo(
    () => parents.find((p) => p.id === parentId)?.full_name,
    [parents, parentId],
  );

  // When a student is picked and no parent set yet, auto-fill their parent.
  function onStudentChange(value: string) {
    setStudentId(value);
    if (!parentId && value) {
      const link = links.find((l) => l.student_id === value);
      if (link) setParentId(link.parent_id);
    }
  }

  function applySuggestedFollowUp(sfu: TidyResult["suggested_follow_up"]) {
    if (sfu.due_in_days === null && !sfu.note) return;
    setWithFollowUp(true);
    setFuDue(defaultDue(sfu.due_in_days ?? 3));
    if (sfu.note) setFuNote(sfu.note);
  }

  // Apply a Granola prefill's suggestion once on mount.
  useEffect(() => {
    if (prefill?.suggestedFollowUp) {
      applySuggestedFollowUp(prefill.suggestedFollowUp);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tidy() {
    setError(null);
    setTidying(true);
    const res = await tidyAndExtractAction({
      channel,
      studentName,
      parentName,
      rawNotes,
    });
    setTidying(false);
    if (!res.ok || !res.result) {
      setError(res.error ?? "Tidy failed.");
      return;
    }
    setSummary(res.result.summary);
    setActionItems(res.result.action_items);
    setTidied(true);
    applySuggestedFollowUp(res.result.suggested_follow_up);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await logInteraction({
        student_id: studentId || null,
        parent_id: parentId || null,
        channel,
        occurred_at: new Date(occurredAt).toISOString(),
        raw_notes: rawNotes,
        summary,
        source: prefill?.source ?? "manual",
        granola_note_id: prefill?.granolaNoteId ?? null,
        action_items: actionItems,
        follow_up: withFollowUp
          ? {
              due_at: new Date(fuDue).toISOString(),
              note: fuNote,
              remind_in_app: fuInApp,
              remind_whatsapp: fuWhatsApp,
            }
          : null,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      if (studentId) router.push(`/students/${studentId}`);
      else if (parentId) router.push(`/parents/${parentId}`);
      else router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student">
            <Select
              value={studentId}
              onChange={(e) => onStudentChange(e.target.value)}
            >
              <option value="">— none —</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {s.level ? ` (${s.level})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Parent">
            <Select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">— none —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.relationship ? ` (${p.relationship})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Channel">
            <Select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABELS[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="When">
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Raw notes
            </span>
            {dictation.supported && (
              <button
                type="button"
                onClick={dictation.toggle}
                className={`rounded-md px-2 py-1 text-xs font-medium ${
                  dictation.listening
                    ? "bg-red-50 text-red-600"
                    : "bg-ink-100 text-ink-600 hover:bg-ink-200"
                }`}
              >
                {dictation.listening ? "● Stop dictation" : "🎙 Dictate"}
              </button>
            )}
          </div>
          <Textarea
            ref={notesRef}
            rows={6}
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
            placeholder="Type or dictate what was said…"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={tidy} disabled={tidying || !rawNotes.trim()}>
            {tidying ? "Tidying…" : "✨ Tidy & extract"}
          </Button>
          <span className="text-xs text-ink-500">
            Sends your notes to the AI for a clean summary + action items.
          </span>
        </div>
      </Card>

      {(tidied || summary) && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-700">
              Review &amp; edit
            </h2>
            <Badge tone="accent">AI draft</Badge>
          </div>

          <Field label="Summary">
            <Textarea
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
                Action items
              </span>
              <button
                type="button"
                onClick={() => setActionItems((a) => [...a, ""])}
                className="text-xs font-medium text-accent-600 hover:underline"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {actionItems.length === 0 && (
                <p className="text-sm italic text-ink-400">No action items.</p>
              )}
              {actionItems.map((item, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={item}
                    onChange={(e) =>
                      setActionItems((a) =>
                        a.map((x, j) => (j === i ? e.target.value : x)),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setActionItems((a) => a.filter((_, j) => j !== i))
                    }
                    className="rounded-md px-2 text-ink-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-3 p-5">
        <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
          <input
            type="checkbox"
            checked={withFollowUp}
            onChange={(e) => setWithFollowUp(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-400"
          />
          Set a follow-up reminder
        </label>

        {withFollowUp && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Due">
                <Input
                  type="datetime-local"
                  value={fuDue}
                  onChange={(e) => setFuDue(e.target.value)}
                />
              </Field>
              <Field label="Note">
                <Input
                  value={fuNote}
                  onChange={(e) => setFuNote(e.target.value)}
                  placeholder="What to follow up on…"
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={fuInApp}
                  onChange={(e) => setFuInApp(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-400"
                />
                In-app reminder
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={fuWhatsApp}
                  onChange={(e) => setFuWhatsApp(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-400"
                />
                WhatsApp nudge to me
              </label>
            </div>
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button
          onClick={save}
          disabled={pending || (!studentId && !parentId)}
        >
          {pending ? "Saving…" : "Save conversation"}
        </Button>
        {!studentId && !parentId && (
          <span className="text-xs text-ink-500">
            Pick a student and/or parent first.
          </span>
        )}
      </div>
    </div>
  );
}

function defaultDue(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return toDatetimeLocalValue(d.toISOString());
}
