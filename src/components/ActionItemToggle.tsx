"use client";

import { useState, useTransition } from "react";
import { toggleActionItem } from "@/app/actions/action-items";

export function ActionItemToggle({
  id,
  text,
  done,
}: {
  id: string;
  text: string;
  done: boolean;
}) {
  const [checked, setChecked] = useState(done);
  const [pending, startTransition] = useTransition();

  function onToggle() {
    const next = !checked;
    setChecked(next);
    startTransition(async () => {
      const res = await toggleActionItem(id, next);
      if (!res.ok) setChecked(!next); // revert on failure
    });
  }

  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={pending}
        className="mt-0.5 h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-400"
      />
      <span className={checked ? "text-ink-400 line-through" : "text-ink-700"}>
        {text}
      </span>
    </label>
  );
}
