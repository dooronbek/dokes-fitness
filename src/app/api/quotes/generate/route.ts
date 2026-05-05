import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { anthropic, MODEL, extractText } from "@/lib/anthropic";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You generate motivational quotes for a personal fitness app. The user is a former athlete (BJJ, judo, MMA background, current fat-loss goal, entrepreneur with high stress, fighter aesthetic appreciation, training-cycle pattern with gaps).

Generate exactly 10 quotes appropriate for a splash screen shown when they open their fitness PWA. Mix themes across:
- Combat sports / fighter mentality
- Discipline and consistency
- Strength training
- Stoic / philosophical
- Progress and resilience
- Personal grit and entrepreneurship

Rules:
- Each quote 4-25 words. Punchy.
- Do NOT generate any quote semantically similar to ones in the EXISTING POOL below. Different ideas, different angles.
- For "author": only include a name if you are highly confident the quote is correctly attributed (well-known, widely verified). If uncertain, set author to null. Do NOT fabricate or guess attributions. When in doubt, null.
- Skip overused clichés ("no pain no gain", "shoot for the moon").
- Tone: confident, direct, masculine, performance-oriented. Not preachy or self-help-soft.

Return ONLY valid JSON, no preamble:
{"quotes": [{"text": "...", "author": "..." | null}, ...]}`;

type GeneratedQuote = { text: unknown; author: unknown };
type ParsedPayload = { quotes?: GeneratedQuote[] };

function stripFences(s: string): string {
  const fenced = s.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : s).trim();
}

function parsePayload(text: string): ParsedPayload {
  const cleaned = stripFences(text);
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1) {
    throw new Error("No JSON object in model output");
  }
  return JSON.parse(cleaned.slice(first, last + 1)) as ParsedPayload;
}

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseServer();

  try {
    const { data: existing, error: fetchErr } = await sb
      .from("quotes")
      .select("text");
    if (fetchErr) {
      console.error("[quotes] fetch existing failed:", fetchErr.message);
      return NextResponse.json(
        { ok: false, error: "generation_failed" },
        { status: 500 }
      );
    }

    const pool = (existing ?? [])
      .map((r) => (typeof r.text === "string" ? r.text.trim() : ""))
      .filter(Boolean);

    const poolBlock =
      pool.length === 0
        ? "EXISTING POOL: (empty — generate fresh quotes)"
        : "EXISTING POOL (avoid repeating or paraphrasing these):\n" +
          pool.map((t, i) => `${i + 1}. ${t}`).join("\n");

    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: "user", content: poolBlock }],
    });

    const parsed = parsePayload(extractText(msg));
    const items = Array.isArray(parsed.quotes) ? parsed.quotes : [];

    const errors: string[] = [];
    let inserted = 0;
    let duplicates = 0;

    for (const q of items) {
      const text = typeof q.text === "string" ? q.text.trim() : "";
      const author =
        typeof q.author === "string" && q.author.trim() ? q.author.trim() : null;
      if (!text) {
        errors.push("empty text");
        continue;
      }
      if (text.split(/\s+/).length < 4) {
        errors.push(`too short: ${text}`);
        continue;
      }

      const { data: ins, error: insErr } = await sb
        .from("quotes")
        .insert({ text, author, source: "ai_generated" })
        .select("id");
      if (insErr) {
        // Unique violation on text → duplicate
        if (insErr.code === "23505") {
          duplicates += 1;
        } else {
          errors.push(insErr.message);
        }
        continue;
      }
      if (ins && ins.length > 0) inserted += 1;
    }

    console.log(
      `[quotes] generated requested=10 inserted=${inserted} dupes=${duplicates}`
    );

    return NextResponse.json({
      ok: true,
      requested: 10,
      inserted,
      duplicates_skipped: duplicates,
      errors,
    });
  } catch (e) {
    console.error("[quotes] generation failed:", (e as Error).message);
    return NextResponse.json(
      { ok: false, error: "generation_failed" },
      { status: 500 }
    );
  }
}
