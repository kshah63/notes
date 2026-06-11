import Link from "next/link";
import { search } from "@/lib/queries";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { InteractionCard } from "@/components/InteractionCard";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();
  const results = term
    ? await search(term)
    : { interactions: [], students: [], parents: [] };

  const total =
    results.interactions.length +
    results.students.length +
    results.parents.length;

  return (
    <div>
      <PageHeader
        title="Search"
        subtitle={term ? `Results for “${term}”` : "Search across your notes."}
      />

      {!term ? (
        <EmptyState title="Type a query in the sidebar search box." />
      ) : total === 0 ? (
        <EmptyState title="No matches" description="Try a different term." />
      ) : (
        <div className="space-y-6">
          {(results.students.length > 0 || results.parents.length > 0) && (
            <Card className="p-4">
              {results.students.length > 0 && (
                <div className="mb-3">
                  <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Students
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {results.students.map((s) => (
                      <Link
                        key={s.id}
                        href={`/students/${s.id}`}
                        className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-accent-700 hover:bg-ink-50"
                      >
                        {s.full_name}
                        {s.level ? ` · ${s.level}` : ""}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {results.parents.length > 0 && (
                <div>
                  <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Parents
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {results.parents.map((p) => (
                      <Link
                        key={p.id}
                        href={`/parents/${p.id}`}
                        className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-700 hover:bg-ink-50"
                      >
                        {p.full_name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          {results.interactions.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink-700">
                Conversations
              </h2>
              <div className="space-y-3">
                {results.interactions.map((interaction) => (
                  <InteractionCard
                    key={interaction.id}
                    interaction={interaction}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
