-- One-time backfill for the structured dossier (run once after deploy).
-- Populates user_profile + personal_records from the legacy free-form
-- coach_knowledge dossier.
--
-- After this runs, drop the legacy `coach_knowledge` table in a follow-up commit.
--
-- Re-run safety: user_profile uses INSERT ... ON CONFLICT (id) DO UPDATE
-- so it always overwrites whatever's there. PRs use ON CONFLICT (exercise)
-- DO NOTHING so existing PRs you've already entered manually stay put.

-- ── User profile ───────────────────────────────────────────────────────────
INSERT INTO public.user_profile (
  id,
  athletic_background,
  current_state,
  primary_goal_short,
  primary_goal_long,
  lifestyle,
  equipment_constraints_general,
  preferences_psychology,
  diet_pattern,
  injuries_active,
  injuries_history,
  other_conditions,
  preferred_session_minutes,
  updated_at
) VALUES (
  1,
  'Solid sports background since childhood with gaps. Age 6-12: gymnastics, swimming, football, boxing, taekwondo, judo. 12-15: street workout. 15-17: gym 2-3x/week. 17-21: judo 2yr, BJJ 2yr. Peak at 20-21: 74kg, competing in BJJ/judo/MMA, training 2x/day, strict 3000kcal diet. MMA -77kg, judo -73kg, BJJ -74kg. From age 22 to now: 3-4 month training cycles followed by 3-4 month gaps with full eating and weight gain. Variety: BJJ, CrossFit, plain gym.',
  'No training for past 4 months. Gained 10kg. Feel weak. Recently did 4km in 28min and was exhausted.',
  'Lose body fat as much as possible.',
  'Be fit, as close to fittest man on earth as possible — fit meaning capable in any physical activity: strength, cardio, muscles, power, stretching.',
  'Entrepreneur (early stage, high stress). Sleep ~8hrs. Family: wife, siblings, parents.',
  'Varies a lot depending on location. Currently ~30min/day available.',
  'WORKED IN PAST: many programs stuck successfully. Would hit walls when life changed (move, new job). DEMOTIVATORS: boring sessions, missing right equipment. MOTIVATORS: photos, UFC, progress, martial arts, body, vanity, health. COACHING STYLE: explain reasoning while talking, not just commands. MISSED WORKOUTS: try to do them on another day combined with that day''s training. STRICT SCHEDULES FAIL: same-time-every-weekday doesn''t work for entrepreneur lifestyle.',
  'A lot of fast food. Eats out 2-4x/day. Won''t cook. Won''t eat pork. Doesn''t drink alcohol.',
  'Mild left shoulder issue when swinging arm.',
  'Back was hurt once. Don''t risk very heavy weights for deadlift.',
  'None.',
  30,
  now()
)
ON CONFLICT (id) DO UPDATE SET
  athletic_background          = EXCLUDED.athletic_background,
  current_state                = EXCLUDED.current_state,
  primary_goal_short           = EXCLUDED.primary_goal_short,
  primary_goal_long            = EXCLUDED.primary_goal_long,
  lifestyle                    = EXCLUDED.lifestyle,
  equipment_constraints_general = EXCLUDED.equipment_constraints_general,
  preferences_psychology       = EXCLUDED.preferences_psychology,
  diet_pattern                 = EXCLUDED.diet_pattern,
  injuries_active              = EXCLUDED.injuries_active,
  injuries_history             = EXCLUDED.injuries_history,
  other_conditions             = EXCLUDED.other_conditions,
  preferred_session_minutes    = EXCLUDED.preferred_session_minutes,
  updated_at                   = now();

-- ── Personal records ───────────────────────────────────────────────────────
-- 1k, push-ups, plank are intentionally not seeded — add via UI when achieved.
-- reps_at_pr left null for the lift PRs; user should fill in via UI if known.
INSERT INTO public.personal_records (exercise, value_numeric, value_unit, reps_at_pr, source, set_at, notes) VALUES
  ('deadlift',      100,    'kg',      NULL, 'manual', CURRENT_DATE, 'Backfilled from old dossier; reps unknown'),
  ('bench_press',    90,    'kg',      NULL, 'manual', CURRENT_DATE, 'Backfilled from old dossier; reps unknown'),
  ('barbell_squat', 110,    'kg',      NULL, 'manual', CURRENT_DATE, 'Backfilled from old dossier; reps unknown'),
  ('pullups',        15,    'reps',    NULL, 'manual', CURRENT_DATE, 'Backfilled from old dossier'),
  ('run_5k',         28.33, 'minutes', NULL, 'manual', CURRENT_DATE, 'Backfilled from old dossier (28:20)')
ON CONFLICT (exercise) DO NOTHING;

NOTIFY pgrst, 'reload schema';
