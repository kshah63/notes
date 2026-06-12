"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: "◳" },
  { href: "/log", label: "Log conversation", icon: "✎" },
  { href: "/students", label: "Students", icon: "☷" },
  { href: "/teachers", label: "Teachers", icon: "✦" },
  { href: "/granola", label: "Granola import", icon: "⤓" },
  { href: "/roster", label: "Roster import", icon: "⇪" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Nav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-ink-200 bg-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-sm font-bold text-white">
          MV
        </div>
        <div className="text-sm font-semibold text-ink-900">Parent Notes</div>
      </div>

      <form onSubmit={onSearch} className="px-3 pb-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-sm placeholder:text-ink-400 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
        />
      </form>

      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-accent-50 font-medium text-accent-700"
                  : "text-ink-600 hover:bg-ink-100"
              }`}
            >
              <span className="w-4 text-center text-ink-400">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-200 p-3">
        <div className="truncate px-2 pb-2 text-xs text-ink-500" title={userEmail}>
          {userEmail}
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-600 transition hover:bg-ink-100"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
