-- ===========================================================================
-- 0003 — settings for the periodic "give me an update" WhatsApp nudge.
-- Run after 0002 in the Supabase SQL editor.
-- ===========================================================================

alter table app_settings
  add column if not exists nudge_enabled    boolean not null default true,
  add column if not exists nudge_start_hour int     not null default 9,   -- local (SGT) hour, inclusive
  add column if not exists nudge_end_hour   int     not null default 21;  -- local (SGT) hour, exclusive

-- reminder_whatsapp_number may now hold a comma-separated list of recipients
-- (you + your dad). No type change needed — it's already text.
