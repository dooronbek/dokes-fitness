import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _server: SupabaseClient | null = null;

export function supabaseServer(): SupabaseClient {
  if (_server) return _server;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  _server = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _server;
}

export const MEAL_BUCKET = "meal-photos";
