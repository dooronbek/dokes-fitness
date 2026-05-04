"use client";

import { useEffect, useRef, useState } from "react";
import type { CoachMessage } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string };

export default function CoachChat({ initialMessages }: { initialMessages: CoachMessage[] }) {
  const [messages, setMessages] = useState<Msg[]>(
    initialMessages.map((m) => ({ role: m.role, content: m.content }))
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setErr(null);
    const next: Msg[] = [...messages, { role: "user", content: text }, { role: "assistant", content: "" }];
    setMessages(next);
    setBusy(true);

    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Chat failed");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      // Read SSE-ish stream: lines of "data: <token>\n"
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trimStart();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload) as { delta?: string; error?: string };
            if (obj.error) throw new Error(obj.error);
            if (obj.delta) {
              acc += obj.delta;
              setMessages((cur) => {
                const copy = cur.slice();
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            }
          } catch {
            // ignore parse errors on partial chunks
          }
        }
      }
    } catch (e) {
      setErr((e as Error).message);
      setMessages((cur) => cur.slice(0, -1)); // remove empty assistant placeholder
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)]">
      <header className="px-4 pt-6 pb-3 border-b border-zinc-900">
        <h1 className="text-2xl font-semibold">Coach</h1>
        <p className="text-xs text-zinc-500">Dokes has full context on your last 7 days.</p>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-sm text-zinc-500 text-center mt-12">
            Ask anything. &quot;What should I eat tonight?&quot; · &quot;Why am I sore?&quot; · &quot;Adjust my plan.&quot;
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "self-end bg-zinc-100 text-zinc-900"
                : "self-start bg-zinc-900 text-zinc-100 border border-zinc-800"
            }`}
          >
            {m.content || (m.role === "assistant" && busy ? "…" : "")}
          </div>
        ))}
        {err && <p className="text-sm text-red-400">{err}</p>}
      </div>

      <div
        className="border-t border-zinc-900 px-3 py-3 bg-zinc-950"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <div className="flex gap-2 items-end">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message your coach…"
            className="flex-1 resize-none rounded-2xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600 max-h-32"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || !input.trim()}
            className="rounded-2xl bg-zinc-100 text-zinc-900 px-4 py-3 font-medium disabled:opacity-40 min-h-[44px]"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
