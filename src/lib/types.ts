export type UserProfile = {
  id: 1;
  name: string | null;
  age: number | null;
  height_cm: number | null;
  sex: "male" | "female" | "other" | null;
  primary_goal_short: string | null;
  primary_goal_long: string | null;
  athletic_background: string | null;
  current_state: string | null;
  lifestyle: string | null;
  preferred_training_days_per_week: number | null;
  preferred_session_minutes: number | null;
  equipment_constraints_general: string | null;
  preferences_psychology: string | null;
  diet_pattern: string | null;
  injuries_active: string | null;
  injuries_history: string | null;
  other_conditions: string | null;
  updated_at: string;
};

export type PRExercise =
  | "deadlift"
  | "bench_press"
  | "barbell_squat"
  | "pullups"
  | "pushups"
  | "plank"
  | "run_5k"
  | "run_1k";

export const PR_EXERCISES: readonly PRExercise[] = [
  "deadlift",
  "bench_press",
  "barbell_squat",
  "pullups",
  "pushups",
  "plank",
  "run_5k",
  "run_1k",
];

export type PersonalRecord = {
  id: string;
  exercise: PRExercise;
  value_numeric: number;
  value_unit: "kg" | "reps" | "seconds" | "minutes";
  reps_at_pr: number | null;
  source: "auto" | "manual";
  set_at: string;
  notes: string | null;
  updated_at: string;
};

export type DossierStatsMidterm = {
  workouts_total: number;
  workouts_by_type: {
    strength: number;
    cardio: number;
    mobility: number;
    mixed: number;
    rest: number;
  };
  adherence_completed: number;
  adherence_generated: number;
  avg_session_minutes: number | null;
  avg_hr_by_type: {
    strength: number | null;
    cardio: number | null;
  };
  avg_sleep_quality: number | null;
  avg_energy: number | null;
  avg_resting_hr: number | null;
  weight_delta_kg: number | null;
  waist_delta_cm: number | null;
};

export type DossierStatsLongterm = {
  workouts_total: number;
  workouts_by_type: {
    strength: number;
    cardio: number;
    mobility: number;
    mixed: number;
    rest: number;
  };
  adherence_completed: number;
  adherence_generated: number;
  longest_streak_days: number;
  avg_sleep_quality: number | null;
  avg_resting_hr: number | null;
  weight_start_kg: number | null;
  weight_lowest_kg: number | null;
  weight_current_kg: number | null;
};

export type DossierStats = {
  midterm: DossierStatsMidterm | null;
  longterm: DossierStatsLongterm | null;
  computed_at: string | null;
};

export type DailyLog = {
  id?: number;
  log_date: string; // YYYY-MM-DD
  weight_kg: number | null;
  waist_cm: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  mood: number | null;
  energy: number | null;
  cold_shower: boolean | null;
  stretching: boolean | null;
  meditation_minutes: number | null;
  soreness_notes: string | null;
  notes: string | null;
  created_at?: string;
};

export type Meal = {
  id?: number;
  meal_date: string; // YYYY-MM-DD
  eaten_at?: string | null;
  photo_url: string | null;
  user_text: string | null;
  description: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  ai_confidence: "low" | "medium" | "high" | null;
  ai_notes: string | null;
  created_at?: string;
};

export type TrainingPlan = {
  id?: number;
  plan_date: string; // YYYY-MM-DD
  focus: string | null;
  total_minutes: number | null;
  warmup: string | null;
  main: PlanExercise[] | null;
  cooldown: string | null;
  why: string | null;
  friendly_text: string | null;
  completed: boolean | null;
  completion_notes: string | null;
  avg_hr: number | null;
  location_id: string | null;
  created_at?: string;
};

export type TrainingLocation = {
  id: string;
  name: string;
  equipment: string;
  running_available: boolean;
  created_at: string;
};

export type PlanExercise = {
  exercise: string;
  sets?: number | string;
  reps?: number | string;
  load_guidance?: string;
  notes?: string;
};

export type ActivityDaily = {
  id?: number;
  activity_date: string;
  source: string;
  steps: number | null;
  active_calories: number | null;
  resting_calories: number | null;
  total_calories: number | null;
  distance_m: number | null;
  floors_climbed: number | null;
  exercise_minutes: number | null;
  stand_hours: number | null;
  avg_hr: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  sleep_minutes: number | null;
  sleep_quality_score: number | null;
  raw_payload?: unknown;
  synced_at?: string;
};

export type Workout = {
  id?: number;
  external_id: string | null;
  source: string;
  workout_date: string;
  started_at: string;
  ended_at: string | null;
  type: string | null;
  duration_min: number | null;
  active_calories: number | null;
  total_calories: number | null;
  distance_m: number | null;
  notes: string | null;
  raw_payload?: unknown;
  synced_at?: string;
};

export type CoachMessage = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

