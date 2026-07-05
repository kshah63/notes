import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ANTHROPIC_MODEL, isAnthropicConfigured } from "./env";
import { firstName, formatTaughtOn, numberedList, REPLY_WINDOW_MS } from "./confirmations";
import { loadWaHistory, saveWaTurns } from "./wa-agent";
import { parseRecipients, sendWhatsAppText } from "./whatsapp";
import type { ConfirmationItem, TeacherConfirmation } from "./types";

// Inbound side of the daily teaching confirmations: find whether a WhatsApp
// sender is a teacher we're waiting on, understand their reply ("all
// correct" / "missing X" / "I didn't teach Y"), record it, and compose the
// acknowledgement.

export interface ConfirmationContext extends TeacherConfirmation {
  batch: { id: string; taught_on: string } | null;
  teacher: { id: string; full_name: string } | null;
}

const AWAITING = ["sent", "no_response"];
const RESPONDED = ["confirmed", "amended"];

// The most recent confirmation asked of this number inside the reply window.
// awaitingOnly=true → only ones still waiting on a reply (these outrank the
// owner's own agent in inbound routing); false → also recently-responded ones,
// so a teacher can follow up with "actually, also add Caleb".
export async function findConfirmationForPhone(
  db: SupabaseClient,
  phoneE164: string,
  opts: { awaitingOnly: boolean },
): Promise<ConfirmationContext | null> {
  const since = new Date(Date.now() - REPLY_WINDOW_MS).toISOString();
  const { data } = await db
    .from("teacher_confirmations")
    .select("*, batch:confirmation_batches(id, taught_on), teacher:teachers(id, full_name)")
    .eq("phone_e164", phoneE164)
    .in("status", opts.awaitingOnly ? AWAITING : [...AWAITING, ...RESPONDED])
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as unknown as ConfirmationContext) ?? null;
}

export async function isTeacherPhone(
  db: SupabaseClient,
  phoneE164: string,
): Promise<boolean> {
  const { count } = await db
    .from("teachers")
    .select("id", { count: "exact", head: true })
    .eq("phone_e164", phoneE164);
  return (count ?? 0) > 0;
}

// ---- Reply parsing ----------------------------------------------------------

interface ParsedReply {
  kind: "confirm" | "amend" | "unclear";
  extra: string[]; // names from the list the teacher did NOT teach
  missing: string[]; // students taught but absent from the list
  rest_confirmed: boolean;
  clarify?: string;
}

const PARSE_SYSTEM = `You interpret a teacher's WhatsApp reply to a "please confirm the students you taught" message from a tuition centre.
You are given the current student list and the reply (with recent conversation turns for context).
Return ONLY valid JSON, no prose or markdown:
{
  "kind": "confirm" | "amend" | "unclear",
  "extra": ["names the teacher says they did NOT teach — copy each EXACTLY as it appears in the provided list"],
  "missing": ["students the teacher says they taught that are NOT on the list, as the teacher wrote them"],
  "rest_confirmed": boolean,
  "clarify": "if kind is unclear: one short question to ask the teacher"
}
Rules:
- "confirm": the whole list is correct, no changes (e.g. "all correct", "yes", "ok", "looks good", "confirmed 👍").
- "amend": any missing or extra student is reported. Corrections-only replies (e.g. "just remove Bella") imply the rest is fine → rest_confirmed true. If the teacher explicitly confirms the rest, also true.
- "unclear": you cannot tell what they mean, or they name a student for removal who isn't on the list. Unrelated small talk is also "unclear" — ask them to confirm the list.`;

function extractJson(text: string): Record<string, unknown> | null {
  let candidate = text.trim();
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidate = fenced[1].trim();
  if (!candidate.startsWith("{")) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    candidate = candidate.slice(start, end + 1);
  }
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const CONFIRM_RE =
  /^(yes|yep|ya|ok(ay)?|sure|correct|confirm(ed)?|all\s*(correct|good|right|ok)|looks\s*good|👍|✅)[\s!.👍✅]*$/i;

