import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTwilioConfigured } from "@/lib/env";
import { dispatchBatch, processNudges } from "@/lib/confirmations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 60s matches the plan limit used elsewhere in this app. If a huge batch ever
// times out mid-send, the next 15-min run picks up the unsent teachers —
// dispatchBatch skips anyone already asked.
export const maxDuration = 60;

// Scheduled every 15 min by vercel.json. Two jobs in one pass:
//  1. Dispatch: any scheduled batch whose dispatch_after (6 pm SGT on the
//     upload day) has passed gets sent — each teacher receives their student
//     list on WhatsApp.
//  2. Nudges: teachers quiet for 2 h since the last message are re-asked (max
//     3 nudges, 8 am–10 pm SGT), then marked no_response.
// Both are idempotent, so a crashed or overlapping run never double-sends.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (!isTwilioConfigured()) {
    return NextResponse.json({ ok: true, skipped: "twilio_not_configured" });
  }

  const db = createAdminClient();
  const errors: string[] = [];
  let dispatched = 0;
  let sent = 0;
  let unreachable = 0;

  const { data: due, error } = await db
    .from("confirmation_batches")
    .select("id, owner_id, taught_on, status")
    .eq("status", "scheduled")
    .lte("dispatch_after", new Date().toISOString());
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  for (const batch of due ?? []) {
    try {
      const result = await dispatchBatch(db, batch);
      dispatched++;
      sent += result.sent;
      unreachable += result.unreachable;
      errors.push(...result.errors);
    } catch (err) {
      errors.push(
        `batch ${batch.id}: ${err instanceof Error ? err.message : "dispatch failed"}`,
      );
    }
  }

  let nudged = 0;
  let gaveUp = 0;
  try {
    const nudges = await processNudges(db);
    nudged = nudges.nudged;
    gaveUp = nudges.gaveUp;
    errors.push(...nudges.errors);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "nudge pass failed");
  }

  return NextResponse.json({
    ok: true,
    dispatched,
    sent,
    unreachable,
    nudged,
    gaveUp,
    errors,
  });
}
