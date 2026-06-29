import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate, parseRecipients } from "@/lib/whatsapp";
import { isTwilioConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Scheduled every ~15 min by vercel.json. Finds pending follow-ups whose
// WhatsApp nudge is due and hasn't fired, sends each, and stamps reminded_at
// so a re-run never double-sends (§10).
export async function GET(request: NextRequest) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET
  // is set. Reject anything else.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (!isTwilioConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: "twilio_not_configured",
      sent: 0,
    });
  }

  const supabase = createAdminClient();

  const { data: due, error } = await supabase
    .from("follow_ups")
    .select(
      `id, owner_id, note, due_at,
       student:students(full_name),
       parent:parents(full_name)`,
    )
    .eq("status", "pending")
    .eq("remind_whatsapp", true)
    .is("reminded_at", null)
    .lte("due_at", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (due ?? []) as unknown as DueRow[];
  const fallbackNumber = process.env.WHATSAPP_TO_NUMBER || null;
  const recipientsByOwner = new Map<string, string[]>();

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const f of rows) {
    // Resolve recipients: per-owner setting (comma-separated) overrides env.
    let recipients = recipientsByOwner.get(f.owner_id);
    if (recipients === undefined) {
      const { data: settings } = await supabase
        .from("app_settings")
        .select("reminder_whatsapp_number")
        .eq("owner_id", f.owner_id)
        .maybeSingle();
      recipients = parseRecipients(
        settings?.reminder_whatsapp_number as string | null,
        fallbackNumber,
      );
      recipientsByOwner.set(f.owner_id, recipients);
    }

    if (recipients.length === 0) {
      skipped++;
      continue;
    }

    const parentName = f.parent?.full_name ?? "a parent";
    const studentName = f.student?.full_name ?? "a student";
    const note = f.note ?? "Follow-up due.";

    let anySent = false;
    for (const to of recipients) {
      try {
        await sendWhatsAppTemplate(to, { parentName, studentName, note });
        anySent = true;
      } catch (err) {
        errors.push(
          `${f.id}→${to}: ${err instanceof Error ? err.message : "send failed"}`,
        );
      }
    }

    if (anySent) {
      // Idempotent stamp: only if still unsent.
      await supabase
        .from("follow_ups")
        .update({ reminded_at: new Date().toISOString() })
        .eq("id", f.id)
        .is("reminded_at", null);
      sent++;
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: rows.length,
    sent,
    skipped,
    errors,
  });
}

interface DueRow {
  id: string;
  owner_id: string;
  note: string | null;
  due_at: string;
  student: { full_name: string } | null;
  parent: { full_name: string } | null;
}
