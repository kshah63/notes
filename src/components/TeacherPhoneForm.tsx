"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateTeacherPhone } from "@/app/actions/confirmations";
import { Button, Input } from "./ui";

// Inline WhatsApp-number editor on the teacher page. The number is where the
// daily "confirm your students" message lands, so it's kept front and centre.
export function TeacherPhoneForm({
  teacherId,
  phone,
}: {
  teacherId: string;
  phone: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateTeacherPhone(teacherId, value);
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      setValue(res.phone ?? "");
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2">
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder="WhatsApp number, e.g. +6591234567"
        className="w-64"
        inputMode="tel"
      />
      <Button type="submit" disabled={pending || value === (phone ?? "")}>
        {pending ? "Saving…" : "Save"}
      </Button>
      {saved && <span className="text-xs text-emerald-700">Saved ✓</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
