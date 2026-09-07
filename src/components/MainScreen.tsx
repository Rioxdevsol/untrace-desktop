import { useState, useEffect, useRef } from "react";
import { connectTunnel, disconnectTunnel } from "../lib/commands";
import { formatBytes, formatDuration, regionFlag } from "../lib/utils";
import type { ConnectionStatus, DeviceInfo, ExitNode } from "../lib/types";

interface Props {
  status: ConnectionStatus | null;
  device: DeviceInfo | null;
  nodes: ExitNode[];
  onSelectLocation: () => void;
}

export function MainScreen({ status, device, nodes, onSelectLocation }: Props) {
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const state = status?.state ?? "disconnected";
  const isConnected = state === "connected";
  const isConnecting = state === "connecting";
  const isDisconnecting = state === "disconnecting";
  const isBusy = isConnecting || isDisconnecting || actionLoading;

  // Elapsed timer
  useEffect(() => {
    if (isConnected && status?.connected_since) {
      const update = () => {
        const now = Math.floor(Date.now() / 1000);
        setElapsed(now - (status?.connected_since ?? now));
      };
      update();
      timerRef.current = setInterval(update, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      setElapsed(0);
    }
  }, [isConnected, status?.connected_since]);

  async function handleToggle() {
    setActionLoading(true);
    setError(null);
    try {
      if (isConnected) {
        await disconnectTunnel();
      } else {
        await connectTunnel();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setActionLoading(false);
    }
  }

  const selectedNode = nodes.find(
    (n) => n.id === (status?.selected_node ?? device?.nodeId)
  );

  return (
    <div className="flex flex-col items-center px-6 py-8 animate-fade-in">
      {/* Big connect button — NordVPN style */}
      <div className="relative mb-6 mt-4">
        {/* Outer glow rings when connected */}
        {isConnected && (
          <>
            <div className="absolute inset-[-16px] rounded-full border border-accent/15 animate-pulse-ring" />
            <div className="absolute inset-[-32px] rounded-full border border-accent/8 animate-pulse-ring" style={{ animationDelay: "0.6s" }} />
          </>
        )}

        {/* Spinning ring when connecting */}
        {isConnecting && (
          <div className="absolute inset-[-12px]">
            <svg className="w-full h-full animate-spin-slow" viewBox="0 0 120 120">
              <circle
                cx="60" cy="60" r="56"
                fill="none"
                stroke="#C6F24E"
                strokeWidth="1.5"
                strokeDasharray="80 200"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {/* The big button */}
        <button
          onClick={handleToggle}
          disabled={isBusy}
          className={`relative w-32 h-32 rounded-full flex flex-col items-center justify-center border-2 transition-all duration-500 cursor-pointer ${
            isConnected
              ? "border-accent bg-accent/10 animate-glow-pulse"
              : isConnecting || isDisconnecting
                ? "border-warning/50 bg-warning/5"
                : "border-border hover:border-accent/40 bg-bg-surface hover:bg-accent/5"
          } ${isBusy ? "cursor-wait" : ""}`}
        >
          {isConnected ? (
            <>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C6F24E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <polyline points="9 12 11 14 15 10" />
              </svg>
              <span className="text-[10px] font-mono text-accent mt-1 tracking-wider uppercase">
                protected
              </span>
            </>
          ) : isConnecting ? (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#e8a820" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-[10px] font-mono text-warning mt-1 tracking-wider">
                connecting
              </span>
            </>
          ) : (
            <>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8a8b7e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
              <span className="text-[10px] font-sans font-medium text-text-secondary mt-1.5">
                Connect
              </span>
            </>
          )}
        </button>
      </div>

      {/* Connection timer or tap hint */}
      <div className="text-center mb-4">
        {isConnected ? (
          <p className="text-sm font-mono text-accent/80">{formatDuration(elapsed)}</p>
        ) : isConnecting ? (
          <p className="text-xs font-mono text-text-dim">establishing encrypted tunnel...</p>
        ) : (
          <p className="text-xs text-text-dim">Tap to connect</p>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-danger/10 border border-danger/20 max-w-xs">
          <p className="text-xs text-danger text-center">{error}</p>
        </div>
      )}

      {/* Location selector */}
      <button
        onClick={onSelectLocation}
        className="w-full max-w-xs p-3.5 rounded-xl bg-bg-surface border border-border hover:border-accent/30 transition-colors text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">
              {selectedNode ? regionFlag(selectedNode.id) : "\u{1F30D}"}
            </span>
            <div>
              <div className="text-sm font-medium text-text-primary">
                {selectedNode?.name ?? "Select Server"}
              </div>
              <div className="text-[10px] font-mono text-text-dim mt-0.5">
                {selectedNode
                  ? `${selectedNode.id} · ${selectedNode.load}% load`
                  : "auto-select best server"}
              </div>
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a8b7e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>

      {/* Stats (visible when connected) */}
      {isConnected && (
        <div className="mt-5 w-full max-w-xs animate-fade-in space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="upload"
              value={formatBytes(status?.bytes_sent ?? 0)}
              color="text-accent"
            />
            <StatCard
              label="download"
              value={formatBytes(status?.bytes_received ?? 0)}
              color="text-accent"
            />
          </div>

          {/* IP info */}
          <div className="p-3.5 rounded-xl bg-bg-surface border border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-dim font-mono">tunnel ip</span>
              <span className="text-text-secondary font-mono">
                {status?.tunnel_ip ?? "\u2014"}
              </span>
            </div>
            {status?.real_ip && (
              <div className="flex items-center justify-between text-xs mt-2 pt-2 border-t border-border">
                <span className="text-text-dim font-mono">real ip (hidden)</span>
                <span className="text-text-dim font-mono line-through">
                  {status.real_ip}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disconnect button (when connected) */}
      {isConnected && (
        <button
          onClick={handleToggle}
          disabled={isBusy}
          className="mt-5 px-6 py-2.5 text-xs font-medium rounded-lg bg-danger/10 border border-danger/20 text-danger hover:bg-danger/20 transition-colors"
        >
          Disconnect
        </button>
      )}

      {/* Version + device info */}
      <div className="mt-auto pt-6 w-full max-w-xs">
        <div className="flex items-center justify-center gap-2 text-[10px] font-mono text-text-dim tracking-wider">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-accent" : "bg-text-dim"}`} />
          untrace v0.1.0
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-bg-surface border border-border">
      <div className="text-[10px] font-mono tracking-wider uppercase text-text-dim mb-1">
        {label}
      </div>
      <div className={`text-sm font-mono font-medium ${color}`}>{value}</div>
    </div>
  );
}
