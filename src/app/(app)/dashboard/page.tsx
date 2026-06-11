import { getPendingFollowUps, type DueFollowUp } from "@/lib/queries";
import { bucketForDueDate, type DueBucket } from "@/lib/dates";
import { DueFollowUpItem } from "@/components/DueFollowUpItem";
import { Card, PageHeader, LinkButton, EmptyState, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const sections: { key: DueBucket; title: string; tone: "red" | "amber" | "neutral" }[] = [
  { key: "overdue", title: "Overdue", tone: "red" },
  { key: "today", title: "Due today", tone: "amber" },
  { key: "upcoming", title: "Upcoming", tone: "neutral" },
];

export default async function DashboardPage() {
  const followUps = await getPendingFollowUps();

  const buckets: Record<DueBucket, DueFollowUp[]> = {
    overdue: [],
    today: [],
    upcoming: [],
  };
  for (const fu of followUps) {
    buckets[bucketForDueDate(fu.due_at)].push(fu);
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your pending follow-ups, oldest first."
        actions={
          <LinkButton href="/log">+ Log conversation</LinkButton>
        }
      />

      {followUps.length === 0 ? (
        <EmptyState
          title="Nothing due"
          description="Log a conversation and set a follow-up to see it here."
          action={<LinkButton href="/log">Log conversation</LinkButton>}
        />
      ) : (
        <div className="space-y-6">
          {sections.map((section) => {
            const items = buckets[section.key];
            if (items.length === 0) return null;
            return (
              <section key={section.key}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-ink-700">
                    {section.title}
                  </h2>
                  <Badge tone={section.tone}>{items.length}</Badge>
                </div>
                <Card>
                  {items.map((fu) => (
                    <DueFollowUpItem key={fu.id} followUp={fu} />
                  ))}
                </Card>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
