"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { normalizeToE164 } from "@/lib/phone";
import type { Channel, GranolaPath } from "@/lib/types";

export async function updateSettings(input: {
  reminder_whatsapp_number?: string | null;
  default_channel?: Channel;
  granola_path?: GranolaPath;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const payload: Record<string, unknown> = { owner_id: user.id };
  if (input.reminder_whatsapp_number !== undefined) {
    payload.reminder_whatsapp_number = input.reminder_whatsapp_number
      ? normalizeToE164(input.reminder_whatsapp_number)
      : null;
  }
  if (input.default_channel !== undefined)
    payload.default_channel = input.default_channel;
  if (input.granola_path !== undefined) payload.granola_path = input.granola_path;

  const { error } = await supabase
    .from("app_settings")
    .upsert(payload, { onConflict: "owner_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}
