"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  upsertParent,
  linkStudentParent,
  unlinkStudentParent,
} from "@/app/actions/roster";
import { Button, Input, Select, Field } from "./ui";
import type { Parent, PreferredChannel } from "@/lib/types";

export function ParentManager({
  studentId,
  linked,
  allParents,
}: {
  studentId: string;
  linked: Parent[];
  allParents: Parent[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"none" | "existing" | "new">("none");
  const [error, setError] = useState<string | null>(null);

  // New-parent form state
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [preferred, setPreferred] = useState<PreferredChannel>("whatsapp");

  // Existing-parent select state
  const [selectedId, setSelectedId] = useState("");

  const linkedIds = new Set(linked.map((p) => p.id));
  const linkable = allParents.filter((p) => !linkedIds.has(p.id));

  function unlink(parentId: string) {
    startTransition(async () => {
      await unlinkStudentParent(studentId, parentId);
      router.refresh();
    });
  }

  function linkExisting() {
    if (!selectedId) return;
    startTransition(async () => {
      await linkStudentParent(studentId, selectedId);
      setMode("none");
      setSelectedId("");
      router.refresh();
    });
  }

  function createAndLink() {
    setError(null);
    startTransition(async () => {
      const res = await upsertParent({
        full_name: name,
        relationship,
        phone,
        email,
        preferred_channel: preferred,
      });
      if (!res.ok || !res.id) {
        setError(res.error ?? "Could not create parent.");
        return;
      }
      await linkStudentParent(studentId, res.id);
      setMode("none");
      setName("");
      setRelationship("");
      setPhone("");
      setEmail("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {linked.length === 0 && (
        <p className="text-sm text-ink-400">No parents linked yet.</p>
      )}
      {linked.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between rounded-lg border border-ink-100 px-3 py-2"
        >
          <div className="text-sm">
            <Link
              href={`/parents/${p.id}`}
              className="font-medium text-accent-700 hover:underline"
            >
              {p.full_name}
            </Link>
            <span className="text-ink-500">
              {p.relationship ? ` · ${p.relationship}` : ""}
              {p.phone_e164 ? ` · ${p.phone_e164}` : ""}
            </span>
          </div>
          <button
            onClick={() => unlink(p.id)}
            disabled={pending}
            className="text-xs text-ink-400 hover:text-red-600"
          >
            Unlink
          </button>
        </div>
      ))}

      {mode === "none" && (
        <div className="flex gap-2 pt-1">
          {linkable.length > 0 && (
            <Button variant="secondary" onClick={() => setMode("existing")}>
              Link existing parent
            </Button>
          )}
          <Button variant="secondary" onClick={() => setMode("new")}>
            + New parent
          </Button>
        </div>
      )}

      {mode === "existing" && (
        <div className="flex items-end gap-2 rounded-lg border border-ink-200 bg-ink-50 p-3">
          <div className="flex-1">
            <Field label="Parent">
              <Select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">Select…</option>
                {linkable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                    {p.phone_e164 ? ` (${p.phone_e164})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button onClick={linkExisting} disabled={pending || !selectedId}>
            Link
          </Button>
          <Button variant="ghost" onClick={() => setMode("none")}>
            Cancel
          </Button>
        </div>
      )}

      {mode === "new" && (
        <div className="space-y-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Relationship">
              <Input
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="mother / father / guardian"
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
                onChange={(e) =>
                  setPreferred(e.target.value as PreferredChannel)
                }
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
            <Button onClick={createAndLink} disabled={pending || !name.trim()}>
              {pending ? "Saving…" : "Create & link"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
