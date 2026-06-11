"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export async function toggleActionItem(
  id: string,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("action_items")
    .update({ done })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/students", "layout");
  return { ok: true };
}

export async function addActionItem(
  interactionId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  if (!text.trim()) return { ok: false, error: "Action item text is required." };
  const { error } = await supabase
    .from("action_items")
    .insert({ interaction_id: interactionId, text: text.trim() });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/students", "layout");
  return { ok: true };
}
