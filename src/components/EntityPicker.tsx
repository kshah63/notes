"use client";

import { useEffect, useRef, useState } from "react";
import type { PickerOption } from "@/app/actions/lookup";

// A typeahead picker backed by a server-side search action. Keeps large lists
// (thousands of students) off the client.
export function EntityPicker({
  value,
  onChange,
  search,
  placeholder = "Search…",
}: {
  value: PickerOption | null;
  onChange: (next: PickerOption | null) => void;
  search: (q: string) => Promise<PickerOption[]>;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await search(query);
        if (active) setResults(r);
      } finally {
        if (active) setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, open, search]);

  // Close on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm">
        <span className="truncate text-ink-800">{value.label}</span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
            setOpen(true);
          }}
          className="shrink-0 rounded px-1.5 text-ink-400 hover:text-red-600"
          aria-label="Clear"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-ink-200 bg-white shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-sm text-ink-400">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-ink-400">No matches</div>
          )}
          {results.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onChange(opt);
                setOpen(false);
                setQuery("");
              }}
              className="block w-full truncate px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
