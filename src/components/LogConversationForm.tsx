"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import type { Channel, Parent, TidyResult } from "@/lib/types";
import { EntityPicker } from "./EntityPicker";
import { searchStudents, searchTeachers, type PickerOption } from "@/app/actions/lookup";
import { toDatetimeLocalValue } from "@/lib/dates";
import { tidyAndExtractAction, logInteraction } from "@/app/actions/interactions";
import { useDictation } from "@/lib/useDictation";

export function LogConversationForm({
  parents,
  links,
  defaultChannel,
  initialStudent,
  initialParentId,
  initialTeacher,
  prefill,
}: {
  parents: Parent[];
  links: { student_id: string; parent_id: string }[];
  defaultChannel: Channel;
  initialStudent?: PickerOption | null;
  initialParentId?: string;
  initialTeacher?: PickerOption | null;
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

  const [student, setStudent] = useState<PickerOption | null>(
    initialStudent ?? null,
  );
  const [teacher, setTeacher] = useState<PickerOption | null>(
    initialTeacher ?? null,
  );
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
  const [fuWhatsApp, setFuWhatsApp] = useState(true);

  const [tidying, setTidying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // --- Voice capture (works for a 5s update or a 30-min meeting) ---
  const [seconds, setSeconds] = useState(0);
  const dictation = useDictation(
    (text) => setRawNotes((prev) => (prev ? `${prev} ${text}` : text)),
    { continuous: true, interim: true },
  );
  useEffect(() => {
    if (!dictation.listening) {
      setSeconds(0);
      return;
    }
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [dictation.listening]);

  const studentName = student?.label.split(" · ")[0];
  const parentName = parents.find((p) => p.id === parentId)?.full_name;

  function onStudentChange(opt: PickerOption | null) {
    setStudent(opt);
    if (opt && !parentId) {
      const link = links.find((l) => l.student_id === opt.id);
      if (link) setParentId(link.parent_id);
    }
  }

  function applySuggestedFollowUp(sfu: TidyResult["suggested_follow_up"]) {
    if (sfu.due_in_days === null && !sfu.note) return;
    setWithFollowUp(true);
    setFuDue(defaultDue(sfu.due_in_days ?? 3));
    if (sfu.note) setFuNote(sfu.note);
  }

  useEffect(() => {
    if (prefill?.suggestedFollowUp) applySuggestedFollowUp(prefill.suggestedFollowUp);
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
    if (!rawNotes.trim() && !summary.trim()) {
      setError("Add some notes (type or record) before saving.");
      return;
    }
    if (dictation.listening) dictation.stop();
    startTransition(async () => {
      const res = await logInteraction({
        student_id: student?.id ?? null,
        parent_id: parentId || null,
        teacher_id: teacher?.id ?? null,
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
      if (student) router.push(`/students/${student.id}`);
      else if (parentId) router.push(`/parents/${parentId}`);
      else if (teacher) router.push(`/teachers/${teacher.id}`);
      else router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* Capture first — fastest path to logging something. */}
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            What happened?
          </span>
          {dictation.supported && (
            <button
              type="button"
              onClick={dictation.toggle}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
                dictation.listening
                  ? "bg-red-500 text-white"
                  : "bg-accent-600 text-white hover:bg-accent-700"
              }`}
            >
              {dictation.listening ? (
                <>
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
                  Stop · {formatClock(seconds)}
                </>
              ) : (
                <>🎙 Record</>
              )}
            </button>
          )}
        </div>
        <Textarea
          rows={6}
          value={rawNotes}
          onChange={(e) => setRawNotes(e.target.value)}
          placeholder="Type, or tap Record and talk. (On iPhone you can also use the keyboard mic.)"
        />
        {dictation.listening && (
          <p className="text-sm text-ink-500">
            <span className="text-red-500">● recording</span>
            {dictation.interim ? ` — ${dictation.interim}` : " — listening…"}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={tidy} disabled={tidying || !rawNotes.trim()}>
            {tidying ? "Tidying…" : "✨ Tidy & extract"}
          </Button>
          <span className="text-xs text-ink-500">
            AI cleans it up and pulls out action items.
          </span>
        </div>
      </Card>

      {/* Who & how */}
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Student">
            <EntityPicker
              value={student}
              onChange={onStudentChange}
              search={searchStudents}
              placeholder="Search students…"
            />
          </Field>
          <Field label="Parent">
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— none —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.relationship ? ` (${p.relationship})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teacher">
            <EntityPicker
              value={teacher}
              onChange={setTeacher}
              search={searchTeachers}
              placeholder="Search teachers…"
            />
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
        <p className="text-xs text-ink-500">
          Leave everything blank to save a quick unfiled note — you can file it
          from the dashboard later.
        </p>
      </Card>

      {(tidied || summary) && (
        <Card className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-700">Review &amp; edit</h2>
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
                WhatsApp nudge
              </label>
            </div>
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
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

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
