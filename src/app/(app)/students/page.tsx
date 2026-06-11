import Link from "next/link";
import { getStudents } from "@/lib/queries";
import { Card, PageHeader, EmptyState, LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const students = await getStudents(q);

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Open a student to see their full conversation timeline."
        actions={<LinkButton href="/roster">Import roster</LinkButton>}
      />

      <form className="mb-4" action="/students" method="get">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search students by name…"
          className="w-full max-w-md rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
        />
      </form>

      {students.length === 0 ? (
        <EmptyState
          title={q ? "No students match that search" : "No students yet"}
          description={
            q
              ? "Try a different name."
              : "Import a roster CSV to seed your students and parents."
          }
          action={
            !q ? <LinkButton href="/roster">Import roster</LinkButton> : undefined
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-100">
            {students.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/students/${s.id}`}
                  className="flex items-center justify-between px-4 py-3 transition hover:bg-ink-50"
                >
                  <span className="font-medium text-ink-800">{s.full_name}</span>
                  <span className="text-sm text-ink-500">
                    {s.level ?? ""}
                    {s.external_ref ? ` · ${s.external_ref}` : ""}
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
