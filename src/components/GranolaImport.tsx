"use client";

import { useState, useTransition } from "react";
import {
  listGranolaNotesAction,
  previewGranolaNoteAction,
} from "@/app/actions/interactions";
import type { Parent, Channel, TidyResult } from "@/lib/types";
import { Button, Card, Badge, EmptyState } from "./ui";
import { LogConversationForm } from "./LogConversationForm";
import { formatDate } from "@/lib/dates";

type Tab = "paste" | "browse";

interface GranolaNoteRow {
  id: string;
  title: string;
  date: string | null;
  hasContent: boolean;
}

interface Preview {
  granola_note_id: string;
  title: string;
  date: string | null;
  raw_notes: string;
  tidy: TidyResult;
}

export function GranolaImport({
  parents,
  links,
  defaultChannel,
  apiConfigured,
  defaultPath,
}: {
  parents: Parent[];
  links: { student_id: string; parent_id: string }[];
  defaultChannel: Channel;
  apiConfigured: boolean;
  defaultPath: "paste" | "api";
}) {
  const [tab, setTab] = useState<Tab>(defaultPath === "api" ? "browse" : "paste");

  return (
    <div>
      <div className="mb-5 inline-flex rounded-lg border border-ink-200 bg-white p-1">
        <TabButton active={tab === "paste"} onClick={() => setTab("paste")}>
          Paste (Path B)
        </TabButton>
        <TabButton active={tab === "browse"} onClick={() => setTab("browse")}>
          Browse API (Path A)
        </TabButton>
      </div>

      {tab === "paste" ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-600">
            Copy a Granola note&apos;s summary or transcript, paste it into the
            capture box below, pick the student/parent, then tidy &amp; save.
            Works on any Granola plan.
          </p>
          <LogConversationForm
            parents={parents}
            links={links}
            defaultChannel={defaultChannel}
            prefill={{ source: "granola" }}
          />
        </div>
      ) : (
        <BrowsePath
          parents={parents}
          links={links}
          defaultChannel={defaultChannel}
          apiConfigured={apiConfigured}
        />
      )}
    </div>
  );
}

function BrowsePath({
  parents,
  links,
  defaultChannel,
  apiConfigured,
}: {
  parents: Parent[];
  links: { student_id: string; parent_id: string }[];
  defaultChannel: Channel;
  apiConfigured: boolean;
}) {
  const [notes, setNotes] = useState<GranolaNoteRow[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setError(null);
    startTransition(async () => {
      const res = await listGranolaNotesAction();
      if (!res.ok) {
        setError(res.error ?? "Could not list Granola notes.");
        return;
      }
      setNotes(res.notes ?? []);
    });
  }

  function pick(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await previewGranolaNoteAction(id);
      if (!res.ok || !res.preview) {
        setError(res.error ?? "Could not load that note.");
        return;
      }
      setPreview(res.preview);
    });
  }

  if (!apiConfigured) {
    return (
      <EmptyState
        title="Granola API not configured"
        description="Add GRANOLA_API_KEY (requires a Granola Business/Enterprise plan) to browse notes directly. Until then, use the Paste tab."
      />
    );
  }

  if (preview) {
    return (
      <div className="space-y-3">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Badge tone="accent">Granola</Badge>
            <span className="text-sm font-medium text-ink-800">
              {preview.title}
            </span>
            {preview.date && (
              <span className="text-xs text-ink-500">
                {formatDate(preview.date)}
              </span>
            )}
          </div>
          <button
            onClick={() => setPreview(null)}
            className="mt-2 text-xs text-ink-500 hover:underline"
          >
            ← Back to list
          </button>
        </Card>
        <LogConversationForm
          parents={parents}
          links={links}
          defaultChannel={defaultChannel}
          prefill={{
            rawNotes: preview.raw_notes,
            summary: preview.tidy.summary,
            actionItems: preview.tidy.action_items,
            source: "granola",
            granolaNoteId: preview.granola_note_id,
            suggestedFollowUp: preview.tidy.suggested_follow_up,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button onClick={load} disabled={pending}>
        {pending ? "Loading…" : "Load recent notes"}
      </Button>
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notes && notes.length === 0 && <EmptyState title="No Granola notes found" />}
      {notes && notes.length > 0 && (
        <Card>
          <ul className="divide-y divide-ink-100">
            {notes.map((n) => (
              <li
                key={n.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-800">
                    {n.title}
                  </p>
                  <p className="text-xs text-ink-500">
                    {n.date ? formatDate(n.date) : "no date"}
                    {!n.hasContent && " · no summary/transcript yet"}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => pick(n.id)}
                  disabled={pending || !n.hasContent}
                >
                  Import
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
        active ? "bg-accent-600 text-white" : "text-ink-600 hover:bg-ink-100"
      }`}
    >
      {children}
    </button>
  );
}
