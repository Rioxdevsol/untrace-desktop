use crate::crypto::{decrypt_local, derive_local_key, encrypt_local};
use crate::state::{AppState, ConnectionState, DeviceInfo, ExitNode, Settings, TunnelConfig};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

type SharedState = Arc<Mutex<AppState>>;

// ─── API Response Types ─────────────────────────────────────────────

#[derive(Serialize)]
pub struct ConnectionStatus {
    pub state: ConnectionState,
    pub device_paired: bool,
    pub device_name: Option<String>,
    pub selected_node: Option<String>,
    pub connected_since: Option<i64>,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub real_ip: Option<String>,
    pub tunnel_ip: Option<String>,
}

#[derive(Deserialize)]
pub struct PairRequest {
    pub token: String,
}

#[derive(Serialize)]
pub struct PairResult {
    pub success: bool,
    pub device: Option<DeviceInfo>,
    pub error: Option<String>,
}

#[derive(Serialize)]
pub struct NodesResponse {
    pub nodes: Vec<ExitNode>,
}

// ─── Control Plane API responses ─────────────────────────────────────

#[derive(Deserialize)]
struct ApiDevicesResponse {
    devices: Vec<ApiDevice>,
}

#[derive(Deserialize)]
struct ApiDevice {
    id: String,
    name: String,
    #[serde(rename = "ipAddress")]
    ip_address: String,
    #[serde(rename = "nodeId")]
    node_id: Option<String>,
}

#[derive(Deserialize)]
struct ApiNodesResponse {
    nodes: Vec<ApiNode>,
}

#[derive(Deserialize)]
struct ApiNode {
    id: String,
    name: String,
    region: String,
    status: String,
    #[serde(rename = "stealthMode")]
    stealth_mode: Option<String>,
    load: u8,
}

// ─── Commands ────────────────────────────────────────────────────────

