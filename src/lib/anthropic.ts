import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");
  _client = new Anthropic({ apiKey });
  return _client;
}

export const MODEL = "claude-sonnet-4-5";

export function extractText(
  msg: Anthropic.Messages.Message
): string {
  return msg.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

// Pulls the first balanced JSON object/array out of model output.
export function extractJSON<T = unknown>(text: string): T {
  const trimmed = text.trim();
  // Strip ```json fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  // Find first { ... last }
  const first = candidate.indexOf("{");
  const last = candidate.lastIndexOf("}");
  if (first === -1 || last === -1) {
    throw new Error("No JSON object found in model output");
  }
  return JSON.parse(candidate.slice(first, last + 1)) as T;
}
