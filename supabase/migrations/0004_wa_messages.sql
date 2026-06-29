-- ===========================================================================
-- 0004 — rolling conversation memory for the WhatsApp agent, so it can handle
-- multi-turn chats ("yes, do that", "file it under Aiden"). Run after 0003.
-- ===========================================================================

create table if not exists wa_messages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references app_users(id) on delete cascade default auth.uid(),
  from_number text not null,                 -- the WhatsApp sender (E.164), so you and your dad have separate threads
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists wa_messages_lookup_idx
  on wa_messages (owner_id, from_number, created_at desc);

alter table wa_messages enable row level security;
drop policy if exists own_rows on wa_messages;
create policy own_rows on wa_messages
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
