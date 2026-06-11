"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { DueFollowUp } from "@/lib/queries";
import { completeFollowUp, cancelFollowUp } from "@/app/actions/follow-ups";
import { Badge } from "./ui";
import { formatDateTime, relativeFromNow } from "@/lib/dates";

export function DueFollowUpItem({ followUp }: { followUp: DueFollowUp }) {
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const subject = followUp.parent ?? followUp.student;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink-800">
            {relativeFromNow(followUp.due_at)}
          </span>
          <span className="text-xs text-ink-400">
            {formatDateTime(followUp.due_at)}
          </span>
          {followUp.remind_whatsapp && <Badge tone="green">WhatsApp</Badge>}
        </div>
        {followUp.note && (
          <p className="mt-1 text-sm text-ink-700">{followUp.note}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-500">
          {followUp.student && (
            <Link
              href={`/students/${followUp.student.id}`}
              className="text-accent-700 hover:underline"
            >
              {followUp.student.full_name}
            </Link>
          )}
          {followUp.parent && (
            <Link
              href={`/parents/${followUp.parent.id}`}
              className="hover:underline"
            >
              {followUp.parent.full_name}
            </Link>
          )}
          {!subject && <span>General reminder</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() =>
            startTransition(async () => {
              const res = await completeFollowUp(followUp.id);
              if (res.ok) setHidden(true);
            })
          }
          disabled={pending}
          className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
        >
          Done
        </button>
        <button
          onClick={() =>
            startTransition(async () => {
              const res = await cancelFollowUp(followUp.id);
              if (res.ok) setHidden(true);
            })
          }
          disabled={pending}
          className="rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-ink-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
