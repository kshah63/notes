import { notFound } from "next/navigation";
import { getTeacher, getTeacherTimeline } from "@/lib/queries";
import type { Channel } from "@/lib/types";
import { PageHeader, LinkButton, EmptyState } from "@/components/ui";
import { TimelineFilters } from "@/components/TimelineFilters";
import { InteractionCard } from "@/components/InteractionCard";

export const dynamic = "force-dynamic";

export default async function TeacherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const teacher = await getTeacher(id);
  if (!teacher) notFound();

  const timeline = await getTeacherTimeline(id, {
    channel: (sp.channel as Channel) || undefined,
    from: sp.from ? new Date(sp.from).toISOString() : undefined,
    to: sp.to ? new Date(`${sp.to}T23:59:59`).toISOString() : undefined,
  });

  return (
    <div>
      <PageHeader
        title={teacher.full_name}
        subtitle={
          [teacher.position, teacher.code].filter(Boolean).join(" · ") ||
          undefined
        }
        actions={
          <LinkButton href={`/log?teacher=${teacher.id}`}>
            + Log conversation
          </LinkButton>
        }
      />

      <h2 className="mb-1 text-sm font-semibold text-ink-700">
        Conversations ({timeline.length})
      </h2>
      <p className="mb-3 text-xs text-ink-500">
        Every conversation tagged with this teacher.
      </p>
      <TimelineFilters />

      {timeline.length === 0 ? (
        <EmptyState
          title="No conversations tagged yet"
          description="Tag a teacher when logging a conversation to see it here."
        />
      ) : (
        <div className="space-y-3">
          {timeline.map((interaction) => (
            <InteractionCard
              key={interaction.id}
              interaction={interaction}
              showTeacher={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
