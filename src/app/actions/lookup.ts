"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export interface PickerOption {
  id: string;
  label: string;
}

// Server-side typeahead for students — avoids shipping thousands of rows to the
// client. Returns up to 20 matches by name.
export async function searchStudents(q: string): Promise<PickerOption[]> {
  await requireUser();
  const term = q.trim();
  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select("id, full_name, level, school")
    .order("full_name")
    .limit(20);
  if (term) query = query.ilike("full_name", `%${term}%`);
  const { data } = await query;
  return (data ?? []).map((s) => ({
    id: s.id as string,
    label: [s.full_name, s.level, s.school].filter(Boolean).join(" · "),
  }));
}

export async function searchTeachers(q: string): Promise<PickerOption[]> {
  await requireUser();
  const term = q.trim();
  const supabase = await createClient();
  let query = supabase
    .from("teachers")
    .select("id, full_name, position")
    .order("full_name")
    .limit(20);
  if (term) query = query.ilike("full_name", `%${term}%`);
  const { data } = await query;
  return (data ?? []).map((t) => ({
    id: t.id as string,
    label: [t.full_name, t.position].filter(Boolean).join(" · "),
  }));
}
