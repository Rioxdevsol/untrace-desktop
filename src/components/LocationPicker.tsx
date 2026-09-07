import { regionFlag } from "../lib/utils";
import type { ExitNode } from "../lib/types";

interface Props {
  nodes: ExitNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function LocationPicker({ nodes, selectedId, onSelect }: Props) {
  const activeNodes = nodes.filter((n) => n.status === "active");
  const plannedNodes = nodes.filter((n) => n.status !== "active");

  return (
    <div className="px-5 py-6 animate-fade-in">
      <h2 className="text-base font-display tracking-tight uppercase mb-1">
        Server Locations
      </h2>
      <p className="text-xs text-text-dim mb-5">
        Select a server to connect through.
      </p>

      {/* Active nodes */}
      <div className="space-y-1.5">
        {activeNodes.map((node) => {
          const isSelected = node.id === selectedId;
          return (
            <button
              key={node.id}
              onClick={() => onSelect(node.id)}
              className={`w-full p-3.5 rounded-xl text-left transition-all ${
                isSelected
                  ? "bg-accent/10 border border-accent/30"
                  : "bg-bg-surface border border-border hover:border-accent/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{regionFlag(node.id)}</span>
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
                    <div className="w-12 h-1 rounded-full bg-border overflow-hidden">
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
                    <span className="text-[10px] font-mono text-text-dim w-6 text-right">
                      {node.load}%
                    </span>
                  </div>

                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C6F24E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Planned nodes */}
      {plannedNodes.length > 0 && (
        <>
          <div className="mt-6 mb-3 text-[10px] font-mono tracking-widest text-text-dim uppercase">
            Coming Soon
          </div>
          <div className="space-y-1.5">
            {plannedNodes.map((node) => (
              <div
                key={node.id}
                className="w-full p-3.5 rounded-xl bg-bg-surface border border-border opacity-40"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{regionFlag(node.id)}</span>
                  <div>
                    <div className="text-sm text-text-secondary">{node.name}</div>
                    <div className="text-[10px] font-mono text-text-dim">{node.id}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
