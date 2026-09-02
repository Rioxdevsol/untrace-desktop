import { useState } from "react";
import { pairDevice } from "../lib/commands";
import type { DeviceInfo } from "../lib/types";

interface Props {
  onPaired: (device: DeviceInfo) => void;
}

export function PairScreen({ onPaired }: Props) {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePair() {
    if (!token.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await pairDevice(token.trim());
      if (result.success && result.device) {
        onPaired(result.device);
      } else {
        setError(result.error ?? "Pairing failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 bg-bg-primary">
      {/* Logo */}
      <div className="w-16 h-16 rounded-2xl border border-accent/20 bg-accent/5 flex items-center justify-center mb-8">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00d4aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-2">Untrace</h1>
      <p className="text-sm text-text-secondary mb-8 text-center max-w-xs">
        Private network infrastructure.
        <br />
        Pair this device from your dashboard.
      </p>

      {/* Instructions */}
      <div className="w-full max-w-sm mb-8">
        <div className="p-4 rounded-lg bg-bg-surface border border-border">
          <h3 className="text-xs font-mono tracking-widest text-text-dim uppercase mb-3">
            How to pair
          </h3>
          <ol className="space-y-2 text-[13px] text-text-secondary">
            <li className="flex gap-2">
              <span className="text-accent font-mono text-xs mt-0.5">01</span>
              <span>Open the Untrace dashboard in your browser</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent font-mono text-xs mt-0.5">02</span>
              <span>Sign in with your wallet</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent font-mono text-xs mt-0.5">03</span>
              <span>Add a device and copy the pairing token</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent font-mono text-xs mt-0.5">04</span>
              <span>Paste the token below</span>
            </li>
          </ol>
        </div>
      </div>

      {/* Token input */}
      <div className="w-full max-w-sm space-y-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Pairing Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handlePair()}
            placeholder="Paste your device token"
            className="w-full px-4 py-3 text-sm rounded-lg bg-bg-primary border border-border focus:border-accent focus:outline-none transition-colors font-mono"
            autoFocus
          />
        </div>

        {error && (
          <p className="text-sm text-danger animate-fade-in">{error}</p>
        )}

        <button
          onClick={handlePair}
          disabled={!token.trim() || loading}
          className="w-full py-3 text-sm font-semibold rounded-lg bg-accent text-bg-primary hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Pairing...
            </span>
          ) : (
            "Pair Device"
          )}
        </button>
      </div>

      {/* Footer */}
      <p className="text-[10px] font-mono text-text-dim mt-12 tracking-wider">
        untrace v0.1.0
      </p>
    </div>
  );
}
