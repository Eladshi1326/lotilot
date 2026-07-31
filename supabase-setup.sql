-- לוטי לוט: סכמת הכרטיסים ב-Supabase (כל המשחקים: לוטו, צ'אנס, 777, 123)
-- להתקנה ראשונה: מדביקים הכול ב-SQL Editor ולוחצים Run.

create table if not exists public.picks (
  id bigint generated always as identity primary key,
  client_id text not null,                 -- מזהה אנונימי של הדפדפן
  game text not null default 'lotto',      -- lotto / chance / 777 / 123
  name text not null default '',           -- כינוי (לא חובה)
  numbers jsonb not null,                  -- המספרים/הקלפים של הכרטיס
  strong int,                              -- המספר החזק (רק בלוטו)
  created_at timestamptz not null default now(),
  constraint picks_client_game_unique unique (client_id, game) -- כרטיס אחד לכל משתמש בכל משחק
);

-- אבטחת שורות בלי policies: רק השרת (מפתח service_role) ניגש לטבלה
alter table public.picks enable row level security;

-- ===== שדרוג מגרסה ישנה (טבלה שכבר קיימת עם לוטו בלבד) =====
-- מריצים את השורות האלה אם הטבלה נוצרה לפני תמיכת ריבוי המשחקים:
alter table public.picks alter column numbers type jsonb using to_jsonb(numbers);
alter table public.picks alter column strong drop not null;
alter table public.picks add column if not exists game text not null default 'lotto';
alter table public.picks drop constraint if exists picks_client_id_key;
alter table public.picks drop constraint if exists picks_client_game_unique;
alter table public.picks add constraint picks_client_game_unique unique (client_id, game);
