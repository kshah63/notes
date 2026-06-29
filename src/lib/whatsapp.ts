import twilio from "twilio";
import { toWhatsAppAddress, normalizeToE164 } from "./phone";

// Parse a comma/semicolon/whitespace-separated recipient string into E.164
// numbers. Used for "you + your dad" reminder/nudge recipients.
export function parseRecipients(
  primary: string | null | undefined,
  fallback: string | null | undefined,
): string[] {
  const source = primary?.trim() ? primary : fallback ?? "";
  return source
    .split(/[,;\s]+/)
    .map((s) => normalizeToE164(s))
    .filter((s): s is string => Boolean(s));
}

function twilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM).",
    );
  }
  return { client: twilio(accountSid, authToken), from: toWhatsAppAddress(from) };
}

// Free-form WhatsApp message (works on the Twilio sandbox, and on a live
// sender inside the 24h customer-care window). Used for the update nudge.
export async function sendWhatsAppText(
  toE164: string,
  body: string,
): Promise<{ sid: string; to: string }> {
  const { client, from } = twilioClient();
  const to = toWhatsAppAddress(toE164);
  const message = await client.messages.create({ from, to, body });
  return { sid: message.sid, to };
}

// Server-side only. Sends the "follow-up due" nudge to your own WhatsApp.
// On the Twilio sandbox, free-form text works inside the 24h window. On a live
// sender, set TWILIO_WHATSAPP_TEMPLATE_SID to an approved utility template
// with three variables: {{1}} parent, {{2}} student, {{3}} note. See §10.

export interface FollowUpTemplateVars {
  parentName: string;
  studentName: string;
  note: string;
}

export interface WhatsAppSendResult {
  sid: string;
  to: string;
}

export async function sendWhatsAppTemplate(
  toE164: string,
  vars: FollowUpTemplateVars,
): Promise<WhatsAppSendResult> {
  if (!toE164) {
    throw new Error("No reminder recipient number configured.");
  }
  const templateSid = process.env.TWILIO_WHATSAPP_TEMPLATE_SID;
  const { client, from } = twilioClient();
  const to = toWhatsAppAddress(toE164);

  if (templateSid) {
    // Live sender: approved content template.
    const message = await client.messages.create({
      from,
      to,
      contentSid: templateSid,
      contentVariables: JSON.stringify({
        "1": vars.parentName,
        "2": vars.studentName,
        "3": vars.note,
      }),
    });
    return { sid: message.sid, to };
  }

  // Sandbox / dev path: free-form body.
  const body = `🔔 Follow-up due — ${vars.parentName} (re ${vars.studentName})\n${vars.note}`;
  const message = await client.messages.create({ from, to, body });
  return { sid: message.sid, to };
}
