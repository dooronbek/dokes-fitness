import { supabaseServer } from "./supabase";

export type Quote = { text: string; author: string | null };

export const FALLBACK_QUOTE: Quote = {
  text: "Today: one rep, one meal, one decision better than yesterday.",
  author: null,
};

// Fetches one random quote without loading all texts. Used by the splash
// (server component) and the random-quote API route. Falls back to a
// hardcoded quote so the splash never breaks if the table is empty or the
// query fails.
export async function getRandomQuote(): Promise<Quote> {
  try {
    const sb = supabaseServer();
    const { count, error: countErr } = await sb
      .from("quotes")
      .select("*", { count: "exact", head: true });
    if (countErr || !count || count === 0) return FALLBACK_QUOTE;

    const offset = Math.floor(Math.random() * count);
    const { data, error } = await sb
      .from("quotes")
      .select("text, author")
      .order("id", { ascending: true })
      .range(offset, offset);
    if (error || !data || data.length === 0) return FALLBACK_QUOTE;

    return {
      text: typeof data[0].text === "string" ? data[0].text : FALLBACK_QUOTE.text,
      author: typeof data[0].author === "string" ? data[0].author : null,
    };
  } catch {
    return FALLBACK_QUOTE;
  }
}
