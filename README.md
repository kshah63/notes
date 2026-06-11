# MathVision Parent-Notes

A lightweight personal CRM for parent conversations. Capture a chat (typed,
dictated, or pulled from Granola), have it tidied into a clean summary with
action items, attach it to the student/parent, and set follow-ups that nudge you
in‑app and on WhatsApp. The payoff is the **per-student timeline** — every prior
conversation in one place the next time a parent calls.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth) · Anthropic API
(AI tidy) · Twilio (WhatsApp) · Vercel.

This implements the full build spec: roster import, manual logging with AI
tidy/extract, the student & parent timelines, in‑app follow-ups, Granola import
(paste **and** direct API), and WhatsApp self-nudges via a scheduled job.

---

## What's here

| Area | Where |
|------|-------|
| Database schema, RLS, auth trigger | `supabase/migrations/0001_init.sql` |
| Supabase clients (browser/server/admin) | `src/lib/supabase/*` |
| AI tidy & extract | `src/lib/anthropic.ts` |
| WhatsApp send (Twilio) | `src/lib/whatsapp.ts` |
| Granola direct API client | `src/lib/granola.ts` |
| Server actions | `src/app/actions/*` |
| Read queries | `src/lib/queries.ts` |
| Screens | `src/app/(app)/*` |
| WhatsApp reminder cron | `src/app/api/cron/whatsapp-reminders/route.ts` |

---

## 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of
   `supabase/migrations/0001_init.sql`, and run it. This creates all tables,
   row-level security policies, and a trigger that provisions an `app_users`
   row (plus default settings) whenever someone signs up.
3. **Auth:** under **Authentication → Providers → Email**, keep email enabled.
   For a single-user internal tool the simplest setup is to turn **"Confirm
   email" off** so sign-up logs you straight in. (Leave it on if you'd rather
   confirm via email — you'll just click the link before first sign-in.)
4. From **Settings → API**, copy the **Project URL**, the **anon public** key,
   and the **service_role** key.

## 2. Configure environment

Copy `.env.example` to `.env.local` and fill in at least the Supabase values:

```bash
cp .env.example .env.local
```

Minimum to run the core product (steps 1–4 of the spec):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...      # only needed for the WhatsApp cron
ANTHROPIC_API_KEY=sk-ant-...       # for AI tidy; optional (write summaries by hand otherwise)
ANTHROPIC_MODEL=claude-haiku-4-5   # optional override
```

Granola and WhatsApp keys are optional and can be added later — see below.

## 3. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, create your account, then go to **Roster import**
and upload `sample-roster.csv` to see it populated. The Log, timeline, and
follow-up flows work immediately.

---

## Daily flow

1. **Roster import** — upload a CSV (one row per parent–student pair). Columns
   are auto-mapped; siblings repeat the parent, a second parent repeats the
   student. Re-importing is idempotent (students match on MV ref → name+level;
   parents match on phone → name).
2. **Log conversation** — pick student/parent, set channel + time, type or
   dictate notes, hit **Tidy & extract**. The AI returns a clean summary,
   action items, and an optional suggested follow-up. Review, edit, save. Raw
   notes are always kept alongside the summary.
3. **Timeline** — each student (and each parent, across all their children) has
   a reverse-chronological timeline with channel/date filters and checkable
   action items.
4. **Dashboard** — your pending follow-ups bucketed into Overdue / Due today /
   Upcoming, each with one-tap Done.

---

## Granola import

- **Path B — paste (any plan):** the default. **Granola import → Paste**, drop
  in a note's summary/transcript, pick the student/parent, tidy & save.
- **Path A — direct API (Business/Enterprise plan):** set `GRANOLA_API_KEY`
  (and optionally `GRANOLA_API_BASE`). **Granola import → Browse API** lists
  recent notes; pick one and it's fetched, re-summarised, and ready to save with
  `source = granola`. The `granola_note_id` is recorded with a unique index, so
  the same meeting can't be imported twice.

> Note: Granola's public API field shapes aren't fully documented. The client in
> `src/lib/granola.ts` normalises several likely shapes; if your account returns
> different keys, adjust `normalizeNote` there.

---

## WhatsApp reminders (self-nudges)

v1 sends a reminder to **your own** WhatsApp when a follow-up is due — not to
parents. It runs as a scheduled job, idempotent via `follow_ups.reminded_at`.

**Develop against the Twilio sandbox (no Meta verification needed):**

1. In Twilio, open **Messaging → Try it out → WhatsApp sandbox**. Join it from
   your phone (send the `join …` code to the sandbox number).
2. Set in your env:
   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # the sandbox sender
   WHATSAPP_TO_NUMBER=+65XXXXXXXX                # your number (E.164)
   CRON_SECRET=<long-random-string>
   ```
   On the sandbox, free-form text works inside the 24h window — leave
   `TWILIO_WHATSAPP_TEMPLATE_SID` blank.
3. When you toggle **WhatsApp nudge** on a follow-up and its due time passes,
   the cron sends it.

**Go live later:** move to a verified WhatsApp sender, get a **utility template**
approved (three variables: `{{1}}` parent, `{{2}}` student, `{{3}}` note), and
set `TWILIO_WHATSAPP_TEMPLATE_SID=HX...`. No code change — the sender switches to
the template automatically when that SID is present. (Meta Cloud API direct is a
cheaper later swap.) You can also set the reminder recipient per-user under
**Settings**, which overrides `WHATSAPP_TO_NUMBER`.

**Trigger the job manually** (e.g. to test):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/whatsapp-reminders
```

---

## Deploy to Vercel

1. Push this repo to GitHub and import it in Vercel.
2. Add every environment variable from `.env.example` in the Vercel project
   settings (Production + Preview).
3. `vercel.json` already declares the cron schedule
   (`*/15 * * * *` → `/api/cron/whatsapp-reminders`). When `CRON_SECRET` is set,
   Vercel Cron calls the endpoint with `Authorization: Bearer <CRON_SECRET>`,
   which the route verifies.
4. Deploy. The same Supabase project backs all environments.

---

## Security notes

- All app tables are protected by **row-level security** scoped to
  `owner_id = auth.uid()`. v1 is single-user, but every table already carries
  `owner_id`, so opening to staff later is an additive migration (widen the
  policies / add a sharing table) — no restructuring.
- API keys (Anthropic, Twilio, Granola) live in **environment variables**, never
  in the database or client. The Settings screen shows their status only.
- The `SUPABASE_SERVICE_ROLE_KEY` is used **only** by the server-side cron job
  (it must read due follow-ups across RLS). Never expose it to the client.

---

## Scripts

```bash
npm run dev      # local dev
npm run build    # production build (also typechecks + lints)
npm run start    # run the production build
npm run lint     # eslint
```
