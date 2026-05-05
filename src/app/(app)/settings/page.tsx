import { supabaseServer } from "@/lib/supabase";
import SettingsQuotes from "./SettingsQuotes";

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
  const { data } = await sb
    .from("quotes")
    .select("id, text, author, source, created_at")
    .order("created_at", { ascending: false });

  const quotes = (data ?? []) as QuoteRow[];

  return (
    <div className="px-4 pt-6 pb-6 max-w-xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <SettingsQuotes initialQuotes={quotes} />
    </div>
  );
}
