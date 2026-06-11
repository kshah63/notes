"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { InteractionWithDetails } from "@/lib/types";
import { ChannelBadge } from "./ChannelBadge";
import { ActionItemToggle } from "./ActionItemToggle";
import { FollowUpForm } from "./FollowUpForm";
import { Badge, Button, Card, Textarea } from "./ui";
import { formatDateTime, formatDate, relativeFromNow } from "@/lib/dates";
import { updateInteraction, deleteInteraction } from "@/app/actions/interactions";
import { completeFollowUp } from "@/app/actions/follow-ups";

export function InteractionCard({
  interaction,
  showStudent = true,
  showParent = true,
}: {
  interaction: InteractionWithDetails;
  showStudent?: boolean;
  showParent?: boolean;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(interaction.summary ?? "");
  const [addingFollowUp, setAddingFollowUp] = useState(false);
  const [pending, startTransition] = useTransition();

  const openFollowUps = interaction.follow_ups.filter(
    (f) => f.status === "pending",
  );

  function saveSummary() {
    startTransition(async () => {
      const res = await updateInteraction(interaction.id, {
        summary,
        student_id: interaction.student_id,
        parent_id: interaction.parent_id,
      });
      if (res.ok) setEditing(false);
    });
  }

  function remove() {
    if (!confirm("Delete this logged conversation? This cannot be undone."))
      return;
    startTransition(async () => {
      await deleteInteraction(interaction.id);
    });
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ChannelBadge channel={interaction.channel} />
          {interaction.source === "granola" && <Badge>Granola</Badge>}
          <span className="text-sm text-ink-500">
            {formatDateTime(interaction.occurred_at)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded px-2 py-1 text-xs text-ink-500 hover:bg-ink-100"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          <button
            onClick={remove}
            disabled={pending}
            className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>

      {(showStudent || showParent) &&
        (interaction.student || interaction.parent) && (
          <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {showStudent && interaction.student && (
              <Link
                href={`/students/${interaction.student.id}`}
                className="font-medium text-accent-700 hover:underline"
              >
                {interaction.student.full_name}
                {interaction.student.level
                  ? ` · ${interaction.student.level}`
                  : ""}
              </Link>
            )}
            {showParent && interaction.parent && (
              <Link
                href={`/parents/${interaction.parent.id}`}
                className="text-ink-600 hover:underline"
              >
                {interaction.parent.full_name}
                {interaction.parent.relationship
                  ? ` (${interaction.parent.relationship})`
                  : ""}
              </Link>
            )}
          </div>
        )}

      {editing ? (
        <div className="space-y-2">
          <Textarea
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <Button onClick={saveSummary} disabled={pending}>
            {pending ? "Saving…" : "Save summary"}
          </Button>
        </div>
      ) : interaction.summary ? (
        <p className="whitespace-pre-wrap text-sm text-ink-800">
          {interaction.summary}
        </p>
      ) : (
        <p className="text-sm italic text-ink-400">No summary.</p>
      )}

      {interaction.raw_notes && (
        <div className="mt-2">
          <button
            onClick={() => setShowRaw((v) => !v)}
            className="text-xs font-medium text-ink-500 hover:text-ink-700"
          >
            {showRaw ? "Hide raw notes" : "Show raw notes"}
          </button>
          {showRaw && (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-3 text-xs text-ink-600">
              {interaction.raw_notes}
            </pre>
          )}
        </div>
      )}

      {interaction.action_items.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
          {interaction.action_items.map((item) => (
            <ActionItemToggle
              key={item.id}
              id={item.id}
              text={item.text}
              done={item.done}
            />
          ))}
        </div>
      )}

      {openFollowUps.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-ink-100 pt-3">
          {openFollowUps.map((fu) => (
            <FollowUpRow
              key={fu.id}
              id={fu.id}
              dueAt={fu.due_at}
              note={fu.note}
              remindWhatsApp={fu.remind_whatsapp}
            />
          ))}
        </div>
      )}

      <div className="mt-3">
        {addingFollowUp ? (
          <FollowUpForm
            interactionId={interaction.id}
            studentId={interaction.student_id}
            parentId={interaction.parent_id}
            onDone={() => setAddingFollowUp(false)}
          />
        ) : (
          <button
            onClick={() => setAddingFollowUp(true)}
            className="text-xs font-medium text-accent-600 hover:underline"
          >
            + Add follow-up
          </button>
        )}
      </div>
    </Card>
  );
}

function FollowUpRow({
  id,
  dueAt,
  note,
  remindWhatsApp,
}: {
  id: string;
  dueAt: string;
  note: string | null;
  remindWhatsApp: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return null;

  return (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-medium text-amber-800">
            Follow-up {relativeFromNow(dueAt)}
          </span>
          <span className="text-xs text-amber-700">{formatDate(dueAt)}</span>
          {remindWhatsApp && <Badge tone="green">WhatsApp</Badge>}
        </div>
        {note && <p className="mt-0.5 text-amber-900">{note}</p>}
      </div>
      <button
        onClick={() =>
          startTransition(async () => {
            const res = await completeFollowUp(id);
            if (res.ok) setDone(true);
          })
        }
        disabled={pending}
        className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
      >
        Done
      </button>
    </div>
  );
}
