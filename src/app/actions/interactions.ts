"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { tidyAndExtract } from "@/lib/anthropic";
import { listRecentGranolaNotes, getGranolaNote } from "@/lib/granola";
import type { Channel, InteractionSource, TidyResult, GranolaPath } from "@/lib/types";

// ---- AI tidy & extract (preview before save) ------------------------------

export async function tidyAndExtractAction(input: {
  channel: Channel;
  studentName?: string | null;
  parentName?: string | null;
  rawNotes: string;
}): Promise<{ ok: boolean; result?: TidyResult; error?: string }> {
  await requireUser();
  if (!input.rawNotes.trim()) {
    return { ok: false, error: "Add some notes before tidying." };
  }
  try {
    const result = await tidyAndExtract({
      channel: input.channel,
      studentName: input.studentName,
      parentName: input.parentName,
      rawNotes: input.rawNotes,
    });
    return { ok: true, result };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tidy failed." };
  }
}

// ---- Save an interaction (manual or imported) -----------------------------

export interface LogInteractionInput {
  student_id?: string | null;
  parent_id?: string | null;
  channel: Channel;
  occurred_at: string; // ISO
  raw_notes?: string | null;
  summary?: string | null;
  source?: InteractionSource;
  granola_note_id?: string | null;
  action_items?: string[];
  follow_up?: {
    due_at: string; // ISO
    note?: string | null;
    remind_in_app: boolean;
    remind_whatsapp: boolean;
  } | null;
}

export async function logInteraction(
  input: LogInteractionInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requireUser();
  const supabase = await createClient();

  if (!input.student_id && !input.parent_id) {
    return { ok: false, error: "Pick a student and/or a parent." };
  }

  const { data: interaction, error } = await supabase
    .from("interactions")
    .insert({
      student_id: input.student_id || null,
      parent_id: input.parent_id || null,
      channel: input.channel,
      occurred_at: input.occurred_at,
      raw_notes: input.raw_notes?.trim() || null,
      summary: input.summary?.trim() || null,
      source: input.source ?? "manual",
      granola_note_id: input.granola_note_id || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  const interactionId = interaction.id as string;

  const items = (input.action_items ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  if (items.length > 0) {
    const { error: aiErr } = await supabase
      .from("action_items")
      .insert(items.map((text) => ({ interaction_id: interactionId, text })));
    if (aiErr) return { ok: false, error: aiErr.message };
  }

  if (input.follow_up) {
    const { error: fuErr } = await supabase.from("follow_ups").insert({
      interaction_id: interactionId,
      student_id: input.student_id || null,
      parent_id: input.parent_id || null,
      due_at: input.follow_up.due_at,
      note: input.follow_up.note?.trim() || null,
      remind_in_app: input.follow_up.remind_in_app,
      remind_whatsapp: input.follow_up.remind_whatsapp,
    });
    if (fuErr) return { ok: false, error: fuErr.message };
  }

  revalidatePaths(input.student_id, input.parent_id);
  return { ok: true, id: interactionId };
}

export async function updateInteraction(
  id: string,
  input: {
    summary?: string | null;
    raw_notes?: string | null;
    channel?: Channel;
    occurred_at?: string;
    student_id?: string | null;
    parent_id?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.summary !== undefined) patch.summary = input.summary?.trim() || null;
  if (input.raw_notes !== undefined)
    patch.raw_notes = input.raw_notes?.trim() || null;
  if (input.channel !== undefined) patch.channel = input.channel;
  if (input.occurred_at !== undefined) patch.occurred_at = input.occurred_at;
  if (input.student_id !== undefined) patch.student_id = input.student_id || null;
  if (input.parent_id !== undefined) patch.parent_id = input.parent_id || null;

  const { error } = await supabase.from("interactions").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePaths(input.student_id, input.parent_id);
  return { ok: true };
}

export async function deleteInteraction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("interactions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---- Granola Path A (direct API) ------------------------------------------

export async function listGranolaNotesAction(): Promise<{
  ok: boolean;
  notes?: { id: string; title: string; date: string | null; hasContent: boolean }[];
  error?: string;
}> {
  await requireUser();
  try {
    const notes = await listRecentGranolaNotes(25);
    return {
      ok: true,
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        date: n.date,
        hasContent: Boolean(n.summary || n.transcript),
      })),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Granola list failed." };
  }
}

// Fetch a Granola note, re-summarise it, and return a preview for review
// before saving (does not save).
export async function previewGranolaNoteAction(noteId: string): Promise<{
  ok: boolean;
  preview?: {
    granola_note_id: string;
    title: string;
    date: string | null;
    raw_notes: string;
    tidy: TidyResult;
  };
  error?: string;
}> {
  await requireUser();
  try {
    const note = await getGranolaNote(noteId);
    const rawNotes = [note.summary, note.transcript].filter(Boolean).join("\n\n");
    if (!rawNotes.trim()) {
      return { ok: false, error: "That Granola note has no summary or transcript yet." };
    }
    const tidy = await tidyAndExtract({ channel: "in_person", rawNotes });
    return {
      ok: true,
      preview: {
        granola_note_id: note.id,
        title: note.title,
        date: note.date,
        raw_notes: rawNotes,
        tidy,
      },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Granola import failed." };
  }
}

export async function readGranolaPath(): Promise<GranolaPath> {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("granola_path")
    .maybeSingle();
  return (data?.granola_path as GranolaPath) ?? "paste";
}

function revalidatePaths(studentId?: string | null, parentId?: string | null) {
  revalidatePath("/dashboard");
  revalidatePath("/students");
  if (studentId) revalidatePath(`/students/${studentId}`);
  if (parentId) revalidatePath(`/parents/${parentId}`);
}
