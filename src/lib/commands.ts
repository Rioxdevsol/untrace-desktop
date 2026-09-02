/**
 * Tauri command bindings — typed wrappers around invoke().
 *
 * In the browser (dev without Tauri), these return mock data
 * so the UI can be previewed standalone.
 */

import type {
  ConnectionStatus,
  DeviceInfo,
  ExitNode,
  PairResult,
  Settings,
  TunnelStats,
} from "./types";

// Detect if we're running inside Tauri
const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) {
    const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
    return tauriInvoke<T>(cmd, args);
  }
  // Mock fallback for browser preview
  return mockInvoke<T>(cmd, args);
}

// ─── Mock state for browser dev ─────────────────────────────────────

let mockState: {
  paired: boolean;
  connected: boolean;
  connecting: boolean;
  device: DeviceInfo | null;
  connectedSince: number | null;
  selectedNode: string | null;
  settings: Settings;
} = {
  paired: false,
  connected: false,
  connecting: false,
  device: null,
  connectedSince: null,
  selectedNode: null,
  settings: {
    auto_connect: false,
    launch_on_boot: false,
    kill_switch: true,
    selected_node_id: null,
  },
};

const MOCK_NODES: ExitNode[] = [
  { id: "AMS-01", name: "Amsterdam 1", region: "eu-west", status: "active", stealthMode: "wstunnel", load: 24 },
  { id: "FRA-01", name: "Frankfurt 1", region: "eu-central", status: "active", stealthMode: "wstunnel", load: 18 },
  { id: "NYC-01", name: "New York 1", region: "us-east", status: "active", stealthMode: "wstunnel", load: 31 },
  { id: "LAX-01", name: "Los Angeles 1", region: "us-west", status: "active", stealthMode: "wstunnel", load: 12 },
  { id: "TKY-01", name: "Tokyo 1", region: "ap-northeast", status: "active", stealthMode: "wstunnel", load: 45 },
  { id: "SGP-01", name: "Singapore 1", region: "ap-southeast", status: "active", stealthMode: "wstunnel", load: 38 },
  { id: "SYD-01", name: "Sydney 1", region: "ap-south", status: "active", stealthMode: "wstunnel", load: 8 },
  { id: "HEL-02", name: "Helsinki 2", region: "eu-north", status: "active", stealthMode: "wstunnel", load: 15 },
];

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));

  switch (cmd) {
    case "pair_device": {
      const token = (args?.token as string) || "";
      if (token.length >= 8) {
        mockState.paired = true;
        mockState.device = {
          id: "dev-" + Math.random().toString(36).slice(2, 8),
          name: "Desktop",
          ipAddress: "10.10.1." + Math.floor(Math.random() * 254 + 1),
          nodeId: "AMS-01",
        };
        return { success: true, device: mockState.device, error: null } as T;
      }
      return { success: false, device: null, error: "Invalid token" } as T;
    }

    case "get_connection_status": {
      const state = mockState.connecting
        ? "connecting"
        : mockState.connected
          ? "connected"
          : "disconnected";
      return {
        state,
        device_paired: mockState.paired,
        device_name: mockState.device?.name ?? null,
        selected_node: mockState.selectedNode,
        connected_since: mockState.connectedSince,
        bytes_sent: mockState.connected ? Math.floor(Math.random() * 50000000) : 0,
        bytes_received: mockState.connected ? Math.floor(Math.random() * 200000000) : 0,
        real_ip: "203.0.113.42",
        tunnel_ip: mockState.device?.ipAddress ?? null,
      } as T;
    }

    case "get_nodes":
      return { nodes: MOCK_NODES } as T;

    case "connect_tunnel":
      mockState.connecting = true;
      setTimeout(() => {
        mockState.connecting = false;
        mockState.connected = true;
        mockState.connectedSince = Math.floor(Date.now() / 1000);
      }, 2000);
      return true as T;

    case "disconnect_tunnel":
      mockState.connected = false;
      mockState.connectedSince = null;
      return true as T;

    case "get_tunnel_stats":
      return {
        bytes_sent: mockState.connected ? Math.floor(Math.random() * 50000000) : 0,
        bytes_received: mockState.connected ? Math.floor(Math.random() * 200000000) : 0,
        connected_since: mockState.connectedSince,
        current_endpoint: mockState.connected ? "178.128.240.188:443" : null,
        handshake_age_secs: mockState.connected ? Math.floor(Math.random() * 120) : null,
      } as T;

    case "get_settings":
      return mockState.settings as T;

    case "update_settings":
      mockState.settings = args?.settings as Settings;
      return mockState.settings as T;

    case "get_device_info":
      return mockState.device as T;

    case "unpair_device":
      mockState.paired = false;
      mockState.device = null;
      mockState.connected = false;
      mockState.connectedSince = null;
      return true as T;

    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

// ─── Exported typed commands ────────────────────────────────────────

export async function pairDevice(token: string): Promise<PairResult> {
  return invoke<PairResult>("pair_device", { token });
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  return invoke<ConnectionStatus>("get_connection_status");
}

export async function getNodes(): Promise<{ nodes: ExitNode[] }> {
  return invoke<{ nodes: ExitNode[] }>("get_nodes");
}

export async function connectTunnel(): Promise<boolean> {
  return invoke<boolean>("connect_tunnel");
}

export async function disconnectTunnel(): Promise<boolean> {
  return invoke<boolean>("disconnect_tunnel");
}

export async function getTunnelStats(): Promise<TunnelStats> {
  return invoke<TunnelStats>("get_tunnel_stats");
}

export async function getSettings(): Promise<Settings> {
  return invoke<Settings>("get_settings");
}

export async function updateSettings(settings: Settings): Promise<Settings> {
  return invoke<Settings>("update_settings", { settings });
}

export async function getDeviceInfo(): Promise<DeviceInfo | null> {
  return invoke<DeviceInfo | null>("get_device_info");
}

export async function unpairDevice(): Promise<boolean> {
  return invoke<boolean>("unpair_device");
}
