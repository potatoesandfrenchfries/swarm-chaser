"use client";

import { X } from "lucide-react";
import { PRESETS, getPreset } from "~/lib/config";
import { useChat } from "~/lib/store";

const field =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, updateSettings } = useChat();
  const preset = getPreset(settings.presetId);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Settings"
        className="max-h-full w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Provider</span>
          <select
            className={field}
            value={settings.presetId}
            onChange={(e) => {
              const next = getPreset(e.target.value);
              updateSettings({
                presetId: next.id,
                baseUrl: next.baseUrl,
                model: next.models[0] ?? "",
              });
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Base URL</span>
          <input
            className={field}
            value={settings.baseUrl}
            onChange={(e) => updateSettings({ baseUrl: e.target.value })}
            placeholder="http://localhost:1234/v1"
          />
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">
            API key{!preset.needsKey && " (optional)"}
          </span>
          <input
            type="password"
            autoComplete="off"
            className={field}
            value={settings.apiKey}
            onChange={(e) => updateSettings({ apiKey: e.target.value })}
          />
          <span className="block text-xs text-muted-foreground">
            Stored only in this browser (IndexedDB) and sent only to the
            provider above.
          </span>
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Model</span>
          <input
            className={field}
            list="model-suggestions"
            value={settings.model}
            onChange={(e) => updateSettings({ model: e.target.value })}
          />
          <datalist id="model-suggestions">
            {preset.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>

        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">System prompt</span>
          <textarea
            rows={4}
            className={field}
            value={settings.systemPrompt}
            onChange={(e) => updateSettings({ systemPrompt: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
