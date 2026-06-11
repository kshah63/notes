import {
  getStudents,
  getParents,
  getStudentParentLinks,
  getSettings,
} from "@/lib/queries";
import { isAnthropicConfigured } from "@/lib/env";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { LogConversationForm } from "@/components/LogConversationForm";

export const dynamic = "force-dynamic";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; parent?: string }>;
}) {
  const sp = await searchParams;
  const [students, parents, links, settings] = await Promise.all([
    getStudents(),
    getParents(),
    getStudentParentLinks(),
    getSettings(),
  ]);

  if (students.length === 0 && parents.length === 0) {
    return (
      <div>
        <PageHeader title="Log conversation" />
        <EmptyState
          title="No students or parents yet"
          description="Import a roster CSV first, then come back to log a conversation."
          action={<LinkButton href="/roster">Import roster</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Log conversation"
        subtitle="Capture the chat, tidy it with AI, and set a follow-up."
      />
      {!isAnthropicConfigured() && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          AI tidy is unavailable until <code>ANTHROPIC_API_KEY</code> is set. You
          can still write a summary by hand and save.
        </p>
      )}
      <LogConversationForm
        students={students}
        parents={parents}
        links={links}
        defaultChannel={settings?.default_channel ?? "call"}
        initialStudentId={sp.student}
        initialParentId={sp.parent}
      />
    </div>
  );
}
