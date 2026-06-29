import {
  getPendingFollowUps,
  getRecentInteractions,
  type DueFollowUp,
} from "@/lib/queries";
import { bucketForDueDate, type DueBucket } from "@/lib/dates";
import { DueFollowUpItem } from "@/components/DueFollowUpItem";
import { InteractionCard } from "@/components/InteractionCard";
import { Card, PageHeader, LinkButton, EmptyState, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

const sections: { key: DueBucket; title: string; tone: "red" | "amber" | "neutral" }[] = [
  { key: "overdue", title: "Overdue", tone: "red" },
  { key: "today", title: "Due today", tone: "amber" },
  { key: "upcoming", title: "Upcoming", tone: "neutral" },
];

export default async function DashboardPage() {
  const [followUps, recent] = await Promise.all([
    getPendingFollowUps(),
    getRecentInteractions(6),
  ]);

  const buckets: Record<DueBucket, DueFollowUp[]> = {
    overdue: [],
    today: [],
    upcoming: [],
  };
  for (const fu of followUps) buckets[bucketForDueDate(fu.due_at)].push(fu);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Your follow-ups and the latest captures."
        actions={<LinkButton href="/log">+ Log / Record</LinkButton>}
      />

      {/* Quick capture CTA */}
      <LinkButton
        href="/log"
        className="mb-6 w-full justify-start gap-3 py-4 text-base"
      >
        🎙 Capture an update — type or record
      </LinkButton>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-ink-700">Follow-ups</h2>
        {followUps.length === 0 ? (
          <EmptyState
            title="Nothing due"
            description="Set a follow-up when you log a conversation and it shows here."
          />
        ) : (
          <div className="space-y-6">
            {sections.map((section) => {
              const items = buckets[section.key];
              if (items.length === 0) return null;
              return (
                <div key={section.key}>
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-medium text-ink-600">
                      {section.title}
                    </h3>
                    <Badge tone={section.tone}>{items.length}</Badge>
                  </div>
                  <Card>
                    {items.map((fu) => (
                      <DueFollowUpItem key={fu.id} followUp={fu} />
                    ))}
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-700">
          Recent captures
        </h2>
        {recent.length === 0 ? (
          <EmptyState title="No captures yet" description="Log your first update." />
        ) : (
          <div className="space-y-3">
            {recent.map((interaction) => (
              <InteractionCard key={interaction.id} interaction={interaction} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
