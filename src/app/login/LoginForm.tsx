"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ next?: string }>;
}) {
  const sp = use(searchParamsPromise);
  const next = sp.next || "/";
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    if (!res.ok) {
      setErr("Wrong password.");
      setBusy(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input
        type="password"
        autoFocus
        autoComplete="current-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="Password"
        className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600"
      />
      {err && <p className="text-sm text-red-400">{err}</p>}
      <button
        type="submit"
        disabled={busy || !pw}
        className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3 disabled:opacity-50 min-h-[44px]"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
