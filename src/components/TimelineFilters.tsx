"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CHANNELS, CHANNEL_LABELS } from "@/lib/types";

export function TimelineFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-500">
          Channel
        </label>
        <select
          value={params.get("channel") ?? ""}
          onChange={(e) => setParam("channel", e.target.value)}
          className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
        >
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-500">
          From
        </label>
        <input
          type="date"
          value={params.get("from") ?? ""}
          onChange={(e) => setParam("from", e.target.value)}
          className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-ink-500">
          To
        </label>
        <input
          type="date"
          value={params.get("to") ?? ""}
          onChange={(e) => setParam("to", e.target.value)}
          className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
        />
      </div>
      {(params.get("channel") || params.get("from") || params.get("to")) && (
        <button
          onClick={() => router.replace(pathname)}
          className="rounded-lg px-3 py-1.5 text-sm text-ink-500 hover:bg-ink-100"
        >
          Clear
        </button>
      )}
    </div>
  );
}
