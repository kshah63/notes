import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODEL } from "./env";
import type { Channel, TidyResult } from "./types";
import { CHANNEL_LABELS } from "./types";

// Server-side only. Turns rough parent-conversation notes into a clean record:
// a neutral summary, imperative action items, and an optional suggested
// follow-up. See §7 of the build spec.

const SYSTEM = `You tidy a tutor's rough notes from a parent conversation.
Return ONLY valid JSON, no preamble or markdown, in this shape:
{
  "summary": "2-4 sentence clean summary, neutral and factual",
  "action_items": ["short imperative items"],
  "suggested_follow_up": { "due_in_days": number | null, "note": string | null }
}`;

export interface TidyInput {
  channel: Channel;
  studentName?: string | null;
  parentName?: string | null;
  rawNotes: string;
}

export async function tidyAndExtract(input: TidyInput): Promise<TidyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to use Tidy & extract.",
    );
  }

  const client = new Anthropic({ apiKey });

  const userMsg = [
    `Channel: ${CHANNEL_LABELS[input.channel]}.`,
    input.studentName ? `Student: ${input.studentName}.` : null,
    input.parentName ? `Parent: ${input.parentName}.` : null,
    "Raw notes:",
    input.rawNotes,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return parseTidyResult(text);
}

// The model is instructed to return raw JSON, but parse defensively in case it
// wraps the object in markdown fences or stray prose.
export function parseTidyResult(text: string): TidyResult {
  let candidate = text.trim();

  // Strip ```json ... ``` fences if present.
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidate = fenced[1].trim();

  // Fall back to the first {...} span.
  if (!candidate.startsWith("{")) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      candidate = candidate.slice(start, end + 1);
    }
  }

  let raw: unknown;
  try {
    raw = JSON.parse(candidate);
  } catch {
    throw new Error("The AI response was not valid JSON. Try again.");
  }

  const obj = (raw ?? {}) as Record<string, unknown>;
  const summary = typeof obj.summary === "string" ? obj.summary.trim() : "";

  const action_items = Array.isArray(obj.action_items)
    ? obj.action_items
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  const sfuRaw = (obj.suggested_follow_up ?? {}) as Record<string, unknown>;
  const due_in_days =
    typeof sfuRaw.due_in_days === "number" && Number.isFinite(sfuRaw.due_in_days)
      ? Math.max(0, Math.round(sfuRaw.due_in_days))
      : null;
  const note =
    typeof sfuRaw.note === "string" && sfuRaw.note.trim()
      ? sfuRaw.note.trim()
      : null;

  return {
    summary,
    action_items,
    suggested_follow_up: { due_in_days, note },
  };
}
