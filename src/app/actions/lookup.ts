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
  const user = await requireUser();
  const term = q.trim();
  const supabase = await createClient();

  const toOption = (s: {
    id: string;
    full_name: string;
    level: string | null;
    school: string | null;
  }) => ({
    id: s.id,
    label: [s.full_name, s.level, s.school].filter(Boolean).join(" · "),
  });

  if (!term) {
    const { data } = await supabase
      .from("students")
      .select("id, full_name, level, school")
      .order("full_name")
      .limit(20);
    return ((data ?? []) as never[]).map(toOption);
  }

  // Fuzzy, typo-tolerant ranking via pg_trgm.
  const { data, error } = await supabase.rpc("match_students", {
    p_owner: user.id,
    p_query: term,
    p_limit: 20,
  });
  if (!error && data) {
    return (data as never[]).map(toOption);
  }

  // Fallback (e.g. migration 0005 not applied yet): plain substring.
  const { data: fallback } = await supabase
    .from("students")
    .select("id, full_name, level, school")
    .ilike("full_name", `%${term}%`)
    .order("full_name")
    .limit(20);
  return ((fallback ?? []) as never[]).map(toOption);
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
