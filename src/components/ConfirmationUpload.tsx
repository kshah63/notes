"use client";

import { ImportWizard, type ImportField } from "./ImportWizard";
import { createConfirmationBatch } from "@/app/actions/confirmations";

// Upload the day's teaching log — one row per (teacher, student) pairing.
// Wide formats ("Students" cell with commas) also work: the cell is split.
const fields: ImportField[] = [
  {
    key: "teacher_name",
    label: "Teacher",
    required: true,
    aliases: ["teacher", "teachername", "tutor", "tutorname", "staff", "name"],
  },
  {
    key: "student_name",
    label: "Student(s)",
    required: true,
    aliases: ["student", "studentname", "students", "studentnames", "class", "pupil"],
  },
];

// A "students" cell may hold several names ("Aiden, Bella"). Explode those
// into one record per student before handing off to the server action.
function explode(records: Record<string, string>[]) {
  return records.flatMap((r) => {
    const teacher = r.teacher_name ?? "";
    return (r.student_name ?? "")
      .split(/[,;\n/]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((student) => ({ teacher_name: teacher, student_name: student }));
  });
}

export function ConfirmationUpload() {
  return (
    <ImportWizard
      fields={fields}
      importLabel="Upload"
      helpText='One row per teacher-student pairing (a "Students" cell may list several names separated by commas). Sends at the next 6 pm SGT; uploading again before then replaces the earlier list.'
      onImport={(records, fileName) =>
        createConfirmationBatch(explode(records), fileName)
      }
    />
  );
}
