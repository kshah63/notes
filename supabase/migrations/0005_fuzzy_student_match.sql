-- ===========================================================================
-- 0005 — fuzzy student matching (typo-tolerant) for the picker and the
-- WhatsApp agent. Run after 0004.
-- ===========================================================================

create extension if not exists pg_trgm;

create index if not exists students_full_name_trgm_idx
  on students using gin (full_name gin_trgm_ops);

-- Ranked matches for a name query. SECURITY INVOKER (default) so RLS still
-- applies for the app's user client; the WhatsApp agent calls it with the
-- service role and passes the owner explicitly.
create or replace function match_students(
  p_owner uuid,
  p_query text,
  p_limit int default 5
)
returns table (id uuid, full_name text, level text, school text, score real)
language sql stable
as $$
  select s.id, s.full_name, s.level, s.school,
         greatest(
           similarity(s.full_name, p_query),
           case when s.full_name ilike '%' || p_query || '%' then 1.0 else 0 end
         )::real as score
  from students s
  where s.owner_id = p_owner
    and (
      s.full_name ilike '%' || p_query || '%'
      or similarity(s.full_name, p_query) > 0.25
    )
  order by score desc, s.full_name
  limit greatest(p_limit, 1);
$$;
