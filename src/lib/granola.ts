// Granola Path A — direct REST API import (§6). Requires a Granola
// Business/Enterprise plan and GRANOLA_API_KEY. The public API only returns
// notes that already have a generated summary + transcript.
//
// NOTE: Granola's public API surface is not fully documented publicly. The
// field mapping below is defensive and normalises several likely shapes; if
// your account returns different keys, adjust `normalizeNote` accordingly.

export interface GranolaNote {
  id: string;
  title: string;
  date: string | null; // ISO if available
  summary: string | null;
  transcript: string | null;
}

function getConfig() {
  const apiKey = process.env.GRANOLA_API_KEY;
  const base = process.env.GRANOLA_API_BASE || "https://public-api.granola.ai";
  if (!apiKey) {
    throw new Error(
      "GRANOLA_API_KEY is not set. Use the paste import (Path B) or add the key.",
    );
  }
  return { apiKey, base: base.replace(/\/$/, "") };
}

async function granolaFetch(path: string): Promise<unknown> {
  const { apiKey, base } = getConfig();
  const res = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Granola API error ${res.status}: ${body.slice(0, 300) || res.statusText}`,
    );
  }
  return res.json();
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function normalizeNote(raw: Record<string, unknown>): GranolaNote {
  const id =
    asString(raw.id) ?? asString(raw.note_id) ?? asString(raw.uuid) ?? "";
  const title =
    asString(raw.title) ?? asString(raw.name) ?? "(untitled meeting)";
  const date =
    asString(raw.date) ??
    asString(raw.created_at) ??
    asString(raw.createdAt) ??
    asString(raw.start_time) ??
    null;
  const summary =
    asString(raw.summary) ??
    asString(raw.notes) ??
    (raw.summary && typeof raw.summary === "object"
      ? asString((raw.summary as Record<string, unknown>).text)
      : null);
  const transcript =
    asString(raw.transcript) ??
    (raw.transcript && typeof raw.transcript === "object"
      ? asString((raw.transcript as Record<string, unknown>).text)
      : null);
  return { id, title, date, summary, transcript };
}

function extractArray(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["notes", "data", "results", "items"]) {
      if (Array.isArray(obj[key])) return obj[key] as Record<string, unknown>[];
    }
  }
  return [];
}

export async function listRecentGranolaNotes(
  limit = 20,
): Promise<GranolaNote[]> {
  const payload = await granolaFetch(`/v1/notes?limit=${limit}`);
  return extractArray(payload).map(normalizeNote).filter((n) => n.id);
}

export async function getGranolaNote(id: string): Promise<GranolaNote> {
  const payload = await granolaFetch(`/v1/notes/${encodeURIComponent(id)}`);
  const obj =
    payload && typeof payload === "object" && "note" in payload
      ? ((payload as Record<string, unknown>).note as Record<string, unknown>)
      : (payload as Record<string, unknown>);
  return normalizeNote(obj ?? {});
}
