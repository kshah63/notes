import Link from "next/link";
import { getConfirmationBatches, type ConfirmationBatchView } from "@/lib/queries";
import { formatSgt, formatTaughtOn } from "@/lib/confirmations";
import type { TeacherConfirmationStatus } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ConfirmationUpload } from "@/components/ConfirmationUpload";
import { BatchActions } from "@/components/BatchActions";

type BatchItem = ConfirmationBatchView["items"][number];

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<
  TeacherConfirmationStatus,
  { label: string; tone: "neutral" | "accent" | "green" | "amber" | "red" }
> = {
  sent: { label: "Awaiting reply", tone: "accent" },
  confirmed: { label: "Confirmed", tone: "green" },
  amended: { label: "Amended", tone: "amber" },
  no_response: { label: "No response", tone: "red" },
  unreachable: { label: "Not sent", tone: "red" },
};

export default async function ConfirmationsPage() {
  const batches = await getConfirmationBatches();

  return (
    <div>
      <PageHeader
        title="Daily confirmations"
        subtitle="Upload the day's teaching log; every teacher gets their student list on WhatsApp at 6 pm SGT and is nudged every 2 hours until they confirm."
      />

      <ConfirmationUpload />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink-700">
        Recent batches
      </h2>
      {batches.length === 0 ? (
        <EmptyState
          title="No teaching logs uploaded yet"
          description="Upload a spreadsheet above — one row per teacher-student pairing."
        />
      ) : (
        <div className="space-y-4">
          {batches.map((batch) => (
            <BatchCard key={batch.id} batch={batch} />
          ))}
        </div>
      )}
    </div>
  );
}

function BatchCard({ batch }: { batch: ConfirmationBatchView }) {
  const itemsByTeacher = new Map<string, BatchItem[]>();
  for (const item of batch.items) {
    const list = itemsByTeacher.get(item.teacher_id) ?? [];
    list.push(item);
    itemsByTeacher.set(item.teacher_id, list);
  }

  const confirmations = [...batch.confirmations].sort((a, b) =>
    (a.teacher?.full_name ?? "").localeCompare(b.teacher?.full_name ?? ""),
  );
  const responded = confirmations.filter((c) =>
    ["confirmed", "amended"].includes(c.status),
  ).length;
  const teacherCount =
    batch.status === "scheduled" ? itemsByTeacher.size : confirmations.length;
  const hasUnreachable = confirmations.some((c) => c.status === "unreachable");

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-800">
            {formatTaughtOn(batch.taught_on)}
            {batch.source_filename ? (
              <span className="ml-2 font-normal text-ink-400">
                {batch.source_filename}
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 text-xs text-ink-500">
            {batch.status === "scheduled"
              ? `Sends ${formatSgt(batch.dispatch_after)} SGT · ${teacherCount} teacher${teacherCount === 1 ? "" : "s"}, ${batch.items.length} pairings`
              : `Sent ${batch.dispatched_at ? formatSgt(batch.dispatched_at) : "—"} SGT · ${responded}/${teacherCount} responded`}
          </p>
        </div>
        <BatchActions
          batchId={batch.id}
          status={batch.status}
          hasUnreachable={hasUnreachable}
        />
      </div>

      {batch.status === "scheduled" ? (
        <ScheduledPreview itemsByTeacher={itemsByTeacher} />
      ) : (
        <ul className="mt-4 divide-y divide-ink-100">
          {confirmations.map((conf) => {
            const items = itemsByTeacher.get(conf.teacher_id) ?? [];
            const active = items.filter((i) => i.status !== "removed");
            const removed = items.filter((i) => i.status === "removed");
            const added = items.filter((i) => i.source === "teacher_added");
            const badge = STATUS_BADGE[conf.status];
            return (
              <li key={conf.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/teachers/${conf.teacher_id}`}
                      className="text-sm font-medium text-ink-800 hover:text-accent-700"
                    >
                      {conf.teacher?.full_name ?? "Unknown teacher"}
                    </Link>
                    <span className="text-xs text-ink-400">
                      {active.length} student{active.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {conf.nudge_count > 0 && conf.status === "sent" && (
                      <span className="text-xs text-ink-400">
                        nudged ×{conf.nudge_count}
                      </span>
                    )}
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                </div>
                {(removed.length > 0 || added.length > 0) && (
                  <p className="mt-1 text-xs text-amber-700">
                    {added.length > 0 &&
                      `Added: ${added.map((i) => i.student_name).join(", ")}. `}
                    {removed.length > 0 &&
                      `Removed: ${removed.map((i) => i.student_name).join(", ")}.`}
                  </p>
                )}
                {conf.status === "unreachable" && conf.response_text && (
                  <p className="mt-1 text-xs text-red-600">{conf.response_text}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// Before dispatch there are no per-teacher confirmation rows yet — show who
// will be messaged and flag missing phone numbers while there's time to fix.
function ScheduledPreview({
  itemsByTeacher,
}: {
  itemsByTeacher: Map<string, BatchItem[]>;
}) {
  return (
    <ul className="mt-4 divide-y divide-ink-100">
      {[...itemsByTeacher.entries()].map(([teacherId, items]) => (
        <li
          key={teacherId}
          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
        >
          <div className="flex items-center gap-2">
            <Link
              href={`/teachers/${teacherId}`}
              className="text-sm font-medium text-ink-800 hover:text-accent-700"
            >
              {items[0]?.teacher?.full_name ?? "Teacher"}
            </Link>
            {!items[0]?.teacher?.phone_e164 && (
              <Badge tone="amber">no phone</Badge>
            )}
          </div>
          <span className="max-w-[60%] truncate text-xs text-ink-500">
            {items.map((i) => i.student_name).join(", ")}
          </span>
        </li>
      ))}
    </ul>
  );
}
