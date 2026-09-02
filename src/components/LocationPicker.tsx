import { regionFlag, regionLabel } from "../lib/utils";
import type { ExitNode } from "../lib/types";

interface Props {
  nodes: ExitNode[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}

export function LocationPicker({ nodes, selectedId, onSelect }: Props) {
  // Group nodes by region
  const regions = new Map<string, ExitNode[]>();
  for (const node of nodes) {
    const r = regionLabel(node.region);
    if (!regions.has(r)) regions.set(r, []);
    regions.get(r)!.push(node);
  }

  return (
    <div className="px-5 py-6 animate-fade-in">
      <h2 className="text-lg font-semibold mb-1">Locations</h2>
      <p className="text-xs text-text-secondary mb-5">
        Select a server location for your encrypted tunnel.
      </p>

      {/* Auto select */}
      <button
        onClick={() => onSelect("")}
        className={`w-full p-3.5 rounded-lg border mb-3 text-left transition-colors ${
          !selectedId
            ? "border-accent/30 bg-accent/5"
            : "border-border bg-bg-surface hover:border-border-bright"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">{"\u{26A1}"}</span>
            <div>
              <div className="text-sm font-medium">Fastest Server</div>
              <div className="text-[10px] font-mono text-text-dim mt-0.5">
                auto-select lowest latency
              </div>
            </div>
          </div>
          {!selectedId && (
            <div className="w-2 h-2 rounded-full bg-accent" />
          )}
        </div>
      </button>

      {/* Node list by region */}
      <div className="space-y-4">
        {[...regions.entries()].map(([region, regionNodes]) => (
          <div key={region}>
            <h3 className="text-[10px] font-mono tracking-widest text-text-dim uppercase mb-2 px-1">
              {region}
            </h3>
            <div className="space-y-1">
              {regionNodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => onSelect(node.id)}
                  disabled={node.status !== "active"}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    selectedId === node.id
                      ? "border-accent/30 bg-accent/5"
                      : node.status !== "active"
                        ? "border-border/50 bg-bg-surface/50 opacity-50 cursor-not-allowed"
                        : "border-border bg-bg-surface hover:border-border-bright"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-base w-6 text-center">
                        {regionFlag(node.id)}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {node.name}
                        </div>
                        <div className="text-[10px] font-mono text-text-dim mt-0.5">
                          {node.id}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Load indicator */}
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1 rounded-full bg-bg-primary overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              node.load < 50
                                ? "bg-accent"
                                : node.load < 80
                                  ? "bg-warning"
                                  : "bg-danger"
                            }`}
                            style={{ width: `${node.load}%` }}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-text-dim w-6 text-right">
                          {node.load}%
                        </span>
                      </div>

                      {selectedId === node.id && (
                        <div className="w-2 h-2 rounded-full bg-accent" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {nodes.length === 0 && (
        <div className="text-center py-12 text-text-dim">
          <p className="text-sm">No servers available</p>
          <p className="text-xs mt-1 font-mono">network is provisioning</p>
        </div>
      )}
    </div>
  );
}
