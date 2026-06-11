-- ===========================================================================
-- MathVision Parent-Notes — initial schema, RLS, and auth provisioning.
-- Run in the Supabase SQL editor, or via `supabase db push`.
-- ===========================================================================

-- gen_random_uuid() lives in pgcrypto on Supabase.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables (§2 of the build spec)
-- ---------------------------------------------------------------------------

create table if not exists app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique not null,
  full_name   text,
  created_at  timestamptz not null default now()
);

create table if not exists students (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references app_users(id) default auth.uid(),
  full_name    text not null,
  level        text,            -- "Sec 3", "JC1", course code, etc.
  external_ref text,            -- your MV student id, if any — used to match on import
  notes        text,            -- standing notes about the student
  created_at   timestamptz not null default now()
);
create index if not exists students_owner_id_idx on students (owner_id);

create table if not exists parents (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references app_users(id) default auth.uid(),
  full_name         text not null,
  relationship      text,                       -- mother / father / guardian
  phone_e164        text,                       -- WhatsApp number, +65xxxxxxxx
  email             text,
  preferred_channel text not null default 'whatsapp'
                    check (preferred_channel in ('whatsapp','call','email','in_person')),
  created_at        timestamptz not null default now()
);
create index if not exists parents_owner_id_idx on parents (owner_id);

create table if not exists student_parents (
  student_id uuid not null references students(id) on delete cascade,
  parent_id  uuid not null references parents(id)  on delete cascade,
  primary key (student_id, parent_id)
);

create table if not exists interactions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references app_users(id) default auth.uid(),
  student_id      uuid references students(id) on delete set null,
  parent_id       uuid references parents(id)  on delete set null,
  occurred_at     timestamptz not null default now(),
  channel         text not null check (channel in ('call','whatsapp','in_person','video','email')),
  raw_notes       text,            -- what you typed/dictated, or the pasted Granola transcript
  summary         text,            -- AI-tidied summary
  source          text not null default 'manual' check (source in ('manual','granola')),
  granola_note_id text,            -- set when imported
  created_at      timestamptz not null default now()
);
create index if not exists interactions_owner_occurred_idx on interactions (owner_id, occurred_at desc);
create index if not exists interactions_student_idx on interactions (student_id);
create index if not exists interactions_parent_idx on interactions (parent_id);
-- Guard against importing the same Granola meeting twice (per owner).
create unique index if not exists interactions_granola_unique
  on interactions (owner_id, granola_note_id)
  where granola_note_id is not null;

create table if not exists action_items (
  id             uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references interactions(id) on delete cascade,
  text           text not null,
  done           boolean not null default false,
  created_at     timestamptz not null default now()
);
create index if not exists action_items_interaction_idx on action_items (interaction_id);

create table if not exists follow_ups (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references app_users(id) default auth.uid(),
  interaction_id  uuid references interactions(id) on delete set null,
  student_id      uuid references students(id) on delete set null,
  parent_id       uuid references parents(id)  on delete set null,
  due_at          timestamptz not null,
  note            text,
  status          text not null default 'pending' check (status in ('pending','done','cancelled')),
  remind_in_app   boolean not null default true,
  remind_whatsapp boolean not null default false,
  reminded_at     timestamptz,     -- set when the WhatsApp nudge fired → idempotency
  created_at      timestamptz not null default now()
);
create index if not exists follow_ups_owner_due_idx on follow_ups (owner_id, due_at);
create index if not exists follow_ups_status_due_idx on follow_ups (status, due_at);

-- Settings screen (§12). Secrets stay in env vars; this holds editable prefs.
create table if not exists app_settings (
  owner_id                uuid primary key references app_users(id) on delete cascade default auth.uid(),
  reminder_whatsapp_number text,    -- overrides WHATSAPP_TO_NUMBER if set
  default_channel          text not null default 'call'
                           check (default_channel in ('call','whatsapp','in_person','video','email')),
  granola_path             text not null default 'paste'
                           check (granola_path in ('paste','api')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-level security (§3). Everything is scoped to the owner.
-- ---------------------------------------------------------------------------

alter table app_users      enable row level security;
alter table students       enable row level security;
alter table parents        enable row level security;
alter table student_parents enable row level security;
alter table interactions   enable row level security;
alter table action_items   enable row level security;
alter table follow_ups     enable row level security;
alter table app_settings   enable row level security;

-- app_users: a user may see/maintain only their own profile row.
drop policy if exists own_app_user on app_users;
create policy own_app_user on app_users
  using (id = auth.uid()) with check (id = auth.uid());

-- Owner-scoped tables.
drop policy if exists own_rows on students;
create policy own_rows on students
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_rows on parents;
create policy own_rows on parents
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_rows on interactions;
create policy own_rows on interactions
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_rows on follow_ups;
create policy own_rows on follow_ups
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists own_settings on app_settings;
create policy own_settings on app_settings
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- action_items has no owner_id → gate through its interaction.
drop policy if exists own_action_items on action_items;
create policy own_action_items on action_items
  using      (exists (select 1 from interactions i where i.id = interaction_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from interactions i where i.id = interaction_id and i.owner_id = auth.uid()));

-- student_parents has no owner_id → gate through both linked rows.
drop policy if exists own_student_parents on student_parents;
create policy own_student_parents on student_parents
  using (
    exists (select 1 from students s where s.id = student_id and s.owner_id = auth.uid())
    and exists (select 1 from parents p where p.id = parent_id and p.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from students s where s.id = student_id and s.owner_id = auth.uid())
    and exists (select 1 from parents p where p.id = parent_id and p.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Auto-provision an app_users row (and default settings) on signup, so the
-- `default auth.uid()` foreign keys resolve immediately.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_users (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;

  insert into public.app_settings (owner_id)
  values (new.id)
  on conflict (owner_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at fresh on app_settings.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_settings_touch on app_settings;
create trigger app_settings_touch
  before update on app_settings
  for each row execute function public.touch_updated_at();
