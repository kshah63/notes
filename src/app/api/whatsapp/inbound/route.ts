import { NextResponse, type NextRequest } from "next/server";
import twilio from "twilio";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRecipients, sendWhatsAppText } from "@/lib/whatsapp";
import { normalizeToE164 } from "@/lib/phone";
import { transcribeTwilioMedia, isDeepgramConfigured } from "@/lib/transcribe";
import { runWhatsAppAgent, loadWaHistory, saveWaTurns } from "@/lib/wa-agent";
import { isAnthropicConfigured, isTwilioConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// Browser-friendly health check: open this URL to see what's configured.
export async function GET() {
  const cfg = {
    route: "whatsapp-inbound: ok",
    supabase: supabaseConfigured(),
    anthropic: isAnthropicConfigured(),
    twilio: isTwilioConfigured(),
    deepgram: isDeepgramConfigured(),
    accounts: 0,
  };
  try {
    if (cfg.supabase) {
      const db = createAdminClient();
      const { count } = await db
        .from("app_users")
        .select("id", { count: "exact", head: true });
      cfg.accounts = count ?? 0;
    }
  } catch {
    // leave accounts at 0
  }
  return NextResponse.json(cfg);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();

  if (process.env.TWILIO_VALIDATE_SIGNATURE === "true") {
    const token = process.env.TWILIO_AUTH_TOKEN || "";
    const signature = request.headers.get("x-twilio-signature") || "";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const host = request.headers.get("host") || "";
    const url = `${proto}://${host}/api/whatsapp/inbound`;
    const params: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") params[k] = v;
    }
    if (!twilio.validateRequest(token, signature, url, params)) {
      return new NextResponse("forbidden", { status: 403 });
    }
  }

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

  waitUntil(
    handleMessage({
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
  replyTo: string;
  body: string;
  hasAudio: boolean;
  mediaUrl: string;
  mediaType: string;
}) {
  // If we can't even send (no Twilio creds), there's nothing we can do.
  if (!isTwilioConfigured()) return;

  const reply = (msg: string) => sendWhatsAppText(opts.replyTo, msg);

  try {
    if (!supabaseConfigured()) {
      await reply(
        "⚠️ Server setup incomplete: the database keys aren't set yet (SUPABASE_SERVICE_ROLE_KEY). Add them in Vercel and redeploy, then message me again.",
      );
      return;
    }

    const db = createAdminClient();
    const ownerId = await resolveOwner(db, opts.replyTo);
    if (!ownerId) {
      await reply(
        "I don't recognize this number yet. Open the app and log in (create the shared account if you haven't), then add this WhatsApp number under Settings — and message me again.",
      );
      return;
    }

    if (!isAnthropicConfigured()) {
      await reply(
        "⚠️ The AI key isn't set on the server (ANTHROPIC_API_KEY). Add it in Vercel and redeploy.",
      );
      return;
    }

    let text = opts.body;
    if (!text && opts.hasAudio) {
      if (!isDeepgramConfigured()) {
        await reply(
          "I got a voice note but voice transcription isn't set up (needs DEEPGRAM_API_KEY). Send text for now and I'll log it.",
        );
        return;
      }
      text = await transcribeTwilioMedia(opts.mediaUrl, opts.mediaType);
      if (!text) {
        await reply("Couldn't make out that voice note — mind typing it?");
        return;
      }
    }
    if (!text) return;

    const history = await loadWaHistory(db, ownerId, opts.replyTo);
    const answer = await runWhatsAppAgent(ownerId, text, history);
    await reply(answer);
    await saveWaTurns(db, ownerId, opts.replyTo, [
      { role: "user", content: text },
      { role: "assistant", content: answer },
    ]);
  } catch (err) {
    try {
      await reply(
        `Sorry — something went wrong. (${
          err instanceof Error ? err.message : "unknown error"
        })`,
      );
    } catch {
      // give up quietly
    }
  }
}

// Match the sender to an owner via configured reminder numbers; fall back to the
// single account if only one exists (the shared you+dad login).
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
