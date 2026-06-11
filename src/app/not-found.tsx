import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ink-100 px-4 text-center">
      <p className="text-sm font-medium text-ink-500">404</p>
      <h1 className="text-xl font-semibold text-ink-900">Not found</h1>
      <p className="text-sm text-ink-500">
        That page or record doesn&apos;t exist.
      </p>
      <Link
        href="/dashboard"
        className="mt-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
      >
        Back to dashboard
      </Link>
    </main>
  );
}
