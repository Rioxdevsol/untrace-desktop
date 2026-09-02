import { useState, useEffect } from "react";
import { getSettings, updateSettings, unpairDevice } from "../lib/commands";
import type { DeviceInfo, Settings } from "../lib/types";

interface Props {
  device: DeviceInfo | null;
  onUnpair: () => void;
}

export function SettingsPanel({ device, onUnpair }: Props) {
  const [settings, setSettings] = useState<Settings>({
    auto_connect: false,
    launch_on_boot: false,
    kill_switch: true,
    selected_node_id: null,
  });
  const [unpairConfirm, setUnpairConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
  }, []);

  async function toggle(key: keyof Settings) {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    setSaving(true);
    try {
      await updateSettings(updated);
    } catch {
      // revert on error
      setSettings(settings);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpair() {
    try {
      await unpairDevice();
      onUnpair();
    } catch {
      // ignore
    }
  }

  return (
    <div className="px-5 py-6 animate-fade-in">
      <h2 className="text-lg font-semibold mb-1">Settings</h2>
      <p className="text-xs text-text-secondary mb-6">
        Configure your Untrace client.
      </p>

      {/* Connection settings */}
      <Section title="Connection">
        <Toggle
          label="Auto-connect on launch"
          description="Establish tunnel automatically when Untrace starts"
          enabled={settings.auto_connect}
          onChange={() => toggle("auto_connect")}
        />
        <Toggle
          label="Launch on system start"
          description="Start Untrace when you log into your computer"
          enabled={settings.launch_on_boot}
          onChange={() => toggle("launch_on_boot")}
        />
      </Section>

      {/* Security settings */}
      <Section title="Security">
        <Toggle
          label="Kill switch"
          description="Block all internet traffic if the tunnel drops unexpectedly"
          enabled={settings.kill_switch}
          onChange={() => toggle("kill_switch")}
        />
      </Section>

      {/* Device info */}
      <Section title="Device">
        <div className="space-y-2 mb-4">
          <InfoRow label="Name" value={device?.name ?? "—"} />
          <InfoRow label="ID" value={device?.id?.slice(0, 12) ?? "—"} mono />
          <InfoRow label="Tunnel IP" value={device?.ipAddress ?? "—"} mono />
          <InfoRow label="Node" value={device?.nodeId ?? "auto"} mono />
        </div>

        {/* Unpair button */}
        {!unpairConfirm ? (
          <button
            onClick={() => setUnpairConfirm(true)}
            className="w-full py-2.5 text-xs font-medium rounded-lg border border-border hover:border-danger/50 hover:text-danger transition-colors"
          >
            Unpair Device
          </button>
        ) : (
          <div className="p-3 rounded-lg bg-danger/5 border border-danger/20">
            <p className="text-xs text-danger mb-3">
              This will remove this device from Untrace. You will need to pair
              again from the dashboard.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleUnpair}
                className="flex-1 py-2 text-xs font-medium rounded-lg bg-danger text-white hover:bg-danger/90 transition-colors"
              >
                Confirm Unpair
              </button>
              <button
                onClick={() => setUnpairConfirm(false)}
                className="flex-1 py-2 text-xs font-medium rounded-lg border border-border hover:border-border-bright transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* About */}
      <Section title="About">
        <div className="space-y-2">
          <InfoRow label="Version" value="0.1.0" />
          <InfoRow label="Build" value="phase-1" />
          <InfoRow label="Engine" value="userspace tunnel" />
        </div>
      </Section>

      {saving && (
        <p className="text-[10px] text-text-dim font-mono text-center mt-4">
          saving...
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-[10px] font-mono tracking-widest text-text-dim uppercase mb-3 px-1">
        {title}
      </h3>
      <div className="p-4 rounded-lg bg-bg-surface border border-border">
        {children}
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
      <div className="pr-4">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        <div className="text-[11px] text-text-dim mt-0.5">{description}</div>
      </div>
      <button
        onClick={onChange}
        className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
          enabled ? "bg-accent" : "bg-bg-elevated border border-border"
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-dim">{label}</span>
      <span className={`text-text-secondary ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
