import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "./supabase/admin";
import { tidyAndExtract } from "./anthropic";
import { CHANNELS, type Channel } from "./types";

// A Claude agent that gives WhatsApp the same use cases as the app: log
// conversations, summarise what's pending, look up a student, set follow-ups.
// Runs server-side from the inbound webhook; all DB access is owner-scoped via
// the admin client (the webhook has no user session).

const MODEL = process.env.WHATSAPP_AGENT_MODEL || "claude-opus-4-8";

type Db = ReturnType<typeof createAdminClient>;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "log_note",
    description:
      "Save something that happened (a parent/student conversation, an update, a meeting). Use whenever the user reports an event or gives notes. It is tidied into a clean summary with action items automatically.",
    input_schema: {
      type: "object",
      properties: {
        notes: { type: "string", description: "What happened, in the user's words." },
        student_name: {
          type: "string",
          description: "Student the note is about, if mentioned.",
        },
        channel: {
          type: "string",
          enum: CHANNELS,
          description: "How it happened. Default whatsapp.",
        },
      },
      required: ["notes"],
    },
  },
  {
    name: "list_todos",
    description:
      "List what's on the user's plate: pending follow-ups (with due dates) and open (unchecked) action items. Use for 'what do I need to do', 'what's pending', 'anything due'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_student_history",
    description:
      "Recent conversation history and open action items for one student. Use for 'what's the latest on X', 'catch me up on X'.",
    input_schema: {
      type: "object",
      properties: { student_name: { type: "string" } },
      required: ["student_name"],
    },
  },
  {
    name: "create_follow_up",
    description:
      "Create a dated reminder. Use for 'remind me to…', 'follow up with… on…'. Reminders also nudge on WhatsApp.",
    input_schema: {
      type: "object",
      properties: {
        note: { type: "string" },
        due_in_days: { type: "number", description: "Days from now. Default 1." },
        student_name: { type: "string" },
      },
      required: ["note"],
    },
  },
  {
    name: "complete_follow_up",
    description:
      "Mark a pending follow-up as done. Match by a few words from its note. If unsure which, ask first.",
    input_schema: {
      type: "object",
      properties: { match: { type: "string" } },
      required: ["match"],
    },
  },
  {
    name: "file_recent_note",
    description:
      "Attach the most recent unfiled note to a student. Use after an ambiguous log_note once the user says which student it was about.",
    input_schema: {
      type: "object",
      properties: { student_name: { type: "string" } },
      required: ["student_name"],
    },
  },
];

export interface WaTurn {
  role: "user" | "assistant";
  content: string;
}

// Load the recent conversation thread for one sender (oldest-first), so the
// agent has multi-turn context.
export async function loadWaHistory(
  db: Db,
  ownerId: string,
  fromNumber: string,
  limit = 12,
): Promise<WaTurn[]> {
  const { data } = await db
    .from("wa_messages")
    .select("role, content")
    .eq("owner_id", ownerId)
    .eq("from_number", fromNumber)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as { role: "user" | "assistant"; content: string }[];
  return rows.reverse();
}

export async function saveWaTurns(
  db: Db,
  ownerId: string,
  fromNumber: string,
  turns: WaTurn[],
): Promise<void> {
  if (turns.length === 0) return;
  await db.from("wa_messages").insert(
    turns.map((t) => ({
      owner_id: ownerId,
      from_number: fromNumber,
      role: t.role,
      content: t.content,
    })),
  );
}

export async function runWhatsAppAgent(
  ownerId: string,
  userText: string,
  history: WaTurn[] = [],
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "AI isn't configured yet (missing API key).";

  const client = new Anthropic({ apiKey });
  const db = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const system = `You are the MathVision assistant, reachable on WhatsApp by a tuition-centre owner and their father. They run many parent/student conversations and need to capture them and stay on top of follow-ups, fast.

Today's date is ${today} (Singapore time).

Behaviour:
- If they describe something that happened, log it with log_note (don't ask permission first).
- If they ask what's pending / to-do, use list_todos and give a tight, scannable summary.
- If they ask about a student, use get_student_history.
- For "remind me…", use create_follow_up.
- If a tool reports needs_clarification with candidates (an ambiguous student name), the note is still saved but unfiled — ask which student, listing the candidates, and when they reply use file_recent_note to attach it.
- Keep replies short and WhatsApp-friendly: a line or two, light use of • bullets and ✓. Confirm what you did. No markdown headers.`;

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userText },
  ];

  for (let i = 0; i < 6; i++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    if (resp.stop_reason !== "tool_use") {
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      return text || "Done.";
    }

    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type === "tool_use") {
        const out = await execTool(
          db,
          ownerId,
          block.name,
          (block.input ?? {}) as Record<string, unknown>,
        );
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(out),
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  return "That needed too many steps — could you rephrase?";
}

