import {
  getStudents,
  getParents,
  getStudentParentLinks,
  getSettings,
} from "@/lib/queries";
import { isGranolaApiConfigured } from "@/lib/env";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { GranolaImport } from "@/components/GranolaImport";

export const dynamic = "force-dynamic";

export default async function GranolaPage() {
  const [students, parents, links, settings] = await Promise.all([
    getStudents(),
    getParents(),
    getStudentParentLinks(),
    getSettings(),
  ]);

  if (students.length === 0 && parents.length === 0) {
    return (
      <div>
        <PageHeader title="Granola import" />
        <EmptyState
          title="Import a roster first"
          description="Granola notes attach to a student/parent, so seed your roster first."
          action={<LinkButton href="/roster">Import roster</LinkButton>}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Granola import"
        subtitle="Pull a meeting into the same tidy-and-save pipeline."
      />
      <GranolaImport
        students={students}
        parents={parents}
        links={links}
        defaultChannel={settings?.default_channel ?? "in_person"}
        apiConfigured={isGranolaApiConfigured()}
        defaultPath={settings?.granola_path ?? "paste"}
      />
    </div>
  );
}
