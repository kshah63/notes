"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { normalizeToE164 } from "@/lib/phone";
import { isTwilioConfigured } from "@/lib/env";
import {
  dispatchBatch,
  formatSgt,
  nextDispatchAfter,
  sgtDateISO,
} from "@/lib/confirmations";
import type { ImportResult } from "./roster";

const CHUNK = 500;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export interface TeachingLogRecord {
  teacher_name: string;
  student_name: string;
}

// Upload handler for the daily teaching log. Creates one scheduled batch
// (dispatching at the next 6 pm SGT) with a (teacher, student) item per row.
// Teachers not yet in the directory are created; students are linked to the
// roster when the name matches. A new upload supersedes any batch still
// waiting to go out, so teachers never get two lists for the same day.
export async function createConfirmationBatch(
  records: TeachingLogRecord[],
  sourceFilename?: string,
): Promise<ImportResult> {
  await requireUser();
  const supabase = await createClient();

  const summary = { created: 0, skippedExisting: 0, skippedBlank: 0, total: records.length };
  const warnings: string[] = [];

  try {
    // Clean + dedupe (teacher, student) pairs within the file.
    const pairs: { teacher: string; student: string }[] = [];
    const seenPairs = new Set<string>();
    for (const rec of records) {
      const teacher = (rec.teacher_name ?? "").trim();
      const student = (rec.student_name ?? "").trim();
      if (!teacher || !student) {
        summary.skippedBlank++;
        continue;
      }
      const key = `${norm(teacher)}|${norm(student)}`;
      if (seenPairs.has(key)) {
        summary.skippedExisting++;
        continue;
      }
      seenPairs.add(key);
      pairs.push({ teacher, student });
    }
    if (pairs.length === 0) {
      return { ok: false, error: "No usable rows — map the teacher and student columns." };
    }

    // Resolve teachers by name; create the ones we don't know yet.
    const { data: teacherRows, error: tErr } = await supabase
      .from("teachers")
      .select("id, full_name, phone_e164");
    if (tErr) throw new Error(tErr.message);
    const teacherByName = new Map(
      (teacherRows ?? []).map((t) => [norm(t.full_name as string), t as { id: string; full_name: string; phone_e164: string | null }]),
    );

    const newTeacherNames = [...new Set(pairs.map((p) => norm(p.teacher)))]
      .filter((key) => !teacherByName.has(key))
      .map((key) => pairs.find((p) => norm(p.teacher) === key)!.teacher);
    if (newTeacherNames.length > 0) {
      const { data: created, error: cErr } = await supabase
        .from("teachers")
        .insert(newTeacherNames.map((full_name) => ({ full_name })))
        .select("id, full_name, phone_e164");
      if (cErr) throw new Error(cErr.message);
      for (const t of created ?? []) {
        teacherByName.set(norm(t.full_name as string), t as { id: string; full_name: string; phone_e164: string | null });
      }
      warnings.push(
        `Created ${newTeacherNames.length} new teacher${newTeacherNames.length === 1 ? "" : "s"}: ${newTeacherNames.join(", ")}.`,
      );
    }

    const phoneless = [
      ...new Set(
        pairs
          .map((p) => teacherByName.get(norm(p.teacher))!)
          .filter((t) => !t.phone_e164)
          .map((t) => t.full_name),
      ),
    ];
    if (phoneless.length > 0) {
      warnings.push(
        `No WhatsApp number for: ${phoneless.join(", ")}. Add numbers on the Teachers page before 6 pm or they won't get the message.`,
      );
    }

    // Link students to the roster where the name matches.
    const { data: studentRows, error: sErr } = await supabase
      .from("students")
      .select("id, full_name");
    if (sErr) throw new Error(sErr.message);
    const studentByName = new Map(
      (studentRows ?? []).map((s) => [norm(s.full_name as string), s.id as string]),
    );

    // A new upload replaces any batch still waiting to dispatch.
    const { data: superseded } = await supabase
      .from("confirmation_batches")
      .update({ status: "cancelled" })
      .eq("status", "scheduled")
      .select("id");
    if ((superseded ?? []).length > 0) {
      warnings.push(
        `Replaced ${superseded!.length} earlier upload${superseded!.length === 1 ? "" : "s"} that hadn't been sent yet.`,
      );
    }

    const dispatchAfter = nextDispatchAfter();
    const { data: batch, error: bErr } = await supabase
      .from("confirmation_batches")
      .insert({
        taught_on: sgtDateISO(),
        source_filename: sourceFilename?.trim() || null,
        dispatch_after: dispatchAfter.toISOString(),
      })
      .select("id")
      .single();
    if (bErr) throw new Error(bErr.message);

    const items = pairs.map((p) => ({
      batch_id: batch.id as string,
      teacher_id: teacherByName.get(norm(p.teacher))!.id,
      student_id: studentByName.get(norm(p.student)) ?? null,
      student_name: p.student,
    }));
    for (let i = 0; i < items.length; i += CHUNK) {
      const { error } = await supabase
        .from("confirmation_items")
        .insert(items.slice(i, i + CHUNK));
      if (error) throw new Error(error.message);
    }
    summary.created = items.length;

    const teacherCount = new Set(items.map((i) => i.teacher_id)).size;
    revalidatePath("/confirmations");
    if (newTeacherNames.length > 0) revalidatePath("/teachers");
    return {
      ok: true,
      summary,
      warnings,
      message: `${teacherCount} teacher${teacherCount === 1 ? "" : "s"} will be asked to confirm at ${formatSgt(dispatchAfter)} (SGT).`,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed." };
  }
}

// "Send now" — dispatch a batch immediately instead of waiting for 6 pm.
// Also retries teachers marked unreachable on an already-dispatched batch.
export async function dispatchBatchNow(
  batchId: string,
): Promise<{ ok: boolean; error?: string; sent?: number; unreachable?: number }> {
  await requireUser();
  const supabase = await createClient();

  if (!isTwilioConfigured()) {
    return { ok: false, error: "Twilio isn't configured (TWILIO_* env vars)." };
  }

  const { data: batch, error } = await supabase
    .from("confirmation_batches")
    .select("id, owner_id, taught_on, status")
    .eq("id", batchId)
    .maybeSingle();
  if (error || !batch) return { ok: false, error: error?.message ?? "Batch not found." };
  if (batch.status === "cancelled") {
    return { ok: false, error: "This batch was replaced by a newer upload." };
  }

  try {
    const result = await dispatchBatch(supabase, batch);
    revalidatePath("/confirmations");
    const err = result.errors.length > 0 ? result.errors.join(" · ") : undefined;
    return { ok: true, sent: result.sent, unreachable: result.unreachable, error: err };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Dispatch failed." };
  }
}

// Cancel a batch that hasn't gone out yet.
export async function cancelBatch(batchId: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("confirmation_batches")
    .update({ status: "cancelled" })
    .eq("id", batchId)
    .eq("status", "scheduled");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/confirmations");
  return { ok: true };
}

// Inline phone editing on the Teachers screens.
export async function updateTeacherPhone(
  teacherId: string,
  phone: string,
): Promise<{ ok: boolean; error?: string; phone?: string | null }> {
  await requireUser();
  const supabase = await createClient();

  const normalized = phone.trim() ? normalizeToE164(phone) : null;
  if (phone.trim() && !normalized) {
    return { ok: false, error: "That doesn't look like a valid phone number." };
  }

  const { error } = await supabase
    .from("teachers")
    .update({ phone_e164: normalized })
    .eq("id", teacherId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/teachers");
  revalidatePath(`/teachers/${teacherId}`);
  revalidatePath("/confirmations");
  return { ok: true, phone: normalized };
}
