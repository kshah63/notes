import twilio from "twilio";
import { toWhatsAppAddress } from "./phone";

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
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  const templateSid = process.env.TWILIO_WHATSAPP_TEMPLATE_SID;

  if (!accountSid || !authToken || !from) {
    throw new Error(
      "Twilio is not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM).",
    );
  }
  if (!toE164) {
    throw new Error("No reminder recipient number configured.");
  }

  const client = twilio(accountSid, authToken);
  const to = toWhatsAppAddress(toE164);
  const fromAddr = toWhatsAppAddress(from);

  if (templateSid) {
    // Live sender: approved content template.
    const message = await client.messages.create({
      from: fromAddr,
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
  const message = await client.messages.create({ from: fromAddr, to, body });
  return { sid: message.sid, to };
}
