/** Connection states matching Rust enum */
export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

/** Exit node from control plane */
export interface ExitNode {
  id: string;
  name: string;
  region: string;
  status: string;
  stealthMode: string | null;
  load: number;
}

/** Paired device info */
export interface DeviceInfo {
  id: string;
  name: string;
  ipAddress: string;
  nodeId: string | null;
}

/** Full connection status from backend */
export interface ConnectionStatus {
  state: ConnectionState;
  device_paired: boolean;
  device_name: string | null;
  selected_node: string | null;
  connected_since: number | null;
  bytes_sent: number;
  bytes_received: number;
  real_ip: string | null;
  tunnel_ip: string | null;
}

/** Tunnel statistics */
export interface TunnelStats {
  bytes_sent: number;
  bytes_received: number;
  connected_since: number | null;
  current_endpoint: string | null;
  handshake_age_secs: number | null;
}

/** User settings */
export interface Settings {
  auto_connect: boolean;
  launch_on_boot: boolean;
  kill_switch: boolean;
  selected_node_id: string | null;
}

/** Pair result */
export interface PairResult {
  success: boolean;
  device: DeviceInfo | null;
  error: string | null;
}
