"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";
import { cancelBatch, dispatchBatchNow } from "@/app/actions/confirmations";

// "Send now" / "Cancel" controls on a batch card. Send-now also retries
// teachers who couldn't be reached on an already-dispatched batch.
export function BatchActions({
  batchId,
  status,
  hasUnreachable,
}: {
  batchId: string;
  status: string;
  hasUnreachable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  function send() {
    setNote(null);
    startTransition(async () => {
      const res = await dispatchBatchNow(batchId);
      if (!res.ok) {
        setNote(res.error ?? "Send failed.");
      } else {
        const parts = [
          `Sent to ${res.sent ?? 0} teacher${(res.sent ?? 0) === 1 ? "" : "s"}`,
          (res.unreachable ?? 0) > 0 ? `${res.unreachable} unreachable` : null,
          res.error ?? null,
        ].filter(Boolean);
        setNote(parts.join(" · "));
      }
      router.refresh();
    });
  }

  function cancel() {
    setNote(null);
    startTransition(async () => {
      const res = await cancelBatch(batchId);
      if (!res.ok) setNote(res.error ?? "Cancel failed.");
      router.refresh();
    });
  }

  const canSend = status === "scheduled" || (status === "dispatched" && hasUnreachable);
  if (!canSend && !note) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canSend && (
        <Button onClick={send} disabled={pending}>
          {pending
            ? "Sending…"
            : status === "scheduled"
              ? "Send now"
              : "Retry unreached"}
        </Button>
      )}
      {status === "scheduled" && (
        <button
          onClick={cancel}
          disabled={pending}
          className="rounded-lg px-3 py-2 text-sm text-ink-600 transition hover:bg-ink-100"
        >
          Cancel
        </button>
      )}
      {note && <span className="text-xs text-ink-500">{note}</span>}
    </div>
  );
}
