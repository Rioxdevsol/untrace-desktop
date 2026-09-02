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

  async function handleConnect() {
    setActionLoading(true);
    setError(null);
    try {
      await connectTunnel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisconnect() {
    setActionLoading(true);
    setError(null);
    try {
      await disconnectTunnel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setActionLoading(false);
    }
  }

  const selectedNode = nodes.find(
    (n) => n.id === (status?.selected_node ?? device?.nodeId)
  );

  return (
    <div className="flex flex-col items-center px-6 py-8 animate-fade-in">
      {/* Connection status indicator */}
      <div className="relative mb-6">
        {/* Pulsing ring when connected */}
        {isConnected && (
          <>
            <div className="absolute inset-[-12px] rounded-full border border-accent/20 animate-pulse-ring" />
            <div className="absolute inset-[-24px] rounded-full border border-accent/10 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
          </>
        )}

        {/* Spinning ring when connecting */}
        {isConnecting && (
          <div className="absolute inset-[-8px]">
            <svg className="w-full h-full animate-spin-slow" viewBox="0 0 100 100">
              <circle
                cx="50" cy="50" r="46"
                fill="none"
                stroke="#00d4aa"
                strokeWidth="1.5"
                strokeDasharray="80 200"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}

        {/* Status circle */}
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center border-2 transition-colors duration-500 ${
            isConnected
              ? "border-accent bg-accent/10"
              : isConnecting || isDisconnecting
                ? "border-warning/50 bg-warning/5"
                : "border-border bg-bg-surface"
          }`}
        >
          {isConnected ? (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          ) : isConnecting ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#e8a820" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6b6b80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          )}
        </div>
      </div>

      {/* State label */}
      <div className="text-center mb-2">
        <h2 className="text-lg font-semibold">
          {isConnected
            ? "Protected"
            : isConnecting
              ? "Establishing Tunnel"
              : isDisconnecting
                ? "Disconnecting"
                : "Not Protected"}
        </h2>
        <p className="text-xs text-text-dim font-mono mt-1">
          {isConnected
            ? formatDuration(elapsed)
            : isConnecting
              ? "negotiating encrypted channel..."
              : "tap to connect"}
        </p>
      </div>

      {/* Connect / Disconnect button */}
      <button
        onClick={isConnected ? handleDisconnect : handleConnect}
        disabled={isBusy}
        className={`mt-4 w-48 py-3 text-sm font-semibold rounded-xl transition-all ${
          isConnected
            ? "bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20"
            : isBusy
              ? "bg-bg-elevated border border-border text-text-dim cursor-not-allowed"
              : "bg-accent text-bg-primary hover:bg-accent-bright"
        }`}
      >
        {isConnecting
          ? "Connecting..."
          : isDisconnecting
            ? "Disconnecting..."
            : isConnected
              ? "Disconnect"
              : "Connect"}
      </button>

      {error && (
        <p className="text-xs text-danger mt-3 text-center max-w-xs animate-fade-in">
          {error}
        </p>
      )}

      {/* Location selector */}
      <button
        onClick={onSelectLocation}
        className="mt-6 w-full max-w-xs p-3 rounded-lg bg-bg-surface border border-border hover:border-border-bright transition-colors text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-base">
              {selectedNode ? regionFlag(selectedNode.id) : "\u{1F30D}"}
            </span>
            <div>
              <div className="text-sm font-medium text-text-primary">
                {selectedNode?.name ?? "Select Location"}
              </div>
              <div className="text-[10px] font-mono text-text-dim mt-0.5">
                {selectedNode ? selectedNode.id : "auto-select"}
              </div>
            </div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b6b80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </button>

      {/* Stats (visible when connected) */}
      {isConnected && (
        <div className="mt-6 w-full max-w-xs animate-fade-in">
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="sent"
              value={formatBytes(status?.bytes_sent ?? 0)}
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 11 12 6 7 11" /><line x1="12" y1="18" x2="12" y2="6" />
                </svg>
              }
            />
            <StatCard
              label="received"
              value={formatBytes(status?.bytes_received ?? 0)}
              icon={
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="7 13 12 18 17 13" /><line x1="12" y1="6" x2="12" y2="18" />
                </svg>
              }
            />
          </div>

          {/* IP info */}
          <div className="mt-3 p-3 rounded-lg bg-bg-surface border border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-dim font-mono">tunnel ip</span>
              <span className="text-text-secondary font-mono">
                {status?.tunnel_ip ?? "—"}
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

      {/* Device info */}
      <div className="mt-6 w-full max-w-xs">
        <div className="flex items-center gap-2 text-[10px] font-mono text-text-dim tracking-wider">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-accent" : "bg-text-dim"}`} />
          {device?.name ?? "unknown device"} / {device?.id?.slice(0, 8) ?? "—"}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="p-3 rounded-lg bg-bg-surface border border-border">
      <div className="flex items-center gap-1.5 text-text-dim mb-1">
        {icon}
        <span className="text-[10px] font-mono tracking-wider uppercase">{label}</span>
      </div>
      <div className="text-sm font-mono font-medium text-text-primary">{value}</div>
    </div>
  );
}
