-- לוטי לוט: הקמת טבלת הכרטיסים ב-Supabase
-- מדביקים את כל הקובץ הזה ב-SQL Editor של Supabase ולוחצים Run. פעם אחת וזהו.

create table if not exists public.picks (
  id bigint generated always as identity primary key,
  client_id text not null unique,          -- מזהה אנונימי של הדפדפן: מבטיח כרטיס אחד לכל משתמש
  name text not null default '',           -- כינוי (לא חובה)
  numbers int[] not null,                  -- ששת המספרים (1-37)
  strong int not null,                     -- המספר החזק (1-7)
  created_at timestamptz not null default now()
);

-- מפעילים אבטחת שורות בלי שום policy:
-- המשמעות היא שאף אחד לא יכול לגשת לטבלה מבחוץ,
-- חוץ מהשרת שלנו (הפונקציה ב-Netlify) שמשתמש במפתח service_role.
alter table public.picks enable row level security;
