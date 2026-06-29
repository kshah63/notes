import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText, parseRecipients } from "@/lib/whatsapp";
import { isTwilioConfigured, getAppUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Periodic "anything to log?" nudge. Scheduled every 30 min by vercel.json,
// but only fires within each owner's working-hours window (SGT). Sends a
// WhatsApp message with a deep link to quick-capture (type or voice).
const SGT_OFFSET_HOURS = 8;

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
  const link = appUrl ? `${appUrl}/log` : "the app";

  // Current hour in Singapore time.
  const sgtHour = (new Date().getUTCHours() + SGT_OFFSET_HOURS) % 24;

  const { data: settingsRows, error } = await supabase
    .from("app_settings")
    .select(
      "owner_id, reminder_whatsapp_number, nudge_enabled, nudge_start_hour, nudge_end_hour",
    );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const s of settingsRows ?? []) {
    if (!s.nudge_enabled) {
      skipped++;
      continue;
    }
    const start = s.nudge_start_hour ?? 9;
    const end = s.nudge_end_hour ?? 21;
    const inWindow =
      start <= end
        ? sgtHour >= start && sgtHour < end
        : sgtHour >= start || sgtHour < end; // overnight window
    if (!inWindow) {
      skipped++;
      continue;
    }

    const recipients = parseRecipients(
      s.reminder_whatsapp_number as string | null,
      fallbackNumber,
    );
    if (recipients.length === 0) {
      skipped++;
      continue;
    }

    const body = `📝 MathVision check-in — anything from the last bit worth logging?\nTap to capture (type or 🎙 voice): ${link}`;

    for (const to of recipients) {
      try {
        await sendWhatsAppText(to, body);
        sent++;
      } catch (err) {
        errors.push(
          `${to}: ${err instanceof Error ? err.message : "send failed"}`,
        );
      }
    }
  }

  return NextResponse.json({ ok: true, sgtHour, sent, skipped, errors });
}
