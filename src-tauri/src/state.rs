use serde::{Deserialize, Serialize};

/// Connection lifecycle: Disconnected → Connecting → Connected → Disconnecting → Disconnected
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Disconnecting,
    Error,
}

impl Default for ConnectionState {
    fn default() -> Self {
        Self::Disconnected
    }
}

/// An exit node from the control plane
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExitNode {
    pub id: String,
    pub name: String,
    pub region: String,
    pub status: String,
    #[serde(rename = "stealthMode")]
    pub stealth_mode: Option<String>,
    pub load: u8,
}

/// Device information after provisioning (accountless)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub id: String,
    #[serde(rename = "ipAddress")]
    pub ip_address: String,
    #[serde(rename = "nodeId")]
    pub node_id: String,
    #[serde(rename = "nodeName")]
    pub node_name: String,
    pub region: String,
    #[serde(rename = "expiresAt")]
    pub expires_at: i64,
}

/// Tunnel configuration from provisioning
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelConfig {
    pub private_key: String,
    pub address: String,
    pub dns: Vec<String>,
    pub peer_public_key: String,
    pub preshared_key: String,
    pub endpoint: String,
    pub allowed_ips: String,
    pub keepalive: u16,
    // Obfuscation parameters
    pub jc: u32,
    pub jmin: u32,
    pub jmax: u32,
    pub s1: u32,
    pub s2: u32,
    pub h1: u32,
    pub h2: u32,
    pub h3: u32,
    pub h4: u32,
    // Stealth
    pub stealth_host: Option<String>,
    pub stealth_port: Option<u16>,
}

/// Real-time tunnel statistics
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TunnelStats {
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub connected_since: Option<i64>, // unix timestamp
    pub current_endpoint: Option<String>,
    pub handshake_age_secs: Option<u64>,
}

/// User-facing settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub auto_connect: bool,
    pub launch_on_boot: bool,
    pub kill_switch: bool,
    pub selected_node_id: Option<String>,
    pub auto_reconnect: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            auto_connect: false,
            launch_on_boot: false,
            kill_switch: true, // safe default
            selected_node_id: None,
            auto_reconnect: true,
        }
    }
}

/// Global application state
#[derive(Debug)]
pub struct AppState {
    pub connection_state: ConnectionState,
    pub device_info: Option<DeviceInfo>,
    pub tunnel_config: Option<TunnelConfig>,
    pub tunnel_stats: TunnelStats,
    pub settings: Settings,
    pub nodes: Vec<ExitNode>,
    pub real_ip: Option<String>,
    pub tunnel_pid: Option<u32>,
    pub api_base: String,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            connection_state: ConnectionState::Disconnected,
            device_info: None,
            tunnel_config: None,
            tunnel_stats: TunnelStats::default(),
            settings: Settings::default(),
            nodes: Vec::new(),
            real_ip: None,
            tunnel_pid: None,
            // Control plane API — proxied through Vercel
            api_base: "https://untrace-vpn.vercel.app/api".to_string(),
        }
    }
}
