"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: "◳" },
  { href: "/log", label: "Log conversation", icon: "✎" },
  { href: "/todos", label: "To-dos", icon: "✓" },
  { href: "/attention", label: "Needs attention", icon: "!" },
  { href: "/students", label: "Students", icon: "☷" },
  { href: "/teachers", label: "Teachers", icon: "✦" },
  { href: "/granola", label: "Granola import", icon: "⤓" },
  { href: "/roster", label: "Roster import", icon: "⇪" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  const navBody = (
    <>
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

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
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
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-200 bg-white md:flex">
        {navBody}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-ink-950/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
            {navBody}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-1.5 text-ink-700 hover:bg-ink-100"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-600 text-xs font-bold text-white">
              MV
            </div>
            <span className="text-sm font-semibold text-ink-900">
              Parent Notes
            </span>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
