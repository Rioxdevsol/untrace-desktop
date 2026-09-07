import { useState, useEffect, useCallback, useRef } from "react";
import { MainScreen } from "./components/MainScreen";
import { SettingsPanel } from "./components/SettingsPanel";
import { LocationPicker } from "./components/LocationPicker";
import { getConnectionStatus, getNodes, getDeviceInfo, provisionDevice } from "./lib/commands";
import type { ConnectionStatus, ExitNode, DeviceInfo } from "./lib/types";

type View = "main" | "locations" | "settings";

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [nodes, setNodes] = useState<ExitNode[]>([]);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [view, setView] = useState<View>("main");
  const [initializing, setInitializing] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initial load — auto-provision if needed
  useEffect(() => {
    async function init() {
      try {
        const [s, n, d] = await Promise.all([
          getConnectionStatus(),
          getNodes(),
          getDeviceInfo(),
        ]);
        setStatus(s);
        setNodes(n.nodes);
        setDevice(d);

        // Auto-provision if not yet provisioned
        if (!s.is_provisioned && !d) {
          try {
            const newDevice = await provisionDevice();
            setDevice(newDevice);
          } catch (err) {
            console.error("Auto-provision failed:", err);
          }
        }
      } catch (err) {
        console.error("Init failed:", err);
      } finally {
        setInitializing(false);
      }
    }
    init();
  }, []);

  // Poll status
  useEffect(() => {
    if (initializing) return;

    pollRef.current = setInterval(async () => {
      try {
        const s = await getConnectionStatus();
        setStatus(s);
      } catch {
        // ignore poll errors
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [initializing]);

  const refreshNodes = useCallback(async () => {
    try {
      const n = await getNodes();
      setNodes(n.nodes);
    } catch {
      // keep existing
    }
  }, []);

  // Loading state
  if (initializing) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl border border-accent/20 bg-accent/5 flex items-center justify-center">
            <ShieldIcon className="w-6 h-6 text-accent opacity-60 animate-pulse" />
          </div>
          <span className="text-xs font-mono text-text-dim tracking-widest uppercase">
            initializing
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-bg-primary/80 backdrop-blur-sm" data-tauri-drag-region>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg border border-accent/20 bg-accent/5 flex items-center justify-center">
            <ShieldIcon className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="text-[14px] font-display tracking-tight text-text-primary uppercase">
            untrace
          </span>
        </div>

        <div className="flex items-center gap-1">
          <NavButton
            active={view === "main"}
            onClick={() => setView("main")}
            label="Connection"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </NavButton>
          <NavButton
            active={view === "locations"}
            onClick={() => { setView("locations"); refreshNodes(); }}
            label="Locations"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="10" r="3" />
              <path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z" />
            </svg>
          </NavButton>
          <NavButton
            active={view === "settings"}
            onClick={() => setView("settings")}
            label="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </NavButton>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === "main" && (
          <MainScreen
            status={status}
            device={device}
            nodes={nodes}
            onSelectLocation={() => setView("locations")}
          />
        )}
        {view === "locations" && (
          <LocationPicker
            nodes={nodes}
            selectedId={status?.selected_node ?? null}
            onSelect={() => {
              setView("main");
            }}
          />
        )}
        {view === "settings" && (
          <SettingsPanel />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function NavButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`p-2 rounded-md transition-colors ${
        active
          ? "text-accent bg-accent/10"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
      }`}
    >
      {children}
    </button>
  );
}
