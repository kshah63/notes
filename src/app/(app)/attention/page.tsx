import Link from "next/link";
import { getStudentsNeedingAttention } from "@/lib/queries";
import { Card, PageHeader, EmptyState, LinkButton, Badge } from "@/components/ui";
import { relativeFromNow, formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AttentionPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const windowDays = Math.max(1, parseInt(days ?? "30", 10) || 30);
  const students = await getStudentsNeedingAttention(windowDays);

  const windows = [14, 30, 60, 90];

  return (
    <div>
      <PageHeader
        title="Needs attention"
        subtitle={`Students you haven't spoken to in over ${windowDays} days — reach out before they slip.`}
        actions={
          <Badge tone={students.length ? "amber" : "neutral"}>
            {students.length}
          </Badge>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {windows.map((w) => (
          <Link
            key={w}
            href={`/attention?days=${w}`}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              w === windowDays
                ? "border-accent-500 bg-accent-50 font-medium text-accent-700"
                : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            }`}
          >
            {w}+ days
          </Link>
        ))}
      </div>

      {students.length === 0 ? (
        <EmptyState
          title="Nobody's gone quiet"
          description={`Every student with past conversations has been contacted within ${windowDays} days.`}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-100">
            {students.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/students/${s.id}`}
                    className="font-medium text-accent-700 hover:underline"
                  >
                    {s.full_name}
                  </Link>
                  {s.level && (
                    <span className="text-sm text-ink-500"> · {s.level}</span>
                  )}
                  <div className="text-xs text-ink-500">
                    {s.last_contact
                      ? `last spoke ${relativeFromNow(s.last_contact)} (${formatDate(
                          s.last_contact,
                        )})`
                      : "no contact logged"}
                  </div>
                </div>
                <LinkButton
                  href={`/log?student=${s.id}`}
                  variant="secondary"
                  className="shrink-0"
                >
                  Log
                </LinkButton>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