/// Pair the desktop app with the user's account using a device token.
/// The token is obtained from the web dashboard (device pairing flow).
///
/// Flow: Dashboard → "Add Device" → generates a pairing token
///       User pastes token into desktop app → app validates with control plane
///       → retrieves device info + config → stores encrypted locally
#[tauri::command]
pub async fn pair_device(
    state: State<'_, SharedState>,
    token: String,
) -> Result<PairResult, String> {
    let mut app = state.lock().await;

    // Validate token format (Bearer token from SIWE session)
    if token.len() < 32 {
        return Ok(PairResult {
            success: false,
            device: None,
            error: Some("Invalid pairing token".to_string()),
        });
    }

    let client = reqwest::Client::new();
    let api_base = app.api_base.clone();

    // Fetch devices associated with this session token
    let devices_res = client
        .get(format!("{api_base}/devices"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if devices_res.status() == 401 {
        return Ok(PairResult {
            success: false,
            device: None,
            error: Some("Token expired or invalid. Generate a new one from the dashboard.".to_string()),
        });
    }

    if !devices_res.status().is_success() {
        return Ok(PairResult {
            success: false,
            device: None,
            error: Some(format!("API error: {}", devices_res.status())),
        });
    }

    let body: ApiDevicesResponse = devices_res
        .json()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    // Use the most recently created device (last in array)
    let api_device = body.devices.last().ok_or("No devices found on this account. Create one in the dashboard first.")?;

    let device_info = DeviceInfo {
        id: api_device.id.clone(),
        name: api_device.name.clone(),
        ip_address: api_device.ip_address.clone(),
        node_id: api_device.node_id.clone(),
    };

    // Fetch the tunnel configuration
    let config_res = client
        .get(format!("{api_base}/devices/{}/config", device_info.id))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("Config fetch error: {e}"))?;

    if !config_res.status().is_success() {
        return Ok(PairResult {
            success: false,
            device: None,
            error: Some("Failed to fetch tunnel configuration.".to_string()),
        });
    }

    let config_text = config_res
        .text()
        .await
        .map_err(|e| format!("Config read error: {e}"))?;

    // Parse the config file
    let tunnel_config = parse_tunnel_config(&config_text)
        .map_err(|e| format!("Config parse error: {e}"))?;

    // Encrypt and store the token and config locally
    let local_key = derive_local_key(&device_info.id);
    let encrypted_token = encrypt_local(&token, &local_key)
        .map_err(|e| format!("Encryption error: {e}"))?;

    // Store encrypted token (in production, use tauri-plugin-store)
    app.device_token = Some(encrypted_token);
    app.device_info = Some(device_info.clone());
    app.tunnel_config = Some(tunnel_config);
    app.connection_state = ConnectionState::Disconnected;

    // Fetch available nodes
    let _ = fetch_and_update_nodes(&client, &api_base, &mut app).await;

    Ok(PairResult {
        success: true,
        device: Some(device_info),
        error: None,
    })
}

/// Get the current connection status
#[tauri::command]
pub async fn get_connection_status(state: State<'_, SharedState>) -> Result<ConnectionStatus, String> {
    let app = state.lock().await;

    Ok(ConnectionStatus {
        state: app.connection_state.clone(),
        device_paired: app.device_info.is_some(),
        device_name: app.device_info.as_ref().map(|d| d.name.clone()),
        selected_node: app.settings.selected_node_id.clone(),
        connected_since: app.tunnel_stats.connected_since,
        bytes_sent: app.tunnel_stats.bytes_sent,
        bytes_received: app.tunnel_stats.bytes_received,
        real_ip: app.real_ip.clone(),
        tunnel_ip: app.device_info.as_ref().map(|d| d.ip_address.clone()),
    })
}

/// Get the list of available exit nodes
#[tauri::command]
pub async fn get_nodes(state: State<'_, SharedState>) -> Result<NodesResponse, String> {
    let app = state.lock().await;
    let api_base = app.api_base.clone();
    drop(app);

    let client = reqwest::Client::new();

    let res = client
        .get(format!("{api_base}/nodes"))
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !res.status().is_success() {
        // Return cached nodes
        let app = state.lock().await;
        return Ok(NodesResponse {
            nodes: app.nodes.clone(),
        });
    }

    let body: ApiNodesResponse = res
        .json()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    let nodes: Vec<ExitNode> = body
        .nodes
        .into_iter()
        .map(|n| ExitNode {
            id: n.id,
            name: n.name,
            region: n.region,
            status: n.status,
            stealth_mode: n.stealth_mode,
            load: n.load,
        })
        .collect();

    let mut app = state.lock().await;
    app.nodes = nodes.clone();

    Ok(NodesResponse { nodes })
}

/// Get current settings
#[tauri::command]
pub async fn get_settings(state: State<'_, SharedState>) -> Result<Settings, String> {
    let app = state.lock().await;
    Ok(app.settings.clone())
}

/// Update settings
#[tauri::command]
pub async fn update_settings(
    state: State<'_, SharedState>,
    settings: Settings,
) -> Result<Settings, String> {
    let mut app = state.lock().await;
    app.settings = settings.clone();
    Ok(settings)
}

/// Get paired device info
#[tauri::command]
pub async fn get_device_info(state: State<'_, SharedState>) -> Result<Option<DeviceInfo>, String> {
    let app = state.lock().await;
    Ok(app.device_info.clone())
}

/// Unpair the current device
#[tauri::command]
pub async fn unpair_device(state: State<'_, SharedState>) -> Result<bool, String> {
    let mut app = state.lock().await;

    // Can't unpair while connected
    if app.connection_state == ConnectionState::Connected
        || app.connection_state == ConnectionState::Connecting
    {
        return Err("Disconnect before unpairing.".to_string());
    }

    app.device_token = None;
    app.device_info = None;
    app.tunnel_config = None;
    app.connection_state = ConnectionState::Disconnected;

    Ok(true)
}

// ─── Internal Helpers ────────────────────────────────────────────────

/// Parse an Untrace .conf file into a TunnelConfig struct
fn parse_tunnel_config(config_text: &str) -> Result<TunnelConfig, String> {
    let mut private_key = String::new();
    let mut address = String::new();
    let mut dns = vec!["1.1.1.1".to_string(), "1.0.0.1".to_string()];
    let mut peer_public_key = String::new();
    let mut preshared_key = String::new();
    let mut endpoint = String::new();
    let mut allowed_ips = "0.0.0.0/0, ::/0".to_string();
    let mut keepalive: u16 = 25;
    let mut jc: u32 = 4;
    let mut jmin: u32 = 8;
    let mut jmax: u32 = 80;
    let mut s1: u32 = 50;
    let mut s2: u32 = 50;
    let mut h1: u32 = 1000000;
    let mut h2: u32 = 2000000;
    let mut h3: u32 = 3000000;
    let mut h4: u32 = 4000000;

    for line in config_text.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with('[') {
            continue;
        }

        if let Some((key, value)) = line.split_once('=') {
            let key = key.trim();
            let value = value.trim();

            match key {
                "PrivateKey" => private_key = value.to_string(),
                "Address" => address = value.replace("/32", "").to_string(),
                "DNS" => {
                    dns = value.split(',').map(|s| s.trim().to_string()).collect();
                }
                "PublicKey" => peer_public_key = value.to_string(),
                "PresharedKey" => preshared_key = value.to_string(),
                "Endpoint" => endpoint = value.to_string(),
                "AllowedIPs" => allowed_ips = value.to_string(),
                "PersistentKeepalive" => {
                    keepalive = value.parse().unwrap_or(25);
                }
                "Jc" => jc = value.parse().unwrap_or(4),
                "Jmin" => jmin = value.parse().unwrap_or(8),
                "Jmax" => jmax = value.parse().unwrap_or(80),
                "S1" => s1 = value.parse().unwrap_or(50),
                "S2" => s2 = value.parse().unwrap_or(50),
                "H1" => h1 = value.parse().unwrap_or(1000000),
                "H2" => h2 = value.parse().unwrap_or(2000000),
                "H3" => h3 = value.parse().unwrap_or(3000000),
                "H4" => h4 = value.parse().unwrap_or(4000000),
                _ => {}
            }
        }
    }

    if private_key.is_empty() || peer_public_key.is_empty() || endpoint.is_empty() {
        return Err("Missing required config fields (PrivateKey, PublicKey, Endpoint)".to_string());
    }

    // Detect stealth mode from endpoint port
    let stealth_port = endpoint
        .rsplit(':')
        .next()
        .and_then(|p| p.parse::<u16>().ok());
    let stealth_host = if stealth_port == Some(443) {
        Some(endpoint.rsplit(':').last().unwrap_or("").to_string())
    } else {
        None
    };

    Ok(TunnelConfig {
        private_key,
        address,
        dns,
        peer_public_key,
        preshared_key,
        endpoint,
        allowed_ips,
        keepalive,
        jc,
        jmin,
        jmax,
        s1,
        s2,
        h1,
        h2,
        h3,
        h4,
        stealth_host,
        stealth_port,
    })
}

