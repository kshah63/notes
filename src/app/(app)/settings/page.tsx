import { getSettings } from "@/lib/queries";
import {
  isAnthropicConfigured,
  isGranolaApiConfigured,
  isTwilioConfigured,
  isSupabaseConfigured,
  ANTHROPIC_MODEL,
} from "@/lib/env";
import { PageHeader, Card, Badge } from "@/components/ui";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <span className="text-sm text-ink-800">{label}</span>
        {detail && <span className="ml-2 text-xs text-ink-500">{detail}</span>}
      </div>
      {ok ? (
        <Badge tone="green">Configured</Badge>
      ) : (
        <Badge tone="amber">Not set</Badge>
      )}
    </div>
  );
}

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Integration status and your preferences."
      />

      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-ink-700">
            Integrations
          </h2>
          <div className="divide-y divide-ink-100">
            <StatusRow label="Supabase (database & auth)" ok={isSupabaseConfigured()} />
            <StatusRow
              label="Anthropic (AI tidy)"
              ok={isAnthropicConfigured()}
              detail={`model: ${ANTHROPIC_MODEL}`}
            />
            <StatusRow
              label="Granola direct API (Path A)"
              ok={isGranolaApiConfigured()}
              detail="paste import always works"
            />
            <StatusRow
              label="Twilio WhatsApp reminders"
              ok={isTwilioConfigured()}
            />
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Keys are read from environment variables. Set them in{" "}
            <code>.env.local</code> (dev) or the Vercel dashboard (prod) and
            redeploy.
          </p>
        </Card>

        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}
