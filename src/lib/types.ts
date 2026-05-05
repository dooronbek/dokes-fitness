export type Profile = {
  id: number;
  goals: string | null;
  height_cm: number | null;
  age: number | null;
  sex: string | null;
  activity_level: string | null;
  dietary_preferences: string | null;
  injuries_notes: string | null;
  coaching_style: string | null;
  onboarded_at: string | null;
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
  created_at?: string;
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
  max_hr: number | null;
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

export type CoachKnowledge = {
  id: number;
  background: string | null;
  current_state: string | null;
  personal_records: string | null;
  goals_short_term: string | null;
  goals_long_term: string | null;
  injuries: string | null;
  constraints: string | null;
  diet_reality: string | null;
  preferences: string | null;
  lifestyle: string | null;
  freeform: string | null;
  updated_at: string;
};
