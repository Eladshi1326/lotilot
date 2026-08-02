-- לוטי לוט: סכמת הכרטיסים ב-Supabase
-- כרטיס אחד לכל משתמש בכל הגרלה (אפשר להשתתף בכמה הגרלות ביום)
-- מדביקים ב-SQL Editor ולוחצים Run.

create table if not exists public.picks (
  id bigint generated always as identity primary key,
  client_id text not null,                 -- מזהה אנונימי של הדפדפן ('ai-brain-v1' = המוח)
  game text not null default 'lotto',      -- lotto / chance / 777 / 123
  draw_id integer not null default 0,      -- מספר ההגרלה שהכרטיס משתתף בה
  name text not null default '',           -- כינוי (לא חובה)
  numbers jsonb not null,                  -- המספרים/הקלפים של הכרטיס
  strong int,                              -- המספר החזק (רק בלוטו)
  created_at timestamptz not null default now(),
  constraint picks_client_game_draw_unique unique (client_id, game, draw_id)
);

create index if not exists picks_game_draw_idx on public.picks (game, draw_id);

-- אבטחת שורות בלי policies: רק השרת (מפתח service_role) ניגש לטבלה
alter table public.picks enable row level security;

-- ═══ שדרוג מגרסה קודמת (טבלה שכבר קיימת) — בטוח להריץ שוב ═══
alter table public.picks alter column numbers type jsonb using to_jsonb(numbers);
alter table public.picks alter column strong drop not null;
alter table public.picks add column if not exists game text not null default 'lotto';
alter table public.picks add column if not exists draw_id integer not null default 0;
alter table public.picks drop constraint if exists picks_client_id_key;
alter table public.picks drop constraint if exists picks_client_game_unique;
alter table public.picks drop constraint if exists picks_client_game_draw_unique;
alter table public.picks add constraint picks_client_game_draw_unique unique (client_id, game, draw_id);
create index if not exists picks_game_draw_idx on public.picks (game, draw_id);
