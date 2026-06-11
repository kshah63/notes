import { parsePhoneNumberFromString } from "libphonenumber-js";

// Normalise a raw phone string to E.164 (e.g. "+6591234567).
// Defaults to Singapore when no country code is present, since MV parents are
// SG-based and the WhatsApp sender requires E.164.
export function normalizeToE164(
  raw: string | null | undefined,
  defaultCountry: "SG" = "SG",
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (parsed && parsed.isValid()) {
    return parsed.number; // E.164, e.g. +6591234567
  }

  // Fall back: if it already looks like a +-prefixed number, keep digits.
  if (trimmed.startsWith("+")) {
    const digits = "+" + trimmed.slice(1).replace(/\D/g, "");
    return digits.length > 4 ? digits : null;
  }
  return null;
}

// For the WhatsApp sender, Twilio expects the `whatsapp:+E164` form.
export function toWhatsAppAddress(e164: string): string {
  return e164.startsWith("whatsapp:") ? e164 : `whatsapp:${e164}`;
}