async fn fetch_and_update_nodes(
    client: &reqwest::Client,
    api_base: &str,
    app: &mut AppState,
) -> Result<(), String> {
    let res = client
        .get(format!("{api_base}/nodes"))
        .send()
        .await
        .map_err(|e| format!("Nodes fetch error: {e}"))?;

    if !res.status().is_success() {
        return Err("Failed to fetch nodes".to_string());
    }

    let body: ApiNodesResponse = res
        .json()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    app.nodes = body
        .nodes
        .into_iter()
        .map(|n| ExitNode {
            id: n.id,
            name: n.name,
            region: n.region,
            status: n.status,
            stealth_mode: n.stealth_mode,
            load: n.load,
        })
        .collect();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_tunnel_config() {
        let config = r#"
# ── Untrace Config ──
# Device: MacBook
[Interface]
PrivateKey = dGVzdC1wcml2YXRlLWtleQ==
Address = 10.10.1.2/32
DNS = 1.1.1.1, 1.0.0.1
Jc = 6
Jmin = 8
Jmax = 80
S1 = 45
S2 = 90
H1 = 1234567
H2 = 2345678
H3 = 3456789
H4 = 4567890

[Peer]
PublicKey = dGVzdC1wdWJsaWMta2V5
PresharedKey = dGVzdC1wcmVzaGFyZWQ=
Endpoint = 178.128.240.188:443
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
"#;

        let result = parse_tunnel_config(config).unwrap();
        assert_eq!(result.private_key, "dGVzdC1wcml2YXRlLWtleQ==");
        assert_eq!(result.address, "10.10.1.2");
        assert_eq!(result.jc, 6);
        assert_eq!(result.s1, 45);
        assert_eq!(result.h1, 1234567);
        assert_eq!(result.endpoint, "178.128.240.188:443");
        assert!(result.stealth_port.is_some());
    }

    #[test]
    fn test_parse_config_missing_fields() {
        let config = "[Interface]\nAddress = 10.0.0.1/32\n";
        assert!(parse_tunnel_config(config).is_err());
    }
}
