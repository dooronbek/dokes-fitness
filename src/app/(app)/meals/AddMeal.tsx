"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function AddMeal() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pickFile(f: File | null) {
    setFile(f);
    setErr(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    if (!file && !text.trim()) {
      setErr("Add a photo or describe the meal.");
      return;
    }
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    if (file) fd.append("photo", file);
    if (text.trim()) fd.append("text", text.trim());
    const res = await fetch("/api/meals", { method: "POST", body: fd });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error || "Couldn't save meal.");
      return;
    }
    setFile(null);
    setText("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-2xl border border-dashed border-zinc-700 text-zinc-300 py-4 min-h-[64px] active:bg-zinc-900"
      >
        + Add meal
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">New meal</h3>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setFile(null);
            if (preview) URL.revokeObjectURL(preview);
            setPreview(null);
            setText("");
            setErr(null);
          }}
          className="text-xs text-zinc-400 underline"
        >
          cancel
        </button>
      </div>

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="preview" className="w-full max-h-56 object-cover rounded-xl" />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="rounded-xl bg-zinc-800 text-zinc-100 py-3 min-h-[44px]"
      >
        {file ? "Change photo" : "Take / choose photo"}
      </button>

      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Optional: describe what's in it (helps accuracy)"
        className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-base outline-none focus:border-zinc-600"
      />

      {err && <p className="text-sm text-red-400">{err}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="rounded-xl bg-zinc-100 text-zinc-900 font-medium py-3.5 disabled:opacity-50 min-h-[44px]"
      >
        {busy ? "Analyzing…" : "Save meal"}
      </button>
    </div>
  );
}
