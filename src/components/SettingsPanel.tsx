import { useState, useEffect } from "react";
import { getSettings, updateSettings } from "../lib/commands";
import type { Settings } from "../lib/types";

export function SettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings).catch(console.error);
  }, []);

  async function toggle(key: keyof Settings) {
    if (!settings) return;
    setSaving(true);
    const updated = { ...settings, [key]: !settings[key] };
    try {
      const result = await updateSettings(updated);
      setSettings(result);
    } catch (err) {
      console.error("Settings update failed:", err);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="text-xs font-mono text-text-dim">Loading...</span>
      </div>
    );
  }

  return (
    <div className="px-5 py-6 animate-fade-in">
      <h2 className="text-base font-display tracking-tight uppercase mb-1">
        Settings
      </h2>
      <p className="text-xs text-text-dim mb-6">
        Configure your Untrace client.
      </p>

      <div className="space-y-1">
        <ToggleRow
          label="Auto-reconnect"
          description="Automatically reconnect if the tunnel drops"
          enabled={settings.auto_reconnect}
          onChange={() => toggle("auto_reconnect")}
          disabled={saving}
        />
        <ToggleRow
          label="Launch at login"
          description="Start Untrace when you log in"
          enabled={settings.launch_on_boot}
          onChange={() => toggle("launch_on_boot")}
          disabled={saving}
        />
        <ToggleRow
          label="Kill switch"
          description="Block all traffic if the tunnel disconnects"
          enabled={settings.kill_switch}
          onChange={() => toggle("kill_switch")}
          disabled={saving}
        />
        <ToggleRow
          label="Auto-connect"
          description="Connect automatically when the app starts"
          enabled={settings.auto_connect}
          onChange={() => toggle("auto_connect")}
          disabled={saving}
        />
      </div>

      {/* About section */}
      <div className="mt-8 pt-6 border-t border-border">
        <h3 className="text-xs font-mono tracking-widest text-text-dim uppercase mb-4">
          About
        </h3>
        <div className="space-y-2">
          <InfoRow label="Version" value="0.1.0" />
          <InfoRow label="Protocol" value="Untrace protocol" />
          <InfoRow label="Encryption" value="256-bit" />
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="w-full flex items-center justify-between p-3.5 rounded-xl bg-bg-surface border border-border hover:border-accent/20 transition-colors text-left"
    >
      <div className="pr-4">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        <div className="text-[11px] text-text-dim mt-0.5">{description}</div>
      </div>
      <div
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
          enabled ? "bg-accent" : "bg-border"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-dim font-mono">{label}</span>
      <span className="text-text-secondary font-mono">{value}</span>
    </div>
  );
}
