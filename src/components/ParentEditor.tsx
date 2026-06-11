"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertParent } from "@/app/actions/roster";
import { Button, Input, Select, Field } from "./ui";
import type { Parent, PreferredChannel } from "@/lib/types";

export function ParentEditor({ parent }: { parent: Parent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(parent.full_name);
  const [relationship, setRelationship] = useState(parent.relationship ?? "");
  const [phone, setPhone] = useState(parent.phone_e164 ?? "");
  const [email, setEmail] = useState(parent.email ?? "");
  const [preferred, setPreferred] = useState<PreferredChannel>(
    parent.preferred_channel,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await upsertParent({
        id: parent.id,
        full_name: name,
        relationship,
        phone,
        email,
        preferred_channel: preferred,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm text-ink-600 hover:bg-ink-50"
      >
        Edit
      </button>
    );
  }

  return (
    <div className="mt-3 w-full space-y-3 rounded-lg border border-ink-200 bg-ink-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Relationship">
          <Input
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
          />
        </Field>
        <Field label="Phone (WhatsApp)">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+65…"
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Preferred channel">
          <Select
            value={preferred}
            onChange={(e) => setPreferred(e.target.value as PreferredChannel)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="in_person">In person</option>
          </Select>
        </Field>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
