import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { anthropic, MODEL, extractJSON, extractText } from "@/lib/anthropic";
import { contextBlock, loadCoachContext } from "@/lib/context";
import { todayISO } from "@/lib/dates";
import type { PlanExercise, TrainingLocation } from "@/lib/types";

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

const SYSTEM = `You design today's training session for a single user.

PRIORITY RULE: If the RECENT COACH CONVERSATION contains a stated preference for today's training (e.g., "I want to run today", "rest day", "let's lift heavy"), treat that preference as authoritative. Build the plan around that activity. Adjust intensity and structure based on recovery signals from activity data and morning logs, but do not override the user's stated choice of activity type.

## STEP 3.5 — Location & equipment constraint (STRICT)
TODAY'S TRAINING LOCATION specifies what equipment is available and whether running is possible at this location.

Rules:
- Every exercise in \`main\` must be doable with the listed equipment.
- If running is NOT available at this location and you'd otherwise prescribe a run, choose an alternative cardio modality compatible with the equipment (e.g., bodyweight HIIT, jumping rope if listed, stationary bike if listed) — or shift to strength/mobility if no cardio option fits.
- If running IS available, you may freely prescribe outdoor runs.
- Do not prescribe lifts requiring equipment not in the list.
- Bodyweight movements are always allowed.

Four sources of context come in the user message:
- LONG-TERM KNOWLEDGE (markdown sections): stable facts about this person — background, PRs, goals, injuries, equipment constraints, preferences, lifestyle. Treat as ground truth.
- ACTIVITY DATA (last 14 days from watch/phone): daily steps, sleep, HR, HRV, plus actual workouts. This is what the user truly did, not just what they said.
- RECENT DATA (<context> JSON): last 7 days of profile, daily logs, meals, and yesterday's plan + completion.
- RECENT COACH CONVERSATION (last messages between user and coach): the most current signal of what the user wants today. The PRIORITY RULE above governs how to use it.

Use all four. If ACTIVITY DATA is empty, mention briefly that connecting Health Auto Export would let you plan better recovery-aware sessions. If long-term knowledge contradicts a single recent data point, prefer the recent data but acknowledge the shift.

Adapt to recovery using ACTIVITY DATA + daily logs together: poor sleep, low HRV, high resting HR, low mood/energy, high soreness, or hard workouts in the last 24-48h → lighter session or active recovery. Long stretch with no workouts and good sleep → progress load. Avoid hammering body parts that were trained recently per ACTIVITY DATA workouts. Respect injuries (from long-term knowledge AND profile.injuries_notes) and equipment constraints.

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

function locationBlock(loc: TrainingLocation): string {
  return [
    "## TODAY'S TRAINING LOCATION",
    loc.name,
    `Equipment available: ${loc.equipment}`,
    `Running available here: ${loc.running_available ? "YES" : "NO"}`,
  ].join("\n");
}

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

  const body = (await req.json().catch(() => ({}))) as {
    force?: boolean;
    replace?: boolean;
    location_id?: string;
  };
  const force = Boolean(body.force ?? body.replace);
  const locationId = body.location_id?.trim();
  if (!locationId) {
    return NextResponse.json(
      { error: "location_id required" },
      { status: 400 }
    );
  }

  const sb = supabaseServer();
  const today = todayISO();

  if (!force) {
    const { data: existing } = await sb
      .from("training_plans")
      .select("id")
      .eq("plan_date", today)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "Plan already exists" }, { status: 409 });
    }
  }

  const { data: locationData, error: locErr } = await sb
    .from("training_locations")
    .select("*")
    .eq("id", locationId)
    .maybeSingle();
  if (locErr) {
    return NextResponse.json({ error: locErr.message }, { status: 500 });
  }
  const location = locationData as TrainingLocation | null;
  if (!location) {
    return NextResponse.json({ error: "location not found" }, { status: 400 });
  }

  const ctx = await loadCoachContext({ includeMessages: true, messageLimit: 10 });
  if (!ctx.profile?.onboarded_at) {
    return NextResponse.json({ error: "Onboarding required" }, { status: 400 });
  }

  const lastUserMsg =
    [...ctx.recent_messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const lastUserPreview = lastUserMsg.replace(/\s+/g, " ").trim().slice(0, 120);

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
            contextBlock(ctx, { includeRecentMessages: 10 }) +
            "\n\n" +
            locationBlock(location) +
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
    location_id: location.id,
  };

  // For force=true we delete the existing row first, so the new insert gets
  // a fresh created_at default (upsert preserves the original timestamp).
  if (force) {
    const { error: delErr } = await sb
      .from("training_plans")
      .delete()
      .eq("plan_date", today);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  const { data: inserted, error: insErr } = await sb
    .from("training_plans")
    .insert(row)
    .select()
    .single();
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  console.log(
    `[plan] generate plan_date=${today} force=${force} location=${location.name} last_user_msg=${JSON.stringify(
      lastUserPreview
    )} focus=${row.focus ?? "?"} duration=${row.total_minutes ?? "?"}`
  );

  return NextResponse.json({ plan: inserted });
}
