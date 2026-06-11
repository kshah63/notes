"use client";

import { useState, useTransition } from "react";
import { updateSettings } from "@/app/actions/settings";
import { Button, Card, Input, Select, Field } from "./ui";
import { CHANNELS, CHANNEL_LABELS } from "@/lib/types";
import type { AppSettings, Channel, GranolaPath } from "@/lib/types";

export function SettingsForm({ settings }: { settings: AppSettings | null }) {
  const [reminderNumber, setReminderNumber] = useState(
    settings?.reminder_whatsapp_number ?? "",
  );
  const [defaultChannel, setDefaultChannel] = useState<Channel>(
    settings?.default_channel ?? "call",
  );
  const [granolaPath, setGranolaPath] = useState<GranolaPath>(
    settings?.granola_path ?? "paste",
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateSettings({
        reminder_whatsapp_number: reminderNumber,
        default_channel: defaultChannel,
        granola_path: granolaPath,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="text-sm font-semibold text-ink-700">Preferences</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reminder WhatsApp number (yours)">
          <Input
            value={reminderNumber}
            onChange={(e) => setReminderNumber(e.target.value)}
            placeholder="+65…"
          />
        </Field>
        <Field label="Default channel for new logs">
          <Select
            value={defaultChannel}
            onChange={(e) => setDefaultChannel(e.target.value as Channel)}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Preferred Granola import path">
          <Select
            value={granolaPath}
            onChange={(e) => setGranolaPath(e.target.value as GranolaPath)}
          >
            <option value="paste">Paste (Path B)</option>
            <option value="api">Direct API (Path A)</option>
          </Select>
        </Field>
      </div>
      <p className="text-xs text-ink-500">
        Overrides <code>WHATSAPP_TO_NUMBER</code> for the reminder recipient when
        set. Secrets (API keys) live in environment variables, not here.
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        {saved && <span className="text-sm text-emerald-700">Saved.</span>}
      </div>
    </Card>
  );
}
