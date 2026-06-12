import { notFound } from "next/navigation";
import {
  getStudent,
  getStudentParents,
  getStudentTimeline,
  getParents,
} from "@/lib/queries";
import type { Channel } from "@/lib/types";
import { PageHeader, Card, LinkButton, EmptyState } from "@/components/ui";
import { StudentEditor } from "@/components/StudentEditor";
import { ParentManager } from "@/components/ParentManager";
import { TimelineFilters } from "@/components/TimelineFilters";
import { InteractionCard } from "@/components/InteractionCard";

export const dynamic = "force-dynamic";

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string; from?: string; to?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const student = await getStudent(id);
  if (!student) notFound();

  const [parents, allParents, timeline] = await Promise.all([
    getStudentParents(id),
    getParents(),
    getStudentTimeline(id, {
      channel: (sp.channel as Channel) || undefined,
      from: sp.from ? new Date(sp.from).toISOString() : undefined,
      to: sp.to ? new Date(`${sp.to}T23:59:59`).toISOString() : undefined,
    }),
  ]);

  return (
    <div>
      <PageHeader
        title={student.full_name}
        subtitle={
          [student.level, student.school].filter(Boolean).join(" · ") ||
          undefined
        }
        actions={
          <LinkButton href={`/log?student=${student.id}`}>
            + Log conversation
          </LinkButton>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-700">Student</h2>
            <StudentEditor student={student} />
          </div>
          {student.courses && (
            <div className="mt-2">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
                Courses
              </span>
              <p className="whitespace-pre-wrap text-sm text-ink-700">
                {student.courses}
              </p>
            </div>
          )}
          <div className="mt-2">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Standing notes
            </span>
            {student.notes ? (
              <p className="whitespace-pre-wrap text-sm text-ink-700">
                {student.notes}
              </p>
            ) : (
              <p className="text-sm italic text-ink-400">None.</p>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-ink-700">Parents</h2>
          <ParentManager
            studentId={student.id}
            linked={parents}
            allParents={allParents}
          />
        </Card>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-ink-700">
        Timeline ({timeline.length})
      </h2>
      <TimelineFilters />

      {timeline.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Log your first conversation with this student."
          action={
            <LinkButton href={`/log?student=${student.id}`}>
              Log conversation
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-3">
          {timeline.map((interaction) => (
            <InteractionCard
              key={interaction.id}
              interaction={interaction}
              showStudent={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
