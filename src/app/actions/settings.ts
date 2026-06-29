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
  nudge_enabled?: boolean;
  nudge_start_hour?: number;
  nudge_end_hour?: number;
}): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const payload: Record<string, unknown> = { owner_id: user.id };
  if (input.reminder_whatsapp_number !== undefined) {
    // Accept one or more numbers (comma/space separated). Normalise each.
    const raw = input.reminder_whatsapp_number ?? "";
    const numbers = raw
      .split(/[,;\s]+/)
      .map((n) => normalizeToE164(n))
      .filter(Boolean);
    payload.reminder_whatsapp_number = numbers.length ? numbers.join(",") : null;
  }
  if (input.default_channel !== undefined)
    payload.default_channel = input.default_channel;
  if (input.granola_path !== undefined) payload.granola_path = input.granola_path;
  if (input.nudge_enabled !== undefined)
    payload.nudge_enabled = input.nudge_enabled;
  if (input.nudge_start_hour !== undefined)
    payload.nudge_start_hour = clampHour(input.nudge_start_hour);
  if (input.nudge_end_hour !== undefined)
    payload.nudge_end_hour = clampHour(input.nudge_end_hour);

  const { error } = await supabase
    .from("app_settings")
    .upsert(payload, { onConflict: "owner_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/settings");
  return { ok: true };
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 9;
  return Math.max(0, Math.min(23, Math.round(h)));
}
