import Link from "next/link";
import { getTeachers } from "@/lib/queries";
import { Badge, Card, PageHeader, EmptyState, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TeachersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const teachers = await getTeachers(q);

  return (
    <div>
      <PageHeader
        title="Teachers"
        subtitle="Open a teacher to see every conversation tagged with them."
        actions={<LinkButton href="/roster">Import teachers</LinkButton>}
      />

      <form className="mb-4" action="/teachers" method="get">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search teachers by name…"
          className="w-full max-w-md rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
        />
      </form>

      {teachers.length === 0 ? (
        <EmptyState
          title={q ? "No teachers match that search" : "No teachers yet"}
          description={
            q ? "Try a different name." : "Import your staff list to add teachers."
          }
          action={
            !q ? <LinkButton href="/roster">Import teachers</LinkButton> : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-100">
            {teachers.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/teachers/${t.id}`}
                  className="flex items-center justify-between px-4 py-3 transition hover:bg-ink-50"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink-800">{t.full_name}</span>
                    {!t.phone_e164 && <Badge tone="amber">no WhatsApp</Badge>}
                  </span>
                  <span className="text-sm text-ink-500">
                    {[t.phone_e164, t.position, t.code]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
