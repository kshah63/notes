-- ===========================================================================
-- 0007 — daily teaching confirmations over WhatsApp.
-- Upload a "who taught whom" spreadsheet; at 6 pm SGT each teacher gets their
-- student list on WhatsApp and must confirm it (nudged every 2 h until they
-- do). Run after 0006 in the Supabase SQL editor.
-- ===========================================================================

-- Teachers need a WhatsApp number to receive their list.
alter table teachers add column if not exists phone_e164 text;

-- One batch per uploaded spreadsheet. dispatch_after is the next 6 pm SGT
-- following the upload; the cron sends everything once now >= dispatch_after.
create table if not exists confirmation_batches (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references app_users(id) on delete cascade default auth.uid(),
  taught_on       date not null,                -- the teaching day (SGT) the list covers
  source_filename text,
  status          text not null default 'scheduled'
                  check (status in ('scheduled','dispatched','cancelled')),
  dispatch_after  timestamptz not null,
  dispatched_at   timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists confirmation_batches_owner_idx
  on confirmation_batches (owner_id, created_at desc);
create index if not exists confirmation_batches_due_idx
  on confirmation_batches (status, dispatch_after);

-- One row per (teacher, student) pairing in the upload. Teacher replies flip
-- status: 'confirmed' when vouched for, 'removed' when reported as extra;
-- students the teacher reports as missing are inserted with
-- source = 'teacher_added'.
create table if not exists confirmation_items (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references app_users(id) on delete cascade default auth.uid(),
  batch_id     uuid not null references confirmation_batches(id) on delete cascade,
  teacher_id   uuid not null references teachers(id) on delete cascade,
  student_id   uuid references students(id) on delete set null,
  student_name text not null,
  source       text not null default 'upload'
               check (source in ('upload','teacher_added')),
  status       text not null default 'listed'
               check (status in ('listed','confirmed','removed')),
  created_at   timestamptz not null default now()
);
create index if not exists confirmation_items_batch_idx
  on confirmation_items (batch_id, teacher_id);

-- One row per teacher per batch, created at dispatch time. Tracks the ask →
-- nudge → response lifecycle. phone_e164 is snapshotted at send so inbound
-- replies route even if the teacher's number is edited later.
create table if not exists teacher_confirmations (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references app_users(id) on delete cascade default auth.uid(),
  batch_id      uuid not null references confirmation_batches(id) on delete cascade,
  teacher_id    uuid not null references teachers(id) on delete cascade,
  phone_e164    text,                            -- null → 'unreachable'
  status        text not null default 'sent'
                check (status in ('sent','confirmed','amended','no_response','unreachable')),
  sent_at       timestamptz,
  nudge_count   int not null default 0,
  last_nudged_at timestamptz,
  responded_at  timestamptz,
  response_text text,                            -- raw teacher replies, appended
  created_at    timestamptz not null default now(),
  unique (batch_id, teacher_id)
);
create index if not exists teacher_confirmations_phone_idx
  on teacher_confirmations (phone_e164, sent_at desc);
create index if not exists teacher_confirmations_nudge_idx
  on teacher_confirmations (status, sent_at);

-- RLS — owner-scoped like every other table. The cron and the WhatsApp
-- webhook use the service-role client, which bypasses RLS.
alter table confirmation_batches  enable row level security;
alter table confirmation_items    enable row level security;
alter table teacher_confirmations enable row level security;

drop policy if exists own_rows on confirmation_batches;
create policy own_rows on confirmation_batches
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_rows on confirmation_items;
create policy own_rows on confirmation_items
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_rows on teacher_confirmations;
create policy own_rows on teacher_confirmations
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
