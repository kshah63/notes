import { NextResponse, type NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRecipients, sendWhatsAppText } from "@/lib/whatsapp";
import { normalizeToE164 } from "@/lib/phone";
import { transcribeTwilioMedia, isDeepgramConfigured } from "@/lib/transcribe";
import { runWhatsAppAgent, loadWaHistory, saveWaTurns } from "@/lib/wa-agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Twilio WhatsApp inbound webhook — gives WhatsApp the same use cases as the
// app. Replies asynchronously (via waitUntil) so Twilio gets an immediate 200
// and never times out / retries.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const from = String(form.get("From") ?? ""); // "whatsapp:+65..."
  const body = String(form.get("Body") ?? "").trim();
  const numMedia = parseInt(String(form.get("NumMedia") ?? "0"), 10) || 0;
  const mediaUrl = String(form.get("MediaUrl0") ?? "");
  const mediaType = String(form.get("MediaContentType0") ?? "");

  const fromE164 = normalizeToE164(from.replace(/^whatsapp:/, ""));
  const empty = new NextResponse("<Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });

  if (!fromE164) return empty;
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return empty; // not configured yet
  }

  const db = createAdminClient();
  const ownerId = await resolveOwner(db, fromE164);
  if (!ownerId) return empty; // ignore unknown senders

  waitUntil(
    handleMessage({
      ownerId,
      replyTo: fromE164,
      body,
      hasAudio: numMedia > 0 && mediaType.startsWith("audio"),
      mediaUrl,
      mediaType,
    }),
  );

  return empty;
}

async function handleMessage(opts: {
  ownerId: string;
  replyTo: string;
  body: string;
  hasAudio: boolean;
  mediaUrl: string;
  mediaType: string;
}) {
  try {
    let text = opts.body;

    if (!text && opts.hasAudio) {
      if (!isDeepgramConfigured()) {
        await sendWhatsAppText(
          opts.replyTo,
          "I got a voice note but voice transcription isn't set up yet (needs DEEPGRAM_API_KEY). Send text for now and I'll log it.",
        );
        return;
      }
      text = await transcribeTwilioMedia(opts.mediaUrl, opts.mediaType);
      if (!text) {
        await sendWhatsAppText(
          opts.replyTo,
          "Couldn't make out that voice note — mind sending it again or typing it?",
        );
        return;
      }
    }

    if (!text) return;

    const db = createAdminClient();
    const history = await loadWaHistory(db, opts.ownerId, opts.replyTo);
    const reply = await runWhatsAppAgent(opts.ownerId, text, history);
    await sendWhatsAppText(opts.replyTo, reply);
    // Persist this turn so the next message has context.
    await saveWaTurns(db, opts.ownerId, opts.replyTo, [
      { role: "user", content: text },
      { role: "assistant", content: reply },
    ]);
  } catch (err) {
    try {
      await sendWhatsAppText(
        opts.replyTo,
        `Sorry — something went wrong handling that. (${
          err instanceof Error ? err.message : "unknown error"
        })`,
      );
    } catch {
      // give up quietly
    }
  }
}

// Match the sender to an owner via their configured reminder numbers; fall back
// to the single account if only one exists (the shared you+dad login).
async function resolveOwner(
  db: ReturnType<typeof createAdminClient>,
  fromE164: string,
): Promise<string | null> {
  const { data: settings } = await db
    .from("app_settings")
    .select("owner_id, reminder_whatsapp_number");
  const rows = (settings ?? []) as {
    owner_id: string;
    reminder_whatsapp_number: string | null;
  }[];

  for (const r of rows) {
    const numbers = parseRecipients(r.reminder_whatsapp_number, null);
    if (numbers.includes(fromE164)) return r.owner_id;
  }

  const { data: users } = await db.from("app_users").select("id").limit(2);
  if ((users ?? []).length === 1) return (users as { id: string }[])[0].id;

  return null;
}
