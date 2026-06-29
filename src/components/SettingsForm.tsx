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
  const [nudgeEnabled, setNudgeEnabled] = useState(
    settings?.nudge_enabled ?? true,
  );
  const [startHour, setStartHour] = useState(settings?.nudge_start_hour ?? 9);
  const [endHour, setEndHour] = useState(settings?.nudge_end_hour ?? 21);
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
        nudge_enabled: nudgeEnabled,
        nudge_start_hour: startHour,
        nudge_end_hour: endHour,
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

      <Field label="Reminder WhatsApp number(s)">
        <Input
          value={reminderNumber}
          onChange={(e) => setReminderNumber(e.target.value)}
          placeholder="+6591234567, +6598765432"
        />
      </Field>
      <p className="-mt-2 text-xs text-ink-500">
        Who gets follow-up reminders and the periodic check-in. Separate two
        numbers with a comma (you + your dad).
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
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

      <div className="border-t border-ink-100 pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
          <input
            type="checkbox"
            checked={nudgeEnabled}
            onChange={(e) => setNudgeEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-400"
          />
          Send a WhatsApp check-in every 30 min
        </label>
        <div className="mt-3 grid max-w-xs gap-4 sm:grid-cols-2">
          <Field label="From (hour, SGT)">
            <Input
              type="number"
              min={0}
              max={23}
              value={startHour}
              onChange={(e) => setStartHour(Number(e.target.value))}
            />
          </Field>
          <Field label="Until (hour, SGT)">
            <Input
              type="number"
              min={0}
              max={23}
              value={endHour}
              onChange={(e) => setEndHour(Number(e.target.value))}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-ink-500">
          e.g. 9 to 21 = check-ins between 9am and 9pm. Needs Twilio configured.
        </p>
      </div>

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
