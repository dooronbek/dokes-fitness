import { NextRequest, NextResponse } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { anthropic, MODEL, extractJSON, extractText } from "@/lib/anthropic";
import { knowledgeBlock } from "@/lib/context";
import { todayISO } from "@/lib/dates";
import type { CoachKnowledge } from "@/lib/types";

export const runtime = "nodejs";
// Photos are sent to Claude vision in-memory and discarded — never persisted to
// Supabase Storage. The photo_url column is left null but kept in the schema.

type VisionResult = {
  description?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  ai_confidence?: "low" | "medium" | "high";
  ai_notes?: string;
};

const VISION_SYSTEM = `You analyze a photo (and optional user description) of a meal and estimate macronutrients.
Return STRICT JSON only — no prose, no code fences. Schema:
{
  "description": string,            // 4-12 words naming what's on the plate
  "calories": number,               // total kcal for the visible portion
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "ai_confidence": "low" | "medium" | "high",
  "ai_notes": string                // 1-2 short sentences on assumptions, missing context, or uncertainty
}
Rules:
- If portion is ambiguous, assume a typical adult serving and lower ai_confidence.
- If the image is not food or unrecognizable, set ai_confidence to "low" and explain in ai_notes; still produce best-guess numbers (or 0 if truly nothing edible).
- Round numbers to whole integers.`;

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const photo = form.get("photo");
  const userText = (form.get("text") as string | null)?.trim() || null;

  if (!photo && !userText) {
    return NextResponse.json({ error: "Need photo or text" }, { status: 400 });
  }

  const sb = supabaseServer();
  const today = todayISO();

  const { data: knowledgeRow } = await sb
    .from("coach_knowledge")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  const dossier = knowledgeBlock(
    (knowledgeRow ?? null) as CoachKnowledge | null,
    ["diet_reality", "constraints", "goals_short_term", "goals_long_term"]
  );

  type ImgMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  const ALLOWED: ImgMime[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  let imagePart: { type: "base64"; media_type: ImgMime; data: string } | null = null;

  if (photo instanceof File && photo.size > 0) {
    const buf = Buffer.from(await photo.arrayBuffer());
    const rawMime = photo.type || "image/jpeg";
    const mime: ImgMime = (ALLOWED as string[]).includes(rawMime)
      ? (rawMime as ImgMime)
      : "image/jpeg";
    imagePart = {
      type: "base64",
      media_type: mime,
      data: buf.toString("base64"),
    };
  }

  type UserBlock =
    | { type: "image"; source: { type: "base64"; media_type: ImgMime; data: string } }
    | { type: "text"; text: string };
  const userBlocks: UserBlock[] = [];
  if (dossier) {
    userBlocks.push({ type: "text", text: dossier });
  }
  if (imagePart) {
    userBlocks.push({
      type: "image",
      source: imagePart,
    });
  }
  userBlocks.push({
    type: "text",
    text: userText
      ? `User description: ${userText}\n\nReturn the JSON now.`
      : "Return the JSON now.",
  });

  let parsed: VisionResult = {};
  try {
    const msg = await anthropic().messages.create({
      model: MODEL,
      max_tokens: 600,
      system: VISION_SYSTEM,
      messages: [{ role: "user", content: userBlocks }],
    });
    parsed = extractJSON<VisionResult>(extractText(msg));
  } catch (e) {
    return NextResponse.json(
      { error: `vision: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  const row = {
    meal_date: today,
    eaten_at: new Date().toISOString(),
    photo_url: null,
    user_text: userText,
    description: parsed.description ?? null,
    calories: typeof parsed.calories === "number" ? Math.round(parsed.calories) : null,
    protein_g: typeof parsed.protein_g === "number" ? Math.round(parsed.protein_g) : null,
    carbs_g: typeof parsed.carbs_g === "number" ? Math.round(parsed.carbs_g) : null,
    fat_g: typeof parsed.fat_g === "number" ? Math.round(parsed.fat_g) : null,
    ai_confidence: parsed.ai_confidence ?? null,
    ai_notes: parsed.ai_notes ?? null,
  };

  const { data, error } = await sb.from("meals").insert(row).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ meal: data });
}
