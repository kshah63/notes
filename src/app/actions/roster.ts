"use server";

import Papa from "papaparse";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { normalizeToE164 } from "@/lib/phone";
import type { PreferredChannel, Student, Parent } from "@/lib/types";

export type RosterField =
  | "student_name"
  | "student_level"
  | "student_ref"
  | "parent_name"
  | "parent_relationship"
  | "parent_phone"
  | "parent_email";

export interface RosterMapping {
  student_name: string;
  student_level?: string;
  student_ref?: string;
  parent_name?: string;
  parent_relationship?: string;
  parent_phone?: string;
  parent_email?: string;
}

export interface ImportSummary {
  studentsCreated: number;
  studentsMatched: number;
  parentsCreated: number;
  parentsMatched: number;
  linksCreated: number;
  rowsSkipped: number;
}

export interface ImportResult {
  ok: boolean;
  summary?: ImportSummary;
  error?: string;
}

function cell(
  row: Record<string, string>,
  mapping: RosterMapping,
  field: RosterField,
): string {
  const col = mapping[field];
  if (!col) return "";
  return (row[col] ?? "").trim();
}

// Import students, parents, and their links from one CSV (§4). One row per
// parent–student pair. Idempotent: students match on external_ref (else
// name+level), parents match on phone_e164 (else name); re-running won't
// duplicate.
export async function importRosterCsv(
  csvText: string,
  mapping: RosterMapping,
): Promise<ImportResult> {
  await requireUser();
  const supabase = await createClient();

  if (!mapping.student_name) {
    return { ok: false, error: "A column must be mapped to student name." };
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    return { ok: false, error: `CSV parse error: ${first.message} (row ${first.row})` };
  }

  const summary: ImportSummary = {
    studentsCreated: 0,
    studentsMatched: 0,
    parentsCreated: 0,
    parentsMatched: 0,
    linksCreated: 0,
    rowsSkipped: 0,
  };

  // Within-import caches to dedupe repeated students/parents across rows.
  const studentCache = new Map<string, Student>();
  const parentCache = new Map<string, Parent>();
  const linkSeen = new Set<string>();

  for (const row of parsed.data) {
    const studentName = cell(row, mapping, "student_name");
    if (!studentName) {
      summary.rowsSkipped++;
      continue;
    }
    const studentLevel = cell(row, mapping, "student_level") || null;
    const studentRef = cell(row, mapping, "student_ref") || null;

    const parentName = cell(row, mapping, "parent_name");
    const parentRelationship = cell(row, mapping, "parent_relationship") || null;
    const parentPhoneRaw = cell(row, mapping, "parent_phone");
    const parentEmail = cell(row, mapping, "parent_email") || null;
    const parentPhone = normalizeToE164(parentPhoneRaw);

    // --- Resolve student ---
    const studentKey = studentRef
      ? `ref:${studentRef.toLowerCase()}`
      : `nl:${studentName.toLowerCase()}|${(studentLevel ?? "").toLowerCase()}`;

    let student = studentCache.get(studentKey);
    if (!student) {
      let query = supabase.from("students").select("*").limit(1);
      if (studentRef) {
        query = query.eq("external_ref", studentRef);
      } else {
        query = query.eq("full_name", studentName);
        // `.is` matches NULL; `.eq` matches a concrete level.
        query =
          studentLevel === null
            ? query.is("level", null)
            : query.eq("level", studentLevel);
      }
      const { data: existing, error } = await query.maybeSingle();
      if (error) return { ok: false, error: `Student lookup failed: ${error.message}` };

      if (existing) {
        student = existing as Student;
        summary.studentsMatched++;
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("students")
          .insert({
            full_name: studentName,
            level: studentLevel,
            external_ref: studentRef,
          })
          .select("*")
          .single();
        if (insErr) return { ok: false, error: `Student insert failed: ${insErr.message}` };
        student = inserted as Student;
        summary.studentsCreated++;
      }
      studentCache.set(studentKey, student);
    }

    // --- Resolve parent (optional on a row) ---
    let parent: Parent | undefined;
    if (parentName || parentPhone) {
      const parentKey = parentPhone
        ? `ph:${parentPhone}`
        : `nm:${parentName.toLowerCase()}`;
      parent = parentCache.get(parentKey);
      if (!parent) {
        let pQuery = supabase.from("parents").select("*").limit(1);
        pQuery = parentPhone
          ? pQuery.eq("phone_e164", parentPhone)
          : pQuery.eq("full_name", parentName);
        const { data: existing, error } = await pQuery.maybeSingle();
        if (error) return { ok: false, error: `Parent lookup failed: ${error.message}` };

        if (existing) {
          parent = existing as Parent;
          summary.parentsMatched++;
        } else {
          const preferred: PreferredChannel = parentPhone ? "whatsapp" : "call";
          const { data: inserted, error: insErr } = await supabase
            .from("parents")
            .insert({
              full_name: parentName || "(unnamed)",
              relationship: parentRelationship,
              phone_e164: parentPhone,
              email: parentEmail,
              preferred_channel: preferred,
            })
            .select("*")
            .single();
          if (insErr) return { ok: false, error: `Parent insert failed: ${insErr.message}` };
          parent = inserted as Parent;
          summary.parentsCreated++;
        }
        parentCache.set(parentKey, parent);
      }
    }

    // --- Link (idempotent on composite key) ---
    if (parent) {
      const linkKey = `${student.id}:${parent.id}`;
      if (!linkSeen.has(linkKey)) {
        linkSeen.add(linkKey);
        const { error: linkErr } = await supabase
          .from("student_parents")
          .upsert(
            { student_id: student.id, parent_id: parent.id },
            { onConflict: "student_id,parent_id", ignoreDuplicates: true },
          );
        if (linkErr) return { ok: false, error: `Link failed: ${linkErr.message}` };
        summary.linksCreated++;
      }
    }
  }

  revalidatePath("/students");
  revalidatePath("/dashboard");
  return { ok: true, summary };
}

