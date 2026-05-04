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

create table if not exists public.activity (
  id              bigserial primary key,
  activity_date   date not null,
  source          text,           -- 'bip6', 'apple_health', 'manual', etc
  type            text,
  duration_min    integer,
  calories        integer,
  steps           integer,
  avg_hr          integer,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists activity_date_idx on public.activity (activity_date);

create table if not exists public.coach_messages (
  id              bigserial primary key,
  role            text not null check (role in ('user','assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists coach_messages_created_at_idx on public.coach_messages (created_at);

-- Force PostgREST to reload its schema cache (fixes PGRST205 after DDL).
notify pgrst, 'reload schema';
