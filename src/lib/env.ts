// Small helpers to report which integrations are configured. Used by the
// Settings screen and to gracefully degrade when a key is missing.

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function isGranolaApiConfigured(): boolean {
  return Boolean(process.env.GRANOLA_API_KEY);
}

export function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM,
  );
}

export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

// Absolute base URL for links sent in WhatsApp messages. Prefers an explicit
// APP_URL, falls back to Vercel's production URL.
export function getAppUrl(): string {
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const raw = process.env.APP_URL || (vercel ? `https://${vercel}` : "");
  if (!raw) return "";
  // Use only the origin, so an accidental path in APP_URL (e.g. ".../login")
  // doesn't corrupt the deep links.
  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/$/, "");
  }
}
