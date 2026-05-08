import { NextRequest } from "next/server";
import { isAuthedFromRequest } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase";
import { anthropic, MODEL } from "@/lib/anthropic";
import { coachSystemPrompt, contextBlock, loadCoachContext } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!isAuthedFromRequest(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const userMsg = body.message?.trim();
  if (!userMsg) {
    return new Response(JSON.stringify({ error: "message required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const sb = supabaseServer();
  const ctx = await loadCoachContext({ includeMessages: true, messageLimit: 20 });
  const system = coachSystemPrompt(ctx);

  const history = ctx.recent_messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Persist user message before streaming so refresh doesn't lose it.
  await sb.from("coach_messages").insert({ role: "user", content: userMsg });

  // Inject context as a leading user message; the actual question comes last.
  const messages = [
    { role: "user" as const, content: contextBlock(ctx, { includeTodayPlan: true }) },
    ...history,
    { role: "user" as const, content: userMsg },
  ];

  const stream = await anthropic().messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages,
  });

  const encoder = new TextEncoder();
  let assistantText = "";

  const body$ = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            assistantText += event.delta.text;
            send({ delta: event.delta.text });
          }
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      } catch (e) {
        send({ error: (e as Error).message });
      } finally {
        // Persist assistant message after stream completes.
        if (assistantText.trim()) {
          await sb
            .from("coach_messages")
            .insert({ role: "assistant", content: assistantText });
        }
        controller.close();
      }
    },
  });

  return new Response(body$, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
