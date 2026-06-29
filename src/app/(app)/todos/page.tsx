import Link from "next/link";
import { getOpenActionItems } from "@/lib/queries";
import { ActionItemToggle } from "@/components/ActionItemToggle";
import { Card, PageHeader, EmptyState, LinkButton, Badge } from "@/components/ui";
import { formatDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const items = await getOpenActionItems();

  return (
    <div>
      <PageHeader
        title="To-dos"
        subtitle="Every open action item, newest first."
        actions={
          <Badge tone={items.length ? "accent" : "neutral"}>
            {items.length} open
          </Badge>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="All clear"
          description="Action items extracted from your conversations show up here until you tick them off."
          action={<LinkButton href="/log">Log a conversation</LinkButton>}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-100">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 px-4 py-3"
              >
                <ActionItemToggle id={item.id} text={item.text} done={item.done} />
                <div className="shrink-0 text-right text-xs text-ink-500">
                  {item.student && (
                    <Link
                      href={`/students/${item.student.id}`}
                      className="block text-accent-700 hover:underline"
                    >
                      {item.student.full_name}
                    </Link>
                  )}
                  {item.occurred_at && <span>{formatDate(item.occurred_at)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
