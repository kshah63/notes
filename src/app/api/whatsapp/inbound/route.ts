import { NextResponse, type NextRequest } from "next/server";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRecipients } from "@/lib/whatsapp";
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

function xmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Reply synchronously via TwiML — Twilio sends this straight back to the user.
function twiml(message?: string) {
  const body = message ? `<Message>${xmlEscape(message)}</Message>` : "";
  return new NextResponse(`<Response>${body}</Response>`, {
    headers: { "Content-Type": "text/xml" },
  });
}

// Browser-friendly health check.
export async function GET() {
  const cfg = {
    route: "whatsapp-inbound: ok",
    supabase: supabaseConfigured(),
    anthropic: isAnthropicConfigured(),
    twilio: isTwilioConfigured(),
    twilio_from: process.env.TWILIO_WHATSAPP_FROM || "(not set)",
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

  const from = String(form.get("From") ?? "");
  const body = String(form.get("Body") ?? "").trim();
  const numMedia = parseInt(String(form.get("NumMedia") ?? "0"), 10) || 0;
  const mediaUrl = String(form.get("MediaUrl0") ?? "");
  const mediaType = String(form.get("MediaContentType0") ?? "");
  const fromE164 = normalizeToE164(from.replace(/^whatsapp:/, ""));

  // Instant reachability test — confirms Twilio → app → reply works.
  if (body.toLowerCase() === "ping") {
    return twiml("pong ✅ — the bot is live and can reply.");
  }

  if (!fromE164) return twiml();

  try {
    if (!supabaseConfigured()) {
      return twiml(
        "⚠️ Server database keys aren't set (SUPABASE_SERVICE_ROLE_KEY). Add them in Vercel and redeploy.",
      );
    }

    const db = createAdminClient();
    const ownerId = await resolveOwner(db, fromE164);
    if (!ownerId) {
      return twiml(
        "I don't recognise this number yet. In the app → Settings, add this WhatsApp number to your account, then message me again.",
      );
    }

    if (!isAnthropicConfigured()) {
      return twiml("⚠️ The AI key isn't set (ANTHROPIC_API_KEY). Add it in Vercel and redeploy.");
    }

    let text = body;
    if (!text && numMedia > 0 && mediaType.startsWith("audio")) {
      if (!isDeepgramConfigured()) {
        return twiml(
          "I got a voice note but transcription isn't set up (DEEPGRAM_API_KEY). Send text for now and I'll log it.",
        );
      }
      text = await transcribeTwilioMedia(mediaUrl, mediaType);
      if (!text) return twiml("Couldn't make out that voice note — mind typing it?");
    }
    if (!text) return twiml();

    const history = await loadWaHistory(db, ownerId, fromE164);
    const answer = await runWhatsAppAgent(ownerId, text, history);
    await saveWaTurns(db, ownerId, fromE164, [
      { role: "user", content: text },
      { role: "assistant", content: answer },
    ]);
    return twiml(answer);
  } catch (err) {
    return twiml(
      `Sorry — something went wrong. (${
        err instanceof Error ? err.message : "unknown error"
      })`,
    );
  }
}

// Match the sender to an owner via configured reminder numbers; fall back to the
// first account if none match (works whether you have one shared login or two).
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
    if (parseRecipients(r.reminder_whatsapp_number, null).includes(fromE164)) {
      return r.owner_id;
    }
  }

  const { data: users } = await db
    .from("app_users")
    .select("id, created_at")
    .order("created_at", { ascending: true })
    .limit(1);
  if ((users ?? []).length >= 1) return (users as { id: string }[])[0].id;

  return null;
}
