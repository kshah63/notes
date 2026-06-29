import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText, parseRecipients } from "@/lib/whatsapp";
import { isTwilioConfigured, getAppUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Once-a-morning WhatsApp summary: overdue / due-today follow-ups, open
// to-dos, and students who've gone quiet. Scheduled 00:00 UTC = 8am SGT.
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

  const supabase = createAdminClient();
  const fallbackNumber = process.env.WHATSAPP_TO_NUMBER || null;
  const appUrl = getAppUrl();
  const now = Date.now();
  const endOfToday = (() => {
    // End of "today" in SGT, expressed as a UTC instant.
    const sgtNow = new Date(now + 8 * 3600_000);
    const y = sgtNow.getUTCFullYear();
    const m = sgtNow.getUTCMonth();
    const d = sgtNow.getUTCDate();
    return Date.UTC(y, m, d, 23, 59, 59) - 8 * 3600_000;
  })();

  const { data: settingsRows } = await supabase
    .from("app_settings")
    .select("owner_id, reminder_whatsapp_number, nudge_enabled");

  let sent = 0;
  const errors: string[] = [];

  for (const s of settingsRows ?? []) {
    if (!s.nudge_enabled) continue;
    const recipients = parseRecipients(
      s.reminder_whatsapp_number as string | null,
      fallbackNumber,
    );
    if (recipients.length === 0) continue;

    const summary = await buildDigest(supabase, s.owner_id, now, endOfToday);
    const link = appUrl ? `${appUrl}/dashboard` : "the app";
    const body = `☀️ Morning! Here's where things stand:
${summary}
Open: ${link}`;

    for (const to of recipients) {
      try {
        await sendWhatsAppText(to, body);
        sent++;
      } catch (err) {
        errors.push(`${to}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
  }

  return NextResponse.json({ ok: true, sent, errors });
}

async function buildDigest(
  supabase: ReturnType<typeof createAdminClient>,
  ownerId: string,
  now: number,
  endOfToday: number,
): Promise<string> {
  const { data: fu } = await supabase
    .from("follow_ups")
    .select("due_at, note, student:students(full_name), parent:parents(full_name)")
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .order("due_at", { ascending: true });

  const rows = (fu ?? []) as unknown as {
    due_at: string;
    note: string | null;
    student: { full_name: string } | null;
    parent: { full_name: string } | null;
  }[];

  let overdue = 0;
  const dueToday: string[] = [];
  for (const f of rows) {
    const t = new Date(f.due_at).getTime();
    if (t < now) overdue++;
    else if (t <= endOfToday) {
      const who = f.student?.full_name ?? f.parent?.full_name ?? "";
      dueToday.push([who, f.note].filter(Boolean).join(": ") || "follow-up");
    }
  }

  // Open action items (approx: scan recent interactions).
  const { data: interactions } = await supabase
    .from("interactions")
    .select("action_items(done)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(300);
  let openTodos = 0;
  for (const it of (interactions ?? []) as { action_items: { done: boolean }[] }[]) {
    for (const a of it.action_items ?? []) if (!a.done) openTodos++;
  }

  const { data: lapsed } = await supabase.rpc("students_needing_attention", {
    p_owner: ownerId,
    p_days: 30,
    p_limit: 5,
  });
  const lapsedRows = (lapsed ?? []) as { full_name: string }[];

  const lines: string[] = [];
  lines.push(`• ${overdue} overdue follow-up${overdue === 1 ? "" : "s"}`);
  lines.push(
    `• ${dueToday.length} due today${
      dueToday.length ? ": " + dueToday.slice(0, 3).join("; ") : ""
    }`,
  );
  lines.push(`• ${openTodos} open to-do${openTodos === 1 ? "" : "s"}`);
  if (lapsedRows.length > 0) {
    lines.push(
      `• ${lapsedRows.length}+ gone quiet (e.g. ${lapsedRows
        .slice(0, 3)
        .map((l) => l.full_name)
        .join(", ")})`,
    );
  }
  return lines.join("\n");
}
