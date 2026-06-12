import { PageHeader } from "@/components/ui";
import { RosterImport } from "@/components/RosterImport";

// Bulk imports can run for a few thousand rows — give the function headroom.
export const maxDuration = 60;

export default function RosterPage() {
  return (
    <div>
      <PageHeader
        title="Roster import"
        subtitle="Seed students and teachers from an Excel (.xlsx) or CSV file."
      />
      <RosterImport />
    </div>
  );
}
