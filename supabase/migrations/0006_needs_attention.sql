-- ===========================================================================
-- 0006 — "who needs attention": students you've talked to before but have
-- gone quiet on (last contact older than N days). Run after 0005.
-- ===========================================================================

-- SECURITY INVOKER (default) so RLS applies for the app client; the daily
-- digest cron calls it with the service role and passes the owner explicitly.
create or replace function students_needing_attention(
  p_owner uuid,
  p_days int default 30,
  p_limit int default 100
)
returns table (id uuid, full_name text, level text, last_contact timestamptz, days_since int)
language sql stable
as $$
  select s.id, s.full_name, s.level,
         max(i.occurred_at) as last_contact,
         extract(day from now() - max(i.occurred_at))::int as days_since
  from students s
  join interactions i on i.student_id = s.id and i.owner_id = p_owner
  where s.owner_id = p_owner
  group by s.id, s.full_name, s.level
  having max(i.occurred_at) < now() - make_interval(days => p_days)
  order by max(i.occurred_at) asc
  limit greatest(p_limit, 1);
$$;
