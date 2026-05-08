"use client";

import type { TrainingLocation } from "@/lib/types";

export default function LocationPickerModal({
  locations,
  open,
  busy,
  onClose,
  onPick,
}: {
  locations: TrainingLocation[];
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onPick: (locationId: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-4 flex flex-col gap-3 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Where are you training today?</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-xs text-zinc-400 underline underline-offset-2 disabled:opacity-50"
          >
            Cancel
          </button>
        </header>
        <ul className="flex flex-col gap-2">
          {locations.map((loc) => (
            <li key={loc.id}>
              <button
                type="button"
                onClick={() => onPick(loc.id)}
                disabled={busy}
                className="w-full text-left rounded-xl bg-zinc-900 border border-zinc-800 p-3 hover:border-zinc-600 active:bg-zinc-800 disabled:opacity-50 min-h-[44px]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{loc.name}</span>
                  {loc.running_available && (
                    <span className="text-[10px] uppercase tracking-wider text-emerald-400">
                      🏃 Running
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-1 line-clamp-2">
                  {loc.equipment}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
