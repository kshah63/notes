-- ===========================================================================
-- 0002 — add School/Courses to students, a teachers directory, and a
-- teacher tag on interactions. Run after 0001 in the Supabase SQL editor.
-- ===========================================================================

-- Students gain School and Courses (Grade continues to use the `level` column).
alter table students add column if not exists school  text;
alter table students add column if not exists courses text;

-- Teachers directory.
create table if not exists teachers (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references app_users(id) default auth.uid(),
  full_name  text not null,
  code       text,
  position   text,
  created_at timestamptz not null default now()
);
create index if not exists teachers_owner_id_idx on teachers (owner_id);

alter table teachers enable row level security;
drop policy if exists own_rows on teachers;
create policy own_rows on teachers
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Tag a logged conversation with the teacher it concerns.
alter table interactions
  add column if not exists teacher_id uuid references teachers(id) on delete set null;
create index if not exists interactions_teacher_idx on interactions (teacher_id);
