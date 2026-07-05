"use client";

import { useState } from "react";
import { ImportWizard, type ImportField } from "./ImportWizard";
import {
  importStudents,
  importTeachers,
  type StudentImportRecord,
  type TeacherImportRecord,
} from "@/app/actions/roster";

type Tab = "students" | "teachers";

const studentFields: ImportField[] = [
  { key: "full_name", label: "Name", required: true, aliases: ["name", "studentname", "fullname", "student"] },
  { key: "level", label: "Grade / Level", aliases: ["grade", "level", "class", "year"] },
  { key: "school", label: "School", aliases: ["school", "campus"] },
  { key: "courses", label: "Courses", aliases: ["courses", "course", "subjects", "subject"] },
  { key: "external_ref", label: "Student ref (optional)", aliases: ["ref", "id", "studentid", "code", "externalref"] },
];

const teacherFields: ImportField[] = [
  { key: "full_name", label: "Name", required: true, aliases: ["fullname", "name", "teacher", "teachername", "employee"] },
  { key: "code", label: "Code (optional)", aliases: ["code", "id", "employeeid"] },
  { key: "position", label: "Position (optional)", aliases: ["position", "role", "title"] },
  { key: "phone", label: "WhatsApp number (optional)", aliases: ["phone", "whatsapp", "mobile", "contact", "hp", "phonenumber"] },
];

export function RosterImport() {
  const [tab, setTab] = useState<Tab>("students");

  return (
    <div>
      <div className="mb-5 inline-flex rounded-lg border border-ink-200 bg-white p-1">
        <button
          onClick={() => setTab("students")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            tab === "students"
              ? "bg-accent-600 text-white"
              : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          Students
        </button>
        <button
          onClick={() => setTab("teachers")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            tab === "teachers"
              ? "bg-accent-600 text-white"
              : "text-ink-600 hover:bg-ink-100"
          }`}
        >
          Teachers
        </button>
      </div>

      {tab === "students" ? (
        <ImportWizard
          key="students"
          fields={studentFields}
          helpText="One row per student. Re-importing is safe — students that already exist (matched on ref, else name + grade + school) are skipped."
          onImport={(records) =>
            importStudents(
              records.map(
                (r): StudentImportRecord => ({
                  full_name: r.full_name,
                  level: r.level,
                  school: r.school,
                  courses: r.courses,
                  external_ref: r.external_ref,
                }),
              ),
            )
          }
        />
      ) : (
        <ImportWizard
          key="teachers"
          fields={teacherFields}
          helpText="One row per teacher. Re-importing is safe — names that already exist are skipped, though a WhatsApp number in the file still updates them (needed for daily confirmations)."
          onImport={(records) =>
            importTeachers(
              records.map(
                (r): TeacherImportRecord => ({
                  full_name: r.full_name,
                  code: r.code,
                  position: r.position,
                  phone: r.phone,
                }),
              ),
            )
          }
        />
      )}
    </div>
  );
}
