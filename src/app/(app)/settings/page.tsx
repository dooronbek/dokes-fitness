import { supabaseServer } from "@/lib/supabase";
import SettingsQuotes from "./SettingsQuotes";
import SettingsLocations from "./SettingsLocations";
import type { TrainingLocation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Dokes Fitness" };

type QuoteRow = {
  id: number;
  text: string;
  author: string | null;
  source: string;
  created_at: string;
};

export default async function SettingsPage() {
  const sb = supabaseServer();
  const [quotesRes, locsRes] = await Promise.all([
    sb
      .from("quotes")
      .select("id, text, author, source, created_at")
      .order("created_at", { ascending: false }),
    sb
      .from("training_locations")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  const quotes = (quotesRes.data ?? []) as QuoteRow[];
  const locations = (locsRes.data ?? []) as TrainingLocation[];

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto flex flex-col gap-4">
      <header className="mb-2">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <SettingsLocations initialLocations={locations} />
      <SettingsQuotes initialQuotes={quotes} />
    </div>
  );
}
