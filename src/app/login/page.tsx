import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "./LoginForm";
import { Card } from "@/components/ui";

// Evaluate integration status at request time, not build time.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-600 text-lg font-bold text-white">
            MV
          </div>
          <h1 className="text-xl font-semibold text-ink-900">
            Parent Notes
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Capture, tidy, and recall parent conversations.
          </p>
        </div>

        <Card className="p-6">
          {configured ? (
            <Suspense fallback={<p className="text-sm text-ink-500">Loading…</p>}>
              <LoginForm />
            </Suspense>
          ) : (
            <div className="text-sm text-ink-600">
              <p className="font-medium text-ink-800">Setup needed</p>
              <p className="mt-2">
                Supabase isn&apos;t configured. Add{" "}
                <code className="rounded bg-ink-100 px-1">
                  NEXT_PUBLIC_SUPABASE_URL
                </code>{" "}
                and{" "}
                <code className="rounded bg-ink-100 px-1">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </code>{" "}
                to your environment, then reload. See the README for the full
                setup.
              </p>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