async function parseReply(
  reply: string,
  students: string[],
  teacherName: string,
  taughtOn: string,
  history: { role: string; content: string }[],
): Promise<ParsedReply | null> {
  // Cheap unambiguous path — also the fallback when the AI key is missing.
  if (CONFIRM_RE.test(reply.trim())) {
    return { kind: "confirm", extra: [], missing: [], rest_confirmed: true };
  }
  if (!isAnthropicConfigured()) return null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const context = [
    `Teacher: ${teacherName}`,
    `Teaching day: ${formatTaughtOn(taughtOn)}`,
    `Current list:\n${numberedList(students)}`,
    history.length
      ? `Recent conversation:\n${history
          .slice(-6)
          .map((t) => `${t.role === "user" ? "Teacher" : "Bot"}: ${t.content}`)
          .join("\n")}`
      : null,
    `Teacher's reply: ${reply}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    system: PARSE_SYSTEM,
    messages: [{ role: "user", content: context }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const raw = extractJson(text);
  if (!raw) return null;
  const kind = raw.kind === "confirm" || raw.kind === "amend" ? raw.kind : "unclear";
  const asList = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
  return {
    kind,
    extra: asList(raw.extra),
    missing: asList(raw.missing),
    rest_confirmed: raw.rest_confirmed === true,
    clarify: typeof raw.clarify === "string" ? raw.clarify : undefined,
  };
}

// ---- Applying the outcome ---------------------------------------------------

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// Handle one inbound message for a confirmation: parse, record, acknowledge.
// Returns the message to send back to the teacher.
export async function handleConfirmationReply(
  db: SupabaseClient,
  conf: ConfirmationContext,
  reply: string,
): Promise<string> {
  const teacherName = conf.teacher?.full_name ?? "there";
  const taughtOn = conf.batch?.taught_on ?? new Date().toISOString().slice(0, 10);
  const dateLabel = formatTaughtOn(taughtOn);

  const { data: itemRows } = await db
    .from("confirmation_items")
    .select("*")
    .eq("batch_id", conf.batch_id)
    .eq("teacher_id", conf.teacher_id);
  const items = (itemRows ?? []) as ConfirmationItem[];
  const active = items.filter((i) => i.status !== "removed");

  const history = await loadWaHistory(db, conf.owner_id, conf.phone_e164 ?? "");
  const parsed = await parseReply(
    reply,
    active.map((i) => i.student_name),
    teacherName,
    taughtOn,
    history,
  );

  let ack: string;

  if (!parsed) {
    // AI unavailable or unparseable — keep the raw reply so nothing is lost.
    await recordResponse(db, conf, reply, "amended");
    await notifyOwner(db, conf, `📝 ${teacherName} replied about ${dateLabel} (needs review): "${reply}"`);
    ack = `Thanks — I've recorded your reply for ${dateLabel} and flagged it for review. 📝`;
  } else if (parsed.kind === "confirm") {
    await db
      .from("confirmation_items")
      .update({ status: "confirmed" })
      .eq("batch_id", conf.batch_id)
      .eq("teacher_id", conf.teacher_id)
      .eq("status", "listed");
    await recordResponse(db, conf, reply, "confirmed");
    ack = `Thanks ${firstName(teacherName)} — all ${active.length} student${active.length === 1 ? "" : "s"} confirmed for ${dateLabel} ✅`;
  } else if (parsed.kind === "amend") {
    const removed: string[] = [];
    const added: string[] = [];

    for (const name of parsed.extra) {
      const match = active.find((i) => normName(i.student_name) === normName(name));
      if (!match) continue;
      await db
        .from("confirmation_items")
        .update({ status: "removed" })
        .eq("id", match.id);
      removed.push(match.student_name);
    }

    for (const name of parsed.missing) {
      const clean = name.trim();
      if (!clean) continue;
      // Already on the list (e.g. repeated in a second message)? Re-confirm it.
      const existing = items.find((i) => normName(i.student_name) === normName(clean));
      if (existing) {
        if (existing.status === "removed") {
          await db
            .from("confirmation_items")
            .update({ status: "confirmed" })
            .eq("id", existing.id);
          added.push(existing.student_name);
        }
        continue;
      }
      // Link to the roster when the name matches a known student.
      const { data: student } = await db
        .from("students")
        .select("id, full_name")
        .eq("owner_id", conf.owner_id)
        .ilike("full_name", clean)
        .limit(1)
        .maybeSingle();
      await db.from("confirmation_items").insert({
        owner_id: conf.owner_id,
        batch_id: conf.batch_id,
        teacher_id: conf.teacher_id,
        student_id: (student as { id: string } | null)?.id ?? null,
        student_name: (student as { full_name: string } | null)?.full_name ?? clean,
        source: "teacher_added",
        status: "confirmed",
      });
      added.push((student as { full_name: string } | null)?.full_name ?? clean);
    }

    if (removed.length === 0 && added.length === 0) {
      // The correction didn't match anything we can act on — ask, don't guess.
      ack = `Hmm, I couldn't match that to your list for ${dateLabel}:\n${numberedList(
        active.map((i) => i.student_name),
      )}\n\nReply "all correct", or name the student to add/remove (e.g. "missing: Caleb Lim").`;
    } else {
      if (parsed.rest_confirmed) {
        await db
          .from("confirmation_items")
          .update({ status: "confirmed" })
          .eq("batch_id", conf.batch_id)
          .eq("teacher_id", conf.teacher_id)
          .eq("status", "listed");
      }
      await recordResponse(db, conf, reply, "amended");

      const changes = [
        added.length ? `added ${added.join(", ")}` : null,
        removed.length ? `removed ${removed.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      await notifyOwner(db, conf, `✏️ ${teacherName} amended ${dateLabel}: ${changes}`);
      ack = `Got it ${firstName(teacherName)} — ${changes} for ${dateLabel} ✏️ Reply again if anything else is off.`;
    }
  } else {
    ack =
      (parsed.clarify ? `${parsed.clarify}\n\n` : "") +
      `Here's your list for ${dateLabel}:\n${numberedList(active.map((i) => i.student_name))}\n\n` +
      `Reply "all correct" if it's right, or e.g. "missing: Caleb Lim" / "I didn't teach Bella Lim".`;
  }

  await saveWaTurns(db, conf.owner_id, conf.phone_e164 ?? "", [
    { role: "user", content: reply },
    { role: "assistant", content: ack },
  ]);
  return ack;
}

// Append the raw reply and stamp the response. A confirmation that was
// already answered stays 'amended' once any change lands.
async function recordResponse(
  db: SupabaseClient,
  conf: ConfirmationContext,
  reply: string,
  status: "confirmed" | "amended",
): Promise<void> {
  const nextStatus = conf.status === "amended" ? "amended" : status;
  await db
    .from("teacher_confirmations")
    .update({
      status: nextStatus,
      responded_at: conf.responded_at ?? new Date().toISOString(),
      response_text: conf.response_text ? `${conf.response_text}\n${reply}` : reply,
    })
    .eq("id", conf.id);
}

// Heads-up to the owner's own WhatsApp when a teacher reports a discrepancy.
// Best-effort — a notification failure must never break the teacher's ack.
async function notifyOwner(
  db: SupabaseClient,
  conf: ConfirmationContext,
  message: string,
): Promise<void> {
  try {
    const { data: settings } = await db
      .from("app_settings")
      .select("reminder_whatsapp_number")
      .eq("owner_id", conf.owner_id)
      .maybeSingle();
    const recipients = parseRecipients(
      (settings as { reminder_whatsapp_number: string | null } | null)
        ?.reminder_whatsapp_number,
      process.env.WHATSAPP_TO_NUMBER,
    );
    for (const to of recipients) {
      if (to === conf.phone_e164) continue; // don't echo to the teacher
      await sendWhatsAppText(to, message);
    }
  } catch {
    // best-effort only
  }
}
