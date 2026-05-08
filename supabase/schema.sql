-- Dokes Fitness — schema. Single-user app, no RLS needed (service role only).
-- Safe to re-run.

create table if not exists public.profile (
  id              integer primary key,           -- always 1 (singleton)
  goals           text,
  height_cm       numeric,
  age             integer,
  sex             text,
  activity_level  text,
  dietary_preferences text,
  injuries_notes  text,
  coaching_style  text,
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.daily_log (
  id              bigserial primary key,
  log_date        date not null unique,
  weight_kg       numeric,
  waist_cm        numeric,
  sleep_hours     numeric,
  sleep_quality   integer,
  mood            integer,
  energy          integer,
  soreness_notes  text,
  notes           text,
  created_at      timestamptz not null default now()
);

alter table public.daily_log
  add column if not exists cold_shower boolean,
  add column if not exists stretching boolean,
  add column if not exists meditation_minutes integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sleep_quality_range') then
    alter table public.daily_log add constraint sleep_quality_range check (sleep_quality is null or sleep_quality between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mood_range') then
    alter table public.daily_log add constraint mood_range check (mood is null or mood between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'energy_range') then
    alter table public.daily_log add constraint energy_range check (energy is null or energy between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'meditation_minutes_nonneg') then
    alter table public.daily_log add constraint meditation_minutes_nonneg check (meditation_minutes is null or meditation_minutes >= 0);
  end if;
end$$;

create table if not exists public.meals (
  id              bigserial primary key,
  meal_date       date not null,
  eaten_at        timestamptz,
  photo_url       text,
  user_text       text,
  description     text,
  calories        integer,
  protein_g       integer,
  carbs_g         integer,
  fat_g           integer,
  ai_confidence   text check (ai_confidence in ('low','medium','high')),
  ai_notes        text,
  created_at      timestamptz not null default now()
);
create index if not exists meals_meal_date_idx on public.meals (meal_date);

create table if not exists public.training_locations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  equipment         text not null,
  running_available boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists public.training_plans (
  id                bigserial primary key,
  plan_date         date not null unique,
  focus             text,
  total_minutes     integer,
  warmup            text,
  main              jsonb,
  cooldown          text,
  why               text,
  friendly_text     text,
  completed         boolean default false,
  completion_notes  text,
  created_at        timestamptz not null default now()
);

alter table public.training_plans
  add column if not exists location_id uuid references public.training_locations(id) on delete set null;

-- Manually-entered avg HR captured at plan completion. HAE workout HR is
-- unreliable (often missing or wrong source), so the user types the watch's
-- actual avg HR when marking the plan done. Optional — null if not entered.
alter table public.training_plans
  add column if not exists avg_hr smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'training_plans_avg_hr_range') then
    alter table public.training_plans add constraint training_plans_avg_hr_range check (avg_hr is null or avg_hr between 30 and 220);
  end if;
end$$;

drop table if exists public.activity cascade;

-- Daily activity summaries (one row per day, source).
--
-- NOTE: resting_calories and total_calories are NOT used by the app. HAE's
-- basal_energy_burned was double-counted across iPhone + Zepp (5-7k kcal/day,
-- ~3x reality), so we ignore it at read time and compute total calories at
-- runtime via Mifflin-St Jeor BMR (see src/lib/calories.ts), which uses the
-- user's profile + most recent logged weight from daily_log. The columns
-- stay in the schema in case we want to keep raw HAE values for diagnostics.
--
-- One-time data cleanup (already run; documented for reproducibility):
--   update activity_daily set resting_calories = null, total_calories = null;
create table if not exists public.activity_daily (
  id              bigserial primary key,
  activity_date   date not null,
  source          text not null default 'apple_health',
  steps           integer,
  active_calories integer,
  resting_calories integer,    -- unused (see note above)
  total_calories  integer,     -- unused (see note above)
  distance_m      integer,
  floors_climbed  integer,
  exercise_minutes integer,
  stand_hours     integer,
  avg_hr          integer,
  resting_hr      integer,
  hrv_ms          numeric,
  sleep_minutes   integer,
  sleep_quality_score integer,
  raw_payload     jsonb,
  synced_at       timestamptz not null default now(),
  unique (activity_date, source)
);
create index if not exists activity_daily_date_idx on public.activity_daily (activity_date desc);

-- Individual workouts (one row per workout)
--
-- HR fields (avg_hr, max_hr) are deliberately NOT stored: HAE derives both
-- from the cooldown sample stream (when the watch is being unstrapped), so
-- both numbers are unreliable. Real avg HR is captured at plan-completion
-- time on training_plans.avg_hr, matched to workouts by date in the UI /
-- coach context. raw_payload still carries HAE's HR fields if we ever want
-- to revisit.
create table if not exists public.workouts (
  id              bigserial primary key,
  external_id     text unique,           -- stable ID from source for idempotency
  source          text not null default 'apple_health',
  workout_date    date not null,
  started_at      timestamptz not null,
  ended_at        timestamptz,
  type            text,                  -- 'running', 'strength', 'walking', etc
  duration_min    integer,
  active_calories integer,
  total_calories  integer,
  distance_m      integer,
  notes           text,
  raw_payload     jsonb,
  synced_at       timestamptz not null default now()
);
create index if not exists workouts_date_idx on public.workouts (workout_date desc);
create index if not exists workouts_started_idx on public.workouts (started_at desc);

-- Drop legacy HR columns from pre-existing deployments. Safe to re-run.
alter table public.workouts drop column if exists avg_hr;
alter table public.workouts drop column if exists max_hr;

create table if not exists public.coach_messages (
  id              bigserial primary key,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists coach_messages_created_at_idx on public.coach_messages (created_at);

create table if not exists public.coach_knowledge (
  id              integer primary key default 1,
  background      text,
  current_state   text,
  personal_records text,
  goals_short_term text,
  goals_long_term  text,
  injuries        text,
  constraints     text,
  diet_reality    text,
  preferences     text,
  lifestyle       text,
  freeform        text,
  updated_at      timestamptz not null default now(),
  check (id = 1)
);
insert into public.coach_knowledge (id) values (1) on conflict (id) do nothing;

create table if not exists public.quotes (
  id           bigserial primary key,
  text         text not null unique,
  author       text,
  source       text not null default 'ai_generated',  -- 'ai_generated' | 'seed' | 'user'
  created_at   timestamptz not null default now()
);
create index if not exists quotes_text_idx on public.quotes (lower(text));

-- Seed with a small starter set so splash works on day one
insert into public.quotes (text, author, source) values
  ('Don''t count the days, make the days count.', 'Muhammad Ali', 'seed'),
  ('Discipline is the bridge between goals and accomplishment.', 'Jim Rohn', 'seed'),
  ('Strength does not come from winning. Your struggles develop your strengths.', 'Arnold Schwarzenegger', 'seed'),
  ('The pain you feel today is the strength you feel tomorrow.', null, 'seed'),
  ('Champions are made when no one is watching.', null, 'seed'),
  ('Hard work beats talent when talent doesn''t work hard.', 'Tim Notke', 'seed'),
  ('Suffer the pain of discipline or suffer the pain of regret.', 'Jim Rohn', 'seed'),
  ('You have power over your mind — not outside events. Realize this, and you will find strength.', 'Marcus Aurelius', 'seed'),
  ('Everyone has a plan until they get punched in the face.', 'Mike Tyson', 'seed'),
  ('What we do in life echoes in eternity.', null, 'seed'),
  ('Discipline is freedom.', 'Jocko Willink', 'seed'),
  ('Pain is temporary. Quitting lasts forever.', 'Lance Armstrong', 'seed'),
  ('Build the body. Earn the focus.', null, 'seed'),
  ('It is not the mountain we conquer, but ourselves.', 'Edmund Hillary', 'seed'),
  ('Today: one rep, one meal, one decision better than yesterday.', null, 'seed')
on conflict (text) do nothing;

-- Force PostgREST to reload its schema cache (fixes PGRST205 after DDL).
notify pgrst, 'reload schema';
