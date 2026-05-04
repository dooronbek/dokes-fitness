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

drop table if exists public.activity cascade;

-- Daily activity summaries (one row per day, source)
create table if not exists public.activity_daily (
  id              bigserial primary key,
  activity_date   date not null,
  source          text not null default 'apple_health',
  steps           integer,
  active_calories integer,
  resting_calories integer,
  total_calories  integer,
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
  avg_hr          integer,
  max_hr          integer,
  notes           text,
  raw_payload     jsonb,
  synced_at       timestamptz not null default now()
);
create index if not exists workouts_date_idx on public.workouts (workout_date desc);
create index if not exists workouts_started_idx on public.workouts (started_at desc);

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

-- Force PostgREST to reload its schema cache (fixes PGRST205 after DDL).
notify pgrst, 'reload schema';
