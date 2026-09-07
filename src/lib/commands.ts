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
  provisioned: boolean;
  connected: boolean;
  connecting: boolean;
  device: DeviceInfo | null;
  connectedSince: number | null;
  selectedNode: string | null;
  settings: Settings;
} = {
  provisioned: false,
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
    auto_reconnect: true,
  },
};

const MOCK_NODES: ExitNode[] = [
  { id: "AMS-01", name: "Amsterdam", region: "eu-west", status: "active", stealthMode: "wstunnel", load: 24 },
];

async function mockInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));

  switch (cmd) {
    case "provision_device": {
      mockState.provisioned = true;
      mockState.device = {
        id: "dev-" + Math.random().toString(36).slice(2, 8),
        ipAddress: "10.10.1." + Math.floor(Math.random() * 254 + 1),
        nodeId: "AMS-01",
        nodeName: "Amsterdam",
        region: "eu-west",
        expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
      };
      return mockState.device as T;
    }

    case "get_connection_status": {
      const state = mockState.connecting
        ? "connecting"
        : mockState.connected
          ? "connected"
          : "disconnected";
      return {
        state,
        is_provisioned: mockState.provisioned,
        selected_node: mockState.selectedNode || "AMS-01",
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

    default:
      throw new Error(`Unknown command: ${cmd}`);
  }
}

// ─── Exported typed commands ────────────────────────────────────────

/** Provision this device against the control plane (accountless) */
export async function provisionDevice(nodeId?: string): Promise<DeviceInfo> {
  return invoke<DeviceInfo>("provision_device", nodeId ? { nodeId } : undefined);
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