// --- Manual roster edits (used by student/parent pages) -------------------

export async function upsertStudent(input: {
  id?: string;
  full_name: string;
  level?: string | null;
  external_ref?: string | null;
  notes?: string | null;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requireUser();
  const supabase = await createClient();

  if (!input.full_name.trim()) {
    return { ok: false, error: "Student name is required." };
  }

  const payload = {
    full_name: input.full_name.trim(),
    level: input.level?.trim() || null,
    external_ref: input.external_ref?.trim() || null,
    notes: input.notes?.trim() || null,
  };

  if (input.id) {
    const { error } = await supabase
      .from("students")
      .update(payload)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/students/${input.id}`);
    revalidatePath("/students");
    return { ok: true, id: input.id };
  }

  const { data, error } = await supabase
    .from("students")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/students");
  return { ok: true, id: data.id };
}

export async function upsertParent(input: {
  id?: string;
  full_name: string;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  preferred_channel?: PreferredChannel;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requireUser();
  const supabase = await createClient();

  if (!input.full_name.trim()) {
    return { ok: false, error: "Parent name is required." };
  }

  const payload = {
    full_name: input.full_name.trim(),
    relationship: input.relationship?.trim() || null,
    phone_e164: normalizeToE164(input.phone),
    email: input.email?.trim() || null,
    preferred_channel: input.preferred_channel ?? "whatsapp",
  };

  if (input.id) {
    const { error } = await supabase
      .from("parents")
      .update(payload)
      .eq("id", input.id);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/parents/${input.id}`);
    return { ok: true, id: input.id };
  }

  const { data, error } = await supabase
    .from("parents")
    .insert(payload)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function linkStudentParent(
  studentId: string,
  parentId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_parents")
    .upsert(
      { student_id: studentId, parent_id: parentId },
      { onConflict: "student_id,parent_id", ignoreDuplicates: true },
    );
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/parents/${parentId}`);
  return { ok: true };
}

export async function unlinkStudentParent(
  studentId: string,
  parentId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_parents")
    .delete()
    .eq("student_id", studentId)
    .eq("parent_id", parentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/parents/${parentId}`);
  return { ok: true };
}
