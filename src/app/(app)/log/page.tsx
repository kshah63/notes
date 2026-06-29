import {
  getParents,
  getStudentParentLinks,
  getSettings,
  getStudent,
  getTeacher,
} from "@/lib/queries";
import { isAnthropicConfigured } from "@/lib/env";
import { PageHeader } from "@/components/ui";
import { LogConversationForm } from "@/components/LogConversationForm";
import type { PickerOption } from "@/app/actions/lookup";

export const dynamic = "force-dynamic";

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; parent?: string; teacher?: string }>;
}) {
  const sp = await searchParams;
  const [parents, links, settings] = await Promise.all([
    getParents(),
    getStudentParentLinks(),
    getSettings(),
  ]);

  // Resolve any prefilled entities to picker options (labels for display).
  let initialStudent: PickerOption | null = null;
  if (sp.student) {
    const s = await getStudent(sp.student);
    if (s) {
      initialStudent = {
        id: s.id,
        label: [s.full_name, s.level, s.school].filter(Boolean).join(" · "),
      };
    }
  }
  let initialTeacher: PickerOption | null = null;
  if (sp.teacher) {
    const t = await getTeacher(sp.teacher);
    if (t) {
      initialTeacher = {
        id: t.id,
        label: [t.full_name, t.position].filter(Boolean).join(" · "),
      };
    }
  }

  return (
    <div>
      <PageHeader
        title="Log conversation"
        subtitle="Capture the moment — type or record. AI structures it and sets reminders."
      />
      {!isAnthropicConfigured() && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          AI tidy is unavailable until <code>ANTHROPIC_API_KEY</code> is set. You
          can still write a summary by hand and save.
        </p>
      )}
      <LogConversationForm
        parents={parents}
        links={links}
        defaultChannel={settings?.default_channel ?? "call"}
        initialStudent={initialStudent}
        initialParentId={sp.parent}
        initialTeacher={initialTeacher}
      />
    </div>
  );
}
