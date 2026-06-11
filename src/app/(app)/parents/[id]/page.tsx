import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getParent,
  getParentStudents,
  getParentTimeline,
} from "@/lib/queries";
import type { Channel } from "@/lib/types";
import { CHANNEL_LABELS } from "@/lib/types";
import { PageHeader, Card, LinkButton, EmptyState, Badge } from "@/components/ui";
import { ParentEditor } from "@/components/ParentEditor";
import { TimelineFilters } from "@/components/TimelineFilters";
import { InteractionCard } from "@/components/InteractionCard";

export const dynamic = "force-dynamic";

export default async function ParentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const parent = await getParent(id);
  if (!parent) notFound();

  const [students, timeline] = await Promise.all([
    getParentStudents(id),
    getParentTimeline(id, {
      channel: (sp.channel as Channel) || undefined,
      from: sp.from ? new Date(sp.from).toISOString() : undefined,
      to: sp.to ? new Date(`${sp.to}T23:59:59`).toISOString() : undefined,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={parent.full_name}
        subtitle={parent.relationship ?? undefined}
        actions={
          <LinkButton href={`/log?parent=${parent.id}`}>
            + Log conversation
          </LinkButton>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-700">Contact</h2>
            <ParentEditor parent={parent} />
          </div>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="w-28 text-ink-500">Preferred</dt>
              <dd>
                <Badge tone="accent">
                  {CHANNEL_LABELS[parent.preferred_channel as Channel]}
                </Badge>
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 text-ink-500">WhatsApp</dt>
              <dd className="text-ink-800">{parent.phone_e164 ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 text-ink-500">Email</dt>
              <dd className="text-ink-800">{parent.email ?? "—"}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-700">Students</h2>
          {students.length === 0 ? (
            <p className="text-sm italic text-ink-400">No students linked.</p>
          ) : (
            <ul className="space-y-1.5">
              {students.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/students/${s.id}`}
                    className="text-sm font-medium text-accent-700 hover:underline"
                  >
                    {s.full_name}
                  </Link>
                  {s.level && (
                    <span className="text-sm text-ink-500"> · {s.level}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mb-1 text-sm font-semibold text-ink-700">
        Timeline ({timeline.length})
      </h2>
      <p className="mb-3 text-xs text-ink-500">
        Spanning every linked student plus calls logged directly to this parent.
      </p>
      <TimelineFilters />

      {timeline.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Log a conversation with this parent."
          action={
            <LinkButton href={`/log?parent=${parent.id}`}>
              Log conversation
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-3">
          {timeline.map((interaction) => (
            <InteractionCard key={interaction.id} interaction={interaction} />
          ))}
        </div>
      )}
    </div>
  );
}
