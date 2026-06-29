"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export async function createFollowUp(input: {
  interaction_id?: string | null;
  student_id?: string | null;
  parent_id?: string | null;
  due_at: string; // ISO
  note?: string | null;
  remind_in_app?: boolean;
  remind_whatsapp?: boolean;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requireUser();
  const supabase = await createClient();

  if (!input.due_at) return { ok: false, error: "A due date is required." };

  const { data, error } = await supabase
    .from("follow_ups")
    .insert({
      interaction_id: input.interaction_id || null,
      student_id: input.student_id || null,
      parent_id: input.parent_id || null,
      due_at: input.due_at,
      note: input.note?.trim() || null,
      remind_in_app: input.remind_in_app ?? true,
      remind_whatsapp: input.remind_whatsapp ?? false,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidateAll(input.student_id, input.parent_id);
  return { ok: true, id: data.id };
}

export async function snoozeFollowUp(
  id: string,
  days: number,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data: fu } = await supabase
    .from("follow_ups")
    .select("due_at, student_id, parent_id")
    .eq("id", id)
    .single();
  const base = fu ? Math.max(Date.now(), new Date(fu.due_at).getTime()) : Date.now();
  const next = new Date(base + days * 86400000).toISOString();
  const { error } = await supabase
    .from("follow_ups")
    .update({ due_at: next, reminded_at: null })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateAll(fu?.student_id ?? null, fu?.parent_id ?? null);
  return { ok: true };
}

export async function completeFollowUp(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  return setFollowUpStatus(id, "done");
}

export async function cancelFollowUp(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  return setFollowUpStatus(id, "cancelled");
}

export async function reopenFollowUp(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  return setFollowUpStatus(id, "pending");
}

async function setFollowUpStatus(
  id: string,
  status: "pending" | "done" | "cancelled",
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .update({ status })
    .eq("id", id)
    .select("student_id, parent_id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidateAll(data?.student_id, data?.parent_id);
  return { ok: true };
}

function revalidateAll(studentId?: string | null, parentId?: string | null) {
  revalidatePath("/dashboard");
  if (studentId) revalidatePath(`/students/${studentId}`);
  if (parentId) revalidatePath(`/parents/${parentId}`);
}
