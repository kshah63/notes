import { createClient } from "./supabase/server";
import type {
  Student,
  Parent,
  Teacher,
  InteractionWithDetails,
  FollowUp,
  AppSettings,
  Channel,
  ConfirmationBatch,
  ConfirmationItem,
  TeacherConfirmation,
} from "./types";

const INTERACTION_SELECT = `
  *,
  student:students(id, full_name, level),
  parent:parents(id, full_name, relationship),
  teacher:teachers(id, full_name),
  action_items(*),
  follow_ups(*)
`;

export interface TimelineFilters {
  channel?: Channel;
  from?: string; // ISO date
  to?: string; // ISO date
}

export async function getStudents(search?: string): Promise<Student[]> {
  const supabase = await createClient();
  let query = supabase.from("students").select("*").order("full_name");
  if (search?.trim()) {
    query = query.ilike("full_name", `%${search.trim()}%`);
  }
  const { data } = await query;
  return (data as Student[]) ?? [];
}

export async function getParents(): Promise<Parent[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("parents").select("*").order("full_name");
  return (data as Parent[]) ?? [];
}

export async function getTeachers(search?: string): Promise<Teacher[]> {
  const supabase = await createClient();
  let query = supabase.from("teachers").select("*").order("full_name");
  if (search?.trim()) query = query.ilike("full_name", `%${search.trim()}%`);
  const { data } = await query;
  return (data as Teacher[]) ?? [];
}

export async function getTeacher(id: string): Promise<Teacher | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teachers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Teacher) ?? null;
}

export async function getTeacherTimeline(
  teacherId: string,
  filters: TimelineFilters = {},
): Promise<InteractionWithDetails[]> {
  const supabase = await createClient();
  let query = supabase
    .from("interactions")
    .select(INTERACTION_SELECT)
    .eq("teacher_id", teacherId)
    .order("occurred_at", { ascending: false });
  query = applyFilters(query, filters);
  const { data } = await query;
  return (data as unknown as InteractionWithDetails[]) ?? [];
}

export interface AttentionStudent {
  id: string;
  full_name: string;
  level: string | null;
  last_contact: string | null;
  days_since: number | null;
}

// Students you've contacted before but have gone quiet on (> `days` ago).
export async function getStudentsNeedingAttention(
  days = 30,
): Promise<AttentionStudent[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc("students_needing_attention", {
    p_owner: user.id,
    p_days: days,
    p_limit: 100,
  });
  if (error || !data) return [];
  return data as AttentionStudent[];
}

export async function countStudents(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true });
  return count ?? 0;
}

export interface OpenActionItem {
  id: string;
  text: string;
  done: boolean;
  student: { id: string; full_name: string } | null;
  occurred_at: string | null;
}

// Every unchecked action item across all conversations (§ consolidated to-dos).
export async function getOpenActionItems(): Promise<OpenActionItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("action_items")
    .select(
      "id, text, done, created_at, interaction:interactions!inner(occurred_at, student:students(id, full_name))",
    )
    .eq("done", false)
    .order("created_at", { ascending: false })
    .limit(300);

  return ((data ?? []) as unknown as {
    id: string;
    text: string;
    done: boolean;
    interaction: {
      occurred_at: string | null;
      student: { id: string; full_name: string } | null;
    } | null;
  }[]).map((r) => ({
    id: r.id,
    text: r.text,
    done: r.done,
    student: r.interaction?.student ?? null,
    occurred_at: r.interaction?.occurred_at ?? null,
  }));
}

export async function getRecentInteractions(
  limit = 8,
): Promise<InteractionWithDetails[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("interactions")
    .select(INTERACTION_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as unknown as InteractionWithDetails[]) ?? [];
}

export async function getStudent(id: string): Promise<Student | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Student) ?? null;
}

export async function getParent(id: string): Promise<Parent | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("parents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Parent) ?? null;
}

export async function getStudentParents(studentId: string): Promise<Parent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_parents")
    .select("parent:parents(*)")
    .eq("student_id", studentId);
  return ((data ?? []) as unknown as { parent: Parent }[])
    .map((row) => row.parent)
    .filter(Boolean);
}

export async function getParentStudents(parentId: string): Promise<Student[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_parents")
    .select("student:students(*)")
    .eq("parent_id", parentId);
  return ((data ?? []) as unknown as { student: Student }[])
    .map((row) => row.student)
    .filter(Boolean);
}

