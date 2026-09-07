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

/** Provisioned device info */
export interface DeviceInfo {
  id: string;
  ipAddress: string;
  nodeId: string;
  nodeName: string;
  region: string;
  expiresAt: number;
}

/** Full connection status from backend */
export interface ConnectionStatus {
  state: ConnectionState;
  is_provisioned: boolean;
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
  auto_reconnect: boolean;
}

/** Provision result from server */
export interface ProvisionResult {
  interface: {
    address: string;
    dns: string[];
    jc: number;
    jmin: number;
    jmax: number;
    s1: number;
    s2: number;
    h1: number;
    h2: number;
    h3: number;
    h4: number;
  };
  peer: {
    publicKey: string;
    presharedKey: string;
    endpoint: string;
    allowedIPs: string;
    persistentKeepalive: number;
  };
  meta: {
    deviceId: string;
    nodeId: string;
    nodeName: string;
    region: string;
    expiresAt: number;
  };
}
