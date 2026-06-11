import { PageHeader } from "@/components/ui";
import { RosterImport } from "@/components/RosterImport";

export default function RosterPage() {
  return (
    <div>
      <PageHeader
        title="Roster import"
        subtitle="Seed students, parents, and their links from one CSV."
      />
      <RosterImport />
    </div>
  );
}
