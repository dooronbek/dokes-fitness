"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteMealButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!confirm("Delete this meal?")) return;
    setBusy(true);
    const res = await fetch(`/api/meals/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="self-end text-xs text-zinc-500 underline disabled:opacity-50"
    >
      {busy ? "deleting…" : "delete"}
    </button>
  );
}
