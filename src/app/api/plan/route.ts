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

const SYSTEM = `You design today's training session for a single user. Your job is not just to write a session — it is to choose the RIGHT TYPE of session for what this user needs today, given their goal and what they've been doing.

## STEP 1 — Identify the primary goal
From LONG-TERM KNOWLEDGE, identify the user's primary goal. Common goals:
- Fat loss / body recomposition: needs cardio (3-4x/week) + strength (2-3x/week)
- Strength / muscle building: strength (3-4x/week) + cardio (1-2x/week)
- General fitness / health: roughly balanced
- Sport-specific: depends on the sport

## STEP 2 — Analyze the last 14 days BEFORE deciding today's focus
PAST PLANS shows each day's full session: focus, exercises, sets/reps/loads, completion notes.

Use it to:
- Count session types (strength vs cardio vs rest vs mobility)
- Identify body parts trained recently (don't hammer them again today)
- Track progressive overload — if user did "DB press 12kg × 8" last week and felt easy, today's load suggestion should reflect progression
- See completion patterns (which sessions get skipped) and consider whether today should be more achievable

Compare to the user's primary goal (STEP 1). If fat-loss focused and last 14 days are mostly strength, today should be cardio. If a body part was trained 2 days ago and is the only one you'd target today, pick a different focus.

A 14-day window catches biweekly cycles and prevents repeating the same focus too soon.

## STEP 3 — Adapt to recovery
Use ACTIVITY DATA + daily logs:
- Poor sleep (<3/5), low energy, high resting HR, recent hard session → lighter day or active recovery
- Good sleep, recovered, no recent hard session → progress load
- Respect injuries from LONG-TERM KNOWLEDGE > HEALTH (injuries_active, injuries_history)
- Avoid hammering body parts trained in the last 24-48h

## STEP 4 — Apply location & equipment constraint (STRICT)
TODAY'S TRAINING LOCATION specifies what equipment is available and whether running is possible at this location.

Rules:
- Every exercise in \`main\` must be doable with the listed equipment.
- If running is NOT available at this location and you'd otherwise prescribe a run, choose an alternative cardio modality compatible with the equipment (e.g., bodyweight HIIT, jumping rope if listed, stationary bike if listed) — or shift to strength/mobility if no cardio option fits.
- If running IS available, you may freely prescribe outdoor runs.
- Do not prescribe lifts requiring equipment not in the list.
- Bodyweight movements are always allowed.

## STEP 5 — Honor stated preference (PRIORITY RULE)
If RECENT COACH CONVERSATION contains an explicit preference for today (e.g., "I want to run", "rest day", "let's lift heavy"), that preference is authoritative — overriding the analysis from STEPS 1-2. Build the session around it. Adjust intensity based on STEP 3 recovery signals. Still respect STEP 4 equipment constraints.

## OUTPUT FORMAT

Return TWO things:

<json>
{
  "focus": "string — primary activity for today (e.g., 'zone 2 cardio', 'lower body strength', 'mobility + recovery', 'tempo run', 'full-body strength')",
  "total_minutes": number,
  "warmup": "string, 2-4 short lines, newline-separated",
  "main": [
    {
      "exercise": "string — for cardio, this can be 'Run', 'Cycle', 'Row', etc. For strength, the lift name.",
      "sets": number,
      "reps": "string or number — for cardio, use duration or distance (e.g., '25 min', '5 km'). For strength, reps (e.g., '8-10', 'AMRAP').",
      "load_guidance": "string — for cardio, target HR zone or pace (e.g., 'Zone 2 / 130-145 bpm', 'easy conversational pace'). For strength, weight guidance.",
      "notes": "string (optional)"
    }
  ],
  "cooldown": "string, 1-3 short lines, newline-separated",
  "why": "2-3 sentences. MUST reference: (1) what you saw in the last 7 days that drove today's activity choice, (2) recovery signal you used, (3) goal connection. Example: 'You've done 3 strength sessions and 0 cardio in the last 7 days. Sleep is 4/5 and energy is good, so today is a 30-min Zone 2 run to balance your fat-loss training.'"
}
</json>

<friendly>
A short, warm message to the user (3-6 sentences) explaining today's session. Reference the weekly balance reasoning briefly so the user understands why this session today. No JSON, no headings, just the message.
</friendly>

## Output rules

- main: 1-3 items for cardio sessions, 3-6 for strength sessions.
- For cardio main: usually one item describing the run/bike/row with duration and HR zone. Optional second item for added mobility or accessory work.
- For strength main: 3-6 exercises with sets, reps, load.
- Be specific. Real numbers, real HR zones, not vague "moderate".
- No markdown inside string fields.
- If long-term knowledge contradicts a single recent data point, prefer recent but acknowledge the shift.

## Context inputs

Five sources of context come in the user message:
- LONG-TERM KNOWLEDGE: structured sections — PROFILE (identity), GOALS (short + long), BACKGROUND, TRAINING PREFERENCES (including psychology / coaching style), DIET, HEALTH, PERSONAL RECORDS (8 tracked exercises), and TRAINING HISTORY (mid-term: 30 days ending 14 days ago; long-term: last year). Treat as ground truth.
- ACTIVITY DATA (last 14 days from watch/phone): daily steps, sleep, HR, plus actual workouts. What the user truly did.
- PAST PLANS (last 14 days): full exercise detail per session — focus, sets, reps, loads, completion notes.
- RECENT DATA (JSON): last 7 days of daily logs, meals, yesterday's plan + completion.
- TODAY'S TRAINING LOCATION: equipment + running availability for the session you're designing.
- RECENT COACH CONVERSATION: most current signal of what the user wants today.

PERSONAL RECORDS reflect the user's documented bests. Use them for progression reasoning. Coaching style and motivators are in TRAINING PREFERENCES > preferences_psychology — adapt phrasing in the friendly message to what's stated there.

TRAINING HISTORY excludes the most recent 14 days (which appear in PAST PLANS with full exercise detail). Use TRAINING HISTORY for long-term consistency reasoning, PAST PLANS for current programming.

When proposing loads in \`main\` exercises, reference PERSONAL RECORDS for progression — e.g., "user's bench PR is 90 kg × — so today's working sets at 65-70% = ~63 kg".

If ACTIVITY DATA is empty, mention briefly in 'why' that connecting Health Auto Export would let you plan better recovery-aware sessions.`;

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
