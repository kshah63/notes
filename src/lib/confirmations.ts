import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppText, sendWhatsAppContent } from "./whatsapp";
import type { ConfirmationItem, TeacherConfirmation } from "./types";

// Daily teaching confirmations — shared between the upload action, the 6 pm
// dispatch cron, the 2-hour nudge loop, and the inbound reply handler.

// Singapore is UTC+8 year-round (no DST), so schedule math is plain offset
// arithmetic; Intl is used only for display.
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
export const DISPATCH_HOUR_SGT = 18; // 6 pm
export const NUDGE_INTERVAL_MS = 2 * 60 * 60 * 1000; // nudge after 2 h silence
export const MAX_NUDGES = 3;
// Don't nudge in the middle of the night — wait for the window to reopen.
export const NUDGE_WINDOW_SGT = { start: 8, end: 22 };
// How long an outstanding confirmation keeps claiming inbound messages from
// the teacher's number before they fall through to normal routing.
export const REPLY_WINDOW_MS = 48 * 60 * 60 * 1000;

// The next 6 pm SGT strictly after `now` (uploads after 6 pm go out tomorrow).
export function nextDispatchAfter(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + SGT_OFFSET_MS);
  const dispatchUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    DISPATCH_HOUR_SGT - 8, // 18:00 SGT == 10:00 UTC
  );
  return shifted.getUTCHours() < DISPATCH_HOUR_SGT
    ? new Date(dispatchUtc)
    : new Date(dispatchUtc + 24 * 60 * 60 * 1000);
}

// The SGT calendar date ("YYYY-MM-DD") of an instant.
export function sgtDateISO(now: Date = new Date()): string {
  return new Date(now.getTime() + SGT_OFFSET_MS).toISOString().slice(0, 10);
}

export function sgtHour(now: Date = new Date()): number {
  return new Date(now.getTime() + SGT_OFFSET_MS).getUTCHours();
}

export function inNudgeWindow(now: Date = new Date()): boolean {
  const h = sgtHour(now);
  return h >= NUDGE_WINDOW_SGT.start && h < NUDGE_WINDOW_SGT.end;
}

// "Sat 5 Jul" for a "YYYY-MM-DD" date. Anchored to UTC noon so the calendar
// day can't shift across time zones.
export function formatTaughtOn(dateISO: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${dateISO}T12:00:00Z`));
}

// "Sat 5 Jul, 6:00 pm" (SGT) for a timestamp.
export function formatSgt(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  }).format(typeof iso === "string" ? new Date(iso) : iso);
}

// ---- Message copy -----------------------------------------------------------

export function numberedList(students: string[]): string {
  return students.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

export function buildAskMessage(
  teacherName: string,
  taughtOn: string,
  students: string[],
): string {
  return (
    `Hi ${firstName(teacherName)} — please confirm your classes for ${formatTaughtOn(taughtOn)}.\n\n` +
    `Our records show you taught:\n${numberedList(students)}\n\n` +
    `Reply "all correct" if the list is right, or tell me what's wrong — ` +
    `e.g. "missing: Caleb Lim" or "I didn't teach Bella Lim".`
  );
}

