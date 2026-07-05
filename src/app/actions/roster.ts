"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { normalizeToE164 } from "@/lib/phone";
import type { PreferredChannel } from "@/lib/types";

export interface ImportSummary {
  created: number;
  skippedExisting: number;
  skippedBlank: number;
  total: number;
  updated?: number;
}

export interface ImportResult {
  ok: boolean;
  summary?: ImportSummary;
  error?: string;
  // Non-fatal notes shown after import (e.g. "2 teachers have no phone").
  warnings?: string[];
  // One-line status, e.g. "Scheduled for Sat 5 Jul, 6:00 pm".
  message?: string;
}

const CHUNK = 500;

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

// Page through every row of a table (PostgREST caps each request ~1000 rows),
// so re-imports dedupe against the full existing set.
async function fetchAllKeys(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "students" | "teachers",
  columns: string,
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  let from = 0;
  const all: Record<string, unknown>[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data as unknown as Record<string, unknown>[]) ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// ---- Students bulk import (§4) --------------------------------------------

export interface StudentImportRecord {
  full_name: string;
  level?: string | null;
  school?: string | null;
  courses?: string | null;
  external_ref?: string | null;
}

export async function importStudents(
  records: StudentImportRecord[],
): Promise<ImportResult> {
  await requireUser();
  const supabase = await createClient();

  const summary: ImportSummary = {
    created: 0,
    skippedExisting: 0,
    skippedBlank: 0,
    total: records.length,
  };

  try {
    const existing = await fetchAllKeys(
      supabase,
      "students",
      "external_ref, full_name, level, school",
    );
    const seen = new Set<string>();
    for (const r of existing) {
      seen.add(studentKey(r));
    }

    const toInsert: {
      full_name: string;
      level: string | null;
      school: string | null;
      courses: string | null;
      external_ref: string | null;
    }[] = [];

    for (const rec of records) {
      const full_name = (rec.full_name ?? "").trim();
      if (!full_name) {
        summary.skippedBlank++;
        continue;
      }
      const row = {
        full_name,
        level: rec.level?.trim() || null,
        school: rec.school?.trim() || null,
        courses: rec.courses?.trim() || null,
        external_ref: rec.external_ref?.trim() || null,
      };
      const key = studentKey(row);
      if (seen.has(key)) {
        summary.skippedExisting++;
        continue;
      }
      seen.add(key);
      toInsert.push(row);
    }

    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await supabase.from("students").insert(chunk);
      if (error) return { ok: false, error: error.message };
      summary.created += chunk.length;
    }

    revalidatePath("/students");
    revalidatePath("/dashboard");
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed." };
  }
}

function studentKey(r: Record<string, unknown>): string {
  const ref = norm(r.external_ref as string | null);
  if (ref) return `ref:${ref}`;
  return `nl:${norm(r.full_name as string)}|${norm(r.level as string | null)}|${norm(
    r.school as string | null,
  )}`;
}

// ---- Teachers bulk import -------------------------------------------------

export interface TeacherImportRecord {
  full_name: string;
  code?: string | null;
  position?: string | null;
  phone?: string | null;
}

export async function importTeachers(
  records: TeacherImportRecord[],
): Promise<ImportResult> {
  await requireUser();
  const supabase = await createClient();

  const summary: ImportSummary = {
    created: 0,
    skippedExisting: 0,
    skippedBlank: 0,
    total: records.length,
    updated: 0,
  };

  try {
    const existing = await fetchAllKeys(
      supabase,
      "teachers",
      "id, full_name, phone_e164",
    );
    const byName = new Map<string, { id: string; phone_e164: string | null }>();
    for (const r of existing) {
      byName.set(norm(r.full_name as string), {
        id: r.id as string,
        phone_e164: (r.phone_e164 as string | null) ?? null,
      });
    }

    const toInsert: {
      full_name: string;
      code: string | null;
      position: string | null;
      phone_e164: string | null;
    }[] = [];

    for (const rec of records) {
      const full_name = (rec.full_name ?? "").trim();
      if (!full_name) {
        summary.skippedBlank++;
        continue;
      }
      const key = norm(full_name);
      const phone = normalizeToE164(rec.phone);
      const prior = byName.get(key);
      if (prior) {
        // Existing teacher: a re-import can still fill in / correct the phone,
        // which the daily WhatsApp confirmations need.
        if (phone && phone !== prior.phone_e164) {
          const { error } = await supabase
            .from("teachers")
            .update({ phone_e164: phone })
            .eq("id", prior.id);
          if (error) return { ok: false, error: error.message };
          summary.updated = (summary.updated ?? 0) + 1;
        } else {
          summary.skippedExisting++;
        }
        continue;
      }
      byName.set(key, { id: "pending", phone_e164: phone });
      toInsert.push({
        full_name,
        code: rec.code?.trim() || null,
        position: rec.position?.trim() || null,
        phone_e164: phone,
      });
    }

    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await supabase.from("teachers").insert(chunk);
      if (error) return { ok: false, error: error.message };
      summary.created += chunk.length;
    }

    revalidatePath("/teachers");
    return { ok: true, summary };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Import failed." };
  }
}

// ---- Manual roster edits --------------------------------------------------

export async function upsertStudent(input: {
  id?: string;
  full_name: string;
  level?: string | null;
  school?: string | null;
  courses?: string | null;
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
    school: input.school?.trim() || null,
    courses: input.courses?.trim() || null,
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