async function execTool(
  db: Db,
  ownerId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  try {
    switch (name) {
      case "log_note":
        return await toolLogNote(db, ownerId, input);
      case "list_todos":
        return await toolListTodos(db, ownerId);
      case "get_student_history":
        return await toolStudentHistory(db, ownerId, input);
      case "create_follow_up":
        return await toolCreateFollowUp(db, ownerId, input);
      case "complete_follow_up":
        return await toolCompleteFollowUp(db, ownerId, input);
      case "file_recent_note":
        return await toolFileRecentNote(db, ownerId, input);
      default:
        return { error: `unknown tool ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "tool failed" };
  }
}

interface StudentMatch {
  id: string;
  full_name: string;
  level: string | null;
  score: number;
}

// Fuzzy, typo-tolerant student lookup. Returns a confident match only when one
// candidate clearly stands out; otherwise flags ambiguity so the agent can ask
// "did you mean…?".
async function findStudent(db: Db, ownerId: string, name?: unknown) {
  const q = typeof name === "string" ? name.trim() : "";
  const empty = { match: null, candidates: [] as StudentMatch[], ambiguous: false };
  if (!q) return empty;

  let rows: StudentMatch[] = [];
  const { data, error } = await db.rpc("match_students", {
    p_owner: ownerId,
    p_query: q,
    p_limit: 5,
  });
  if (!error && data) {
    rows = (data as { id: string; full_name: string; level: string | null; score: number }[]).map(
      (r) => ({ id: r.id, full_name: r.full_name, level: r.level, score: r.score }),
    );
  } else {
    // Fallback if migration 0005 isn't applied yet.
    const { data: d2 } = await db
      .from("students")
      .select("id, full_name, level")
      .eq("owner_id", ownerId)
      .ilike("full_name", `%${q}%`)
      .limit(5);
    rows = ((d2 ?? []) as { id: string; full_name: string; level: string | null }[]).map(
      (r) => ({ ...r, score: 1 }),
    );
  }

  if (rows.length === 0) return empty;
  if (rows.length === 1) return { match: rows[0], candidates: rows, ambiguous: false };

  // Confident only when the top candidate clearly dominates.
  const dominant = rows[0].score - rows[1].score > 0.2;
  return {
    match: dominant ? rows[0] : null,
    candidates: rows,
    ambiguous: !dominant,
  };
}

async function toolLogNote(db: Db, ownerId: string, input: Record<string, unknown>) {
  const notes = String(input.notes ?? "").trim();
  if (!notes) return { error: "no notes provided" };
  const channel: Channel = CHANNELS.includes(input.channel as Channel)
    ? (input.channel as Channel)
    : "whatsapp";

  const { match, ambiguous, candidates } = await findStudent(
    db,
    ownerId,
    input.student_name,
  );
  const tidy = await tidyAndExtract({
    channel,
    studentName: match?.full_name,
    rawNotes: notes,
  });

  const { data: interaction, error } = await db
    .from("interactions")
    .insert({
      owner_id: ownerId,
      student_id: match?.id ?? null,
      channel,
      raw_notes: notes,
      summary: tidy.summary,
      source: "manual",
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (tidy.action_items.length > 0) {
    await db.from("action_items").insert(
      tidy.action_items.map((text) => ({
        interaction_id: interaction.id,
        text,
      })),
    );
  }

  const wantedStudent = typeof input.student_name === "string" && input.student_name.trim();
  const needsClarification = Boolean(wantedStudent) && !match && candidates.length > 0;

  return {
    saved: true,
    filed_under: match?.full_name ?? "unfiled",
    needs_clarification: needsClarification || ambiguous,
    candidates:
      needsClarification || ambiguous
        ? candidates.map((c) => (c.level ? `${c.full_name} (${c.level})` : c.full_name))
        : undefined,
    summary: tidy.summary,
    action_items: tidy.action_items,
    suggested_follow_up: tidy.suggested_follow_up,
  };
}

async function toolListTodos(db: Db, ownerId: string) {
  const { data: fu } = await db
    .from("follow_ups")
    .select("note, due_at, student:students(full_name), parent:parents(full_name)")
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .order("due_at", { ascending: true })
    .limit(50);

  const { data: interactions } = await db
    .from("interactions")
    .select("student:students(full_name), action_items(text, done)")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(200);

  const openItems: { text: string; student: string | null }[] = [];
  for (const it of (interactions ?? []) as unknown as {
    student: { full_name: string } | null;
    action_items: { text: string; done: boolean }[];
  }[]) {
    for (const ai of it.action_items ?? []) {
      if (!ai.done) openItems.push({ text: ai.text, student: it.student?.full_name ?? null });
    }
  }

  const followUps = ((fu ?? []) as unknown as {
    note: string | null;
    due_at: string;
    student: { full_name: string } | null;
    parent: { full_name: string } | null;
  }[]).map((f) => ({
    note: f.note,
    due_at: f.due_at,
    about: f.student?.full_name ?? f.parent?.full_name ?? null,
  }));

  return { follow_ups: followUps, open_action_items: openItems.slice(0, 50) };
}

async function toolStudentHistory(db: Db, ownerId: string, input: Record<string, unknown>) {
  const { match, candidates } = await findStudent(db, ownerId, input.student_name);
  if (!match) return { found: false, candidates: candidates.map((c) => c.full_name) };

  const { data } = await db
    .from("interactions")
    .select("occurred_at, channel, summary, action_items(text, done)")
    .eq("owner_id", ownerId)
    .eq("student_id", match.id)
    .order("occurred_at", { ascending: false })
    .limit(5);

  return {
    student: match.full_name,
    recent: (data ?? []).map((d) => ({
      date: d.occurred_at,
      channel: d.channel,
      summary: d.summary,
      open_items: ((d.action_items ?? []) as { text: string; done: boolean }[])
        .filter((a) => !a.done)
        .map((a) => a.text),
    })),
  };
}

async function toolCreateFollowUp(db: Db, ownerId: string, input: Record<string, unknown>) {
  const note = String(input.note ?? "").trim();
  if (!note) return { error: "no note provided" };
  const days = typeof input.due_in_days === "number" ? input.due_in_days : 1;
  const { match } = await findStudent(db, ownerId, input.student_name);
  const due = new Date(Date.now() + days * 86400000);

  const { error } = await db.from("follow_ups").insert({
    owner_id: ownerId,
    student_id: match?.id ?? null,
    due_at: due.toISOString(),
    note,
    remind_in_app: true,
    remind_whatsapp: true,
  });
  if (error) return { error: error.message };
  return { created: true, note, due_at: due.toISOString(), about: match?.full_name ?? null };
}

async function toolFileRecentNote(db: Db, ownerId: string, input: Record<string, unknown>) {
  const { match, candidates } = await findStudent(db, ownerId, input.student_name);
  if (!match) {
    return { filed: false, candidates: candidates.map((c) => c.full_name) };
  }
  const { data } = await db
    .from("interactions")
    .select("id, summary")
    .eq("owner_id", ownerId)
    .is("student_id", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as { id: string; summary: string | null }[];
  if (rows.length === 0) return { filed: false, reason: "no recent unfiled note to file" };

  const { error } = await db
    .from("interactions")
    .update({ student_id: match.id })
    .eq("id", rows[0].id);
  if (error) return { error: error.message };
  return { filed: true, student: match.full_name, summary: rows[0].summary };
}

async function toolCompleteFollowUp(db: Db, ownerId: string, input: Record<string, unknown>) {
  const match = String(input.match ?? "").trim();
  if (!match) return { error: "no match text" };
  const { data } = await db
    .from("follow_ups")
    .select("id, note")
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .ilike("note", `%${match}%`)
    .limit(5);
  const rows = (data ?? []) as { id: string; note: string | null }[];
  if (rows.length === 0) return { done: false, reason: "no pending follow-up matched" };
  if (rows.length > 1)
    return { done: false, ambiguous: rows.map((r) => r.note) };
  await db.from("follow_ups").update({ status: "done" }).eq("id", rows[0].id);
  return { done: true, note: rows[0].note };
}
