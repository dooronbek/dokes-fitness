import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { anthropic, MODEL, extractJSON, extractText } from "@/lib/anthropic";
import { contextBlock, loadCoachContext } from "@/lib/context";
import { todayISO } from "@/lib/dates";
import type { PlanExercise } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type PlanJSON = {
  focus?: string;
  total_minutes?: number;
  warmup?: string;
  main?: PlanExercise[];
  cooldown?: string;
  why?: string;
  friendly_text?: string;
};

const SYSTEM = `You design today's training session for a single user, based on a structured <context> block (their profile, last 7 days of daily logs, meals, activity, and yesterday's plan + completion).

Adapt to recovery: poor sleep, low mood/energy, high soreness → lighter session or active recovery. Crushing it → progress load. Avoid hammering the same body parts as yesterday if soreness is reported. Respect injuries_notes.

Return TWO things in this exact format:

<json>
{
  "focus": "string (e.g., 'upper push', 'zone 2 + mobility', 'full-body strength')",
  "total_minutes": number,
  "warmup": "string with 2-4 short lines, newline-separated",
  "main": [
    { "exercise": "string", "sets": number, "reps": "string or number (e.g., 8-10, AMRAP, 30s)", "load_guidance": "string", "notes": "string (optional)" }
  ],
  "cooldown": "string with 1-3 short lines, newline-separated",
  "why": "1-2 sentences referencing the actual recent data that drove today's choice"
}
</json>

<friendly>
A short, warm message to the user (3-6 sentences) explaining today's session in their coaching style. No JSON, no headings, just the message.
</friendly>

Rules:
- main: 3-6 exercises typically. Use household/gym equipment compatible with what their activity_level suggests; if unclear, prefer bodyweight + dumbbell variants.
- Be specific. Real numbers, not "moderate weight".
- No markdown inside string fields.`;

function parseSections(text: string): { json: PlanJSON; friendly: string } {
  const jMatch = text.match(/<json>([\s\S]*?)<\/json>/i);
  const fMatch = text.match(/<friendly>([\s\S]*?)<\/friendly>/i);
  if (!jMatch) {
    // Fall back: try to pull the first JSON object out of the whole response.
    const json = extractJSON<PlanJSON>(text);
    return { json, friendly: fMatch?.[1].trim() ?? "" };
  }
  const json = extractJSON<PlanJSON>(jMatch[1]);
  return { json, friendly: fMatch?.[1].trim() ?? "" };
}

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { replace?: boolean };
  const sb = supabaseServer();
  const today = todayISO();

  if (!body.replace) {
    const { data: existing } = await sb
      .from("training_plans")
      .select("id")
      .eq("plan_date", today)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Plan already exists" }, { status: 409 });
    }
  }

  const ctx = await loadCoachContext();
  if (!ctx.profile?.onboarded_at) {
    return NextResponse.json({ error: "Onboarding required" }, { status: 400 });
  }

  let parsed: { json: PlanJSON; friendly: string };
  try {
    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            contextBlock(ctx) +
            "\n\nDesign today's session. Return <json>...</json> then <friendly>...</friendly>.",
        },
      ],
    });
    parsed = parseSections(extractText(msg));
  } catch (e) {
    return NextResponse.json(
      { error: `plan generation: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  const row = {
    plan_date: today,
    focus: parsed.json.focus ?? null,
    total_minutes:
      typeof parsed.json.total_minutes === "number"
        ? Math.round(parsed.json.total_minutes)
        : null,
    warmup: parsed.json.warmup ?? null,
    main: parsed.json.main ?? null,
    cooldown: parsed.json.cooldown ?? null,
    why: parsed.json.why ?? null,
    friendly_text: parsed.friendly || null,
    completed: false,
    completion_notes: null,
  };

  let result;
  if (body.replace) {
    const { data, error } = await sb
      .from("training_plans")
      .upsert(row, { onConflict: "plan_date" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  } else {
    const { data, error } = await sb.from("training_plans").insert(row).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  }

  return NextResponse.json({ plan: result });
}