export async function getStudentTimeline(
  studentId: string,
  filters: TimelineFilters = {},
): Promise<InteractionWithDetails[]> {
  const supabase = await createClient();
  let query = supabase
    .from("interactions")
    .select(INTERACTION_SELECT)
    .eq("student_id", studentId)
    .order("occurred_at", { ascending: false });

  query = applyFilters(query, filters);
  const { data } = await query;
  return (data as unknown as InteractionWithDetails[]) ?? [];
}

// Parent timeline spans ALL their children plus interactions logged directly
// against the parent.
export async function getParentTimeline(
  parentId: string,
  filters: TimelineFilters = {},
): Promise<InteractionWithDetails[]> {
  const supabase = await createClient();
  const children = await getParentStudents(parentId);
  const childIds = children.map((c) => c.id);

  let query = supabase
    .from("interactions")
    .select(INTERACTION_SELECT)
    .order("occurred_at", { ascending: false });

  if (childIds.length > 0) {
    query = query.or(
      `parent_id.eq.${parentId},student_id.in.(${childIds.join(",")})`,
    );
  } else {
    query = query.eq("parent_id", parentId);
  }

  query = applyFilters(query, filters);
  const { data } = await query;
  return (data as unknown as InteractionWithDetails[]) ?? [];
}

export interface DueFollowUp extends FollowUp {
  student: Pick<Student, "id" | "full_name"> | null;
  parent: Pick<Parent, "id" | "full_name"> | null;
}

export async function getPendingFollowUps(): Promise<DueFollowUp[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("follow_ups")
    .select(
      `*, student:students(id, full_name), parent:parents(id, full_name)`,
    )
    .eq("status", "pending")
    .order("due_at", { ascending: true });
  return (data as unknown as DueFollowUp[]) ?? [];
}

export async function getStudentParentLinks(): Promise<
  { student_id: string; parent_id: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_parents")
    .select("student_id, parent_id");
  return (data as { student_id: string; parent_id: string }[]) ?? [];
}

export async function getSettings(): Promise<AppSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .maybeSingle();
  return (data as AppSettings) ?? null;
}

// Recent daily-confirmation batches with per-teacher progress, for the
// /confirmations screen.
export interface ConfirmationBatchView extends ConfirmationBatch {
  confirmations: (TeacherConfirmation & {
    teacher: Pick<Teacher, "id" | "full_name" | "phone_e164"> | null;
  })[];
  items: (ConfirmationItem & {
    teacher: Pick<Teacher, "id" | "full_name" | "phone_e164"> | null;
  })[];
}

export async function getConfirmationBatches(
  limit = 8,
): Promise<ConfirmationBatchView[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("confirmation_batches")
    .select(
      `*,
       confirmations:teacher_confirmations(*, teacher:teachers(id, full_name, phone_e164)),
       items:confirmation_items(*, teacher:teachers(id, full_name, phone_e164))`,
    )
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as unknown as ConfirmationBatchView[]) ?? [];
}

// Global search across summaries, raw notes, and student/parent names (§8).
export interface SearchHit {
  interactions: InteractionWithDetails[];
  students: Student[];
  parents: Parent[];
}

export async function search(term: string): Promise<SearchHit> {
  const q = term.trim();
  if (!q) return { interactions: [], students: [], parents: [] };
  const supabase = await createClient();

  // Strip characters that would break PostgREST's `or()` filter grammar.
  const safe = q.replace(/[,()*]/g, " ").trim() || q;

  const [interactionsRes, studentsRes, parentsRes] = await Promise.all([
    supabase
      .from("interactions")
      .select(INTERACTION_SELECT)
      .or(`summary.ilike.%${safe}%,raw_notes.ilike.%${safe}%`)
      .order("occurred_at", { ascending: false })
      .limit(25),
    supabase.from("students").select("*").ilike("full_name", `%${q}%`).limit(15),
    supabase.from("parents").select("*").ilike("full_name", `%${q}%`).limit(15),
  ]);

  return {
    interactions: (interactionsRes.data as unknown as InteractionWithDetails[]) ?? [],
    students: (studentsRes.data as Student[]) ?? [],
    parents: (parentsRes.data as Parent[]) ?? [],
  };
}

type AnyQuery = {
  eq: (col: string, val: unknown) => AnyQuery;
  gte: (col: string, val: unknown) => AnyQuery;
  lte: (col: string, val: unknown) => AnyQuery;
};

function applyFilters<T extends AnyQuery>(query: T, filters: TimelineFilters): T {
  let q = query;
  if (filters.channel) q = q.eq("channel", filters.channel) as T;
  if (filters.from) q = q.gte("occurred_at", filters.from) as T;
  if (filters.to) q = q.lte("occurred_at", filters.to) as T;
  return q;
}