export function buildNudgeMessage(
  teacherName: string,
  taughtOn: string,
  students: string[],
): string {
  return (
    `🔔 Reminder ${firstName(teacherName)} — still waiting on your confirmation for ${formatTaughtOn(taughtOn)}:\n` +
    `${numberedList(students)}\n\n` +
    `Reply "all correct", or tell me who's missing or shouldn't be there.`
  );
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

// Send the ask. On a live sender outside a 24 h window this must be an
// approved template — set TWILIO_CONFIRMATION_TEMPLATE_SID with variables
// {{1}} teacher, {{2}} date, {{3}} numbered student list. On the sandbox the
// free-form body works.
async function sendAsk(
  to: string,
  teacherName: string,
  taughtOn: string,
  students: string[],
): Promise<void> {
  const templateSid = process.env.TWILIO_CONFIRMATION_TEMPLATE_SID;
  if (templateSid) {
    await sendWhatsAppContent(to, templateSid, {
      "1": firstName(teacherName),
      "2": formatTaughtOn(taughtOn),
      "3": numberedList(students),
    });
    return;
  }
  await sendWhatsAppText(to, buildAskMessage(teacherName, taughtOn, students));
}

// ---- Dispatch ---------------------------------------------------------------

export interface DispatchResult {
  sent: number;
  unreachable: number;
  skipped: number; // teachers already asked (re-run / retry)
  errors: string[];
}

interface BatchRow {
  id: string;
  owner_id: string;
  taught_on: string;
  status: string;
}

// Send each teacher in the batch their student list and open a
// teacher_confirmations row. Idempotent: teachers who already have a live row
// are skipped, and 'unreachable' rows are retried (e.g. after a phone number
// was added), so calling this again is always safe.
export async function dispatchBatch(
  db: SupabaseClient,
  batch: BatchRow,
): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, unreachable: 0, skipped: 0, errors: [] };

  const { data: itemRows, error: itemsErr } = await db
    .from("confirmation_items")
    .select("teacher_id, student_name, status")
    .eq("batch_id", batch.id)
    .neq("status", "removed");
  if (itemsErr) throw new Error(itemsErr.message);

  const byTeacher = new Map<string, string[]>();
  for (const item of (itemRows ?? []) as Pick<ConfirmationItem, "teacher_id" | "student_name" | "status">[]) {
    const list = byTeacher.get(item.teacher_id) ?? [];
    list.push(item.student_name);
    byTeacher.set(item.teacher_id, list);
  }

  const teacherIds = [...byTeacher.keys()];
  if (teacherIds.length > 0) {
    const { data: teachers, error: teachersErr } = await db
      .from("teachers")
      .select("id, full_name, phone_e164")
      .in("id", teacherIds);
    if (teachersErr) throw new Error(teachersErr.message);

    const { data: existing } = await db
      .from("teacher_confirmations")
      .select("teacher_id, status")
      .eq("batch_id", batch.id);
    const existingByTeacher = new Map(
      ((existing ?? []) as Pick<TeacherConfirmation, "teacher_id" | "status">[]).map(
        (c) => [c.teacher_id, c.status],
      ),
    );

    for (const teacher of (teachers ?? []) as {
      id: string;
      full_name: string;
      phone_e164: string | null;
    }[]) {
      const prior = existingByTeacher.get(teacher.id);
      if (prior && prior !== "unreachable") {
        result.skipped++;
        continue;
      }

      const students = byTeacher.get(teacher.id) ?? [];
      const row = {
        owner_id: batch.owner_id,
        batch_id: batch.id,
        teacher_id: teacher.id,
        phone_e164: teacher.phone_e164,
      };

      if (!teacher.phone_e164) {
        result.unreachable++;
        if (!prior) {
          await db.from("teacher_confirmations").insert({
            ...row,
            status: "unreachable",
            response_text: "No WhatsApp number on the teacher's profile.",
          });
        }
        continue;
      }

      try {
        await sendAsk(teacher.phone_e164, teacher.full_name, batch.taught_on, students);
        const sentRow = { ...row, status: "sent", sent_at: new Date().toISOString() };
        if (prior) {
          await db
            .from("teacher_confirmations")
            .update({ ...sentRow, response_text: null })
            .eq("batch_id", batch.id)
            .eq("teacher_id", teacher.id);
        } else {
          await db.from("teacher_confirmations").insert(sentRow);
        }
        result.sent++;
      } catch (err) {
        result.unreachable++;
        const reason = `WhatsApp send failed: ${err instanceof Error ? err.message : "unknown error"}`;
        result.errors.push(`${teacher.full_name}: ${reason}`);
        if (!prior) {
          await db
            .from("teacher_confirmations")
            .insert({ ...row, status: "unreachable", response_text: reason });
        }
      }
    }
  }

  if (batch.status === "scheduled") {
    await db
      .from("confirmation_batches")
      .update({ status: "dispatched", dispatched_at: new Date().toISOString() })
      .eq("id", batch.id)
      .eq("status", "scheduled");
  }

  return result;
}

// ---- Nudges -----------------------------------------------------------------

export interface NudgeResult {
  nudged: number;
  gaveUp: number; // marked no_response after MAX_NUDGES
  errors: string[];
}

interface NudgeRow extends TeacherConfirmation {
  batch: { taught_on: string } | null;
  teacher: { full_name: string } | null;
}

// Re-ask teachers who haven't replied 2 h after the last message, up to
// MAX_NUDGES times, inside the 8 am – 10 pm SGT window. After the final nudge
// goes unanswered for 2 h the row is marked no_response (replies still work).
export async function processNudges(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<NudgeResult> {
  const result: NudgeResult = { nudged: 0, gaveUp: 0, errors: [] };
  const cutoffMs = now.getTime() - NUDGE_INTERVAL_MS;
  const cutoff = new Date(cutoffMs).toISOString();

  const { data, error } = await db
    .from("teacher_confirmations")
    .select(
      "*, batch:confirmation_batches(taught_on), teacher:teachers(full_name)",
    )
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .lte("sent_at", cutoff);
  if (error) throw new Error(error.message);

  for (const conf of (data ?? []) as unknown as NudgeRow[]) {
    // Quiet since the last touch (send or nudge)?
    const lastTouch = new Date(conf.last_nudged_at ?? conf.sent_at!).getTime();
    if (lastTouch > cutoffMs) continue;

    if (conf.nudge_count >= MAX_NUDGES) {
      await db
        .from("teacher_confirmations")
        .update({ status: "no_response" })
        .eq("id", conf.id)
        .eq("status", "sent");
      result.gaveUp++;
      continue;
    }

    if (!inNudgeWindow(now) || !conf.phone_e164) continue;

    const { data: items } = await db
      .from("confirmation_items")
      .select("student_name")
      .eq("batch_id", conf.batch_id)
      .eq("teacher_id", conf.teacher_id)
      .neq("status", "removed");
    const students = ((items ?? []) as { student_name: string }[]).map(
      (i) => i.student_name,
    );

    try {
      await sendWhatsAppText(
        conf.phone_e164,
        buildNudgeMessage(
          conf.teacher?.full_name ?? "there",
          conf.batch?.taught_on ?? sgtDateISO(now),
          students,
        ),
      );
      await db
        .from("teacher_confirmations")
        .update({
          nudge_count: conf.nudge_count + 1,
          last_nudged_at: now.toISOString(),
        })
        .eq("id", conf.id);
      result.nudged++;
    } catch (err) {
      result.errors.push(
        `${conf.teacher?.full_name ?? conf.id}: ${err instanceof Error ? err.message : "nudge failed"}`,
      );
    }
  }

  return result;
}
