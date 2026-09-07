use crate::crypto::{encrypt_local, derive_local_key};
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
    pub is_provisioned: bool,
    pub selected_node: Option<String>,
    pub connected_since: Option<i64>,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub real_ip: Option<String>,
    pub tunnel_ip: Option<String>,
}

#[derive(Serialize)]
pub struct NodesResponse {
    pub nodes: Vec<ExitNode>,
}

// ─── Control Plane API responses ─────────────────────────────────────

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

/// Provision response from the control plane (accountless)
#[derive(Deserialize)]
struct ProvisionResponse {
    interface: ProvisionInterface,
    peer: ProvisionPeer,
    meta: ProvisionMeta,
}

#[derive(Deserialize)]
struct ProvisionInterface {
    address: String,
    dns: Vec<String>,
    jc: u32,
    jmin: u32,
    jmax: u32,
    s1: u32,
    s2: u32,
    h1: u32,
    h2: u32,
    h3: u32,
    h4: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvisionPeer {
    public_key: String,
    preshared_key: String,
    endpoint: String,
    allowed_ips: String,
    persistent_keepalive: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvisionMeta {
    device_id: String,
    node_id: String,
    node_name: String,
    region: String,
    expires_at: i64,
}

// ─── Commands ────────────────────────────────────────────────────────

/// Provision this device against the control plane (accountless).
///
/// Flow:
/// 1. Generate X25519 keypair locally
/// 2. POST public key to /api/provision
/// 3. Server returns tunnel config (server pubkey, preshared key, AWG params, IP)
/// 4. Store config locally encrypted
#[tauri::command]
pub async fn provision_device(
    state: State<'_, SharedState>,
    node_id: Option<String>,
) -> Result<DeviceInfo, String> {
    let app = state.lock().await;
    let api_base = app.api_base.clone();
    drop(app);

    // 1. Generate local keypair
    let keypair = generate_x25519_keypair();

    // 2. POST to control plane
    let client = reqwest::Client::new();
    let mut body = serde_json::json!({
        "publicKey": keypair.public_key,
        "platform": std::env::consts::OS,
    });

    if let Some(ref nid) = node_id {
        body["nodeId"] = serde_json::Value::String(nid.clone());
    }

    let res = client
        .post(format!("{api_base}/provision"))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !res.status().is_success() {
        let status = res.status();
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("Provisioning failed ({}): {}", status, err_body));
    }

    let provision: ProvisionResponse = res
        .json()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    // 3. Build TunnelConfig
    let tunnel_config = TunnelConfig {
        private_key: keypair.private_key.clone(),
        address: provision.interface.address.replace("/32", ""),
        dns: provision.interface.dns,
        peer_public_key: provision.peer.public_key,
        preshared_key: provision.peer.preshared_key,
        endpoint: provision.peer.endpoint.clone(),
        allowed_ips: provision.peer.allowed_ips,
        keepalive: provision.peer.persistent_keepalive,
        jc: provision.interface.jc,
        jmin: provision.interface.jmin,
        jmax: provision.interface.jmax,
        s1: provision.interface.s1,
        s2: provision.interface.s2,
        h1: provision.interface.h1,
        h2: provision.interface.h2,
        h3: provision.interface.h3,
        h4: provision.interface.h4,
        stealth_host: None,
        stealth_port: provision.peer.endpoint
            .rsplit(':')
            .next()
            .and_then(|p| p.parse::<u16>().ok()),
    };

    let device_info = DeviceInfo {
        id: provision.meta.device_id.clone(),
        ip_address: provision.interface.address.replace("/32", ""),
        node_id: provision.meta.node_id,
        node_name: provision.meta.node_name,
        region: provision.meta.region,
        expires_at: provision.meta.expires_at,
    };

    // 4. Store in state
    let mut app = state.lock().await;

    // Encrypt the private key for local storage
    let local_key = derive_local_key(&provision.meta.device_id);
    let _encrypted_privkey = encrypt_local(&keypair.private_key, &local_key)
        .map_err(|e| format!("Encryption error: {e}"))?;

    app.device_info = Some(device_info.clone());
    app.tunnel_config = Some(tunnel_config);
    app.connection_state = ConnectionState::Disconnected;

    // Fetch nodes in background
    let _ = fetch_and_update_nodes(&client, &api_base, &mut app).await;

    Ok(device_info)
}

/// Get the current connection status
#[tauri::command]
pub async fn get_connection_status(state: State<'_, SharedState>) -> Result<ConnectionStatus, String> {
    let app = state.lock().await;

    Ok(ConnectionStatus {
        state: app.connection_state.clone(),
        is_provisioned: app.device_info.is_some(),
        selected_node: app.settings.selected_node_id.clone()
            .or_else(|| app.device_info.as_ref().map(|d| d.node_id.clone())),
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

/// Get provisioned device info
#[tauri::command]
pub async fn get_device_info(state: State<'_, SharedState>) -> Result<Option<DeviceInfo>, String> {
    let app = state.lock().await;
    Ok(app.device_info.clone())
}

// ─── Internal Helpers ────────────────────────────────────────────────

struct Keypair {
    public_key: String,
    private_key: String,
}

/// Generate an X25519 keypair for the tunnel.
/// Returns base64-encoded public and private keys.
fn generate_x25519_keypair() -> Keypair {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    use x25519_dalek::{StaticSecret, PublicKey};
    use rand::rngs::OsRng;

    let secret = StaticSecret::random_from_rng(OsRng);
    let public = PublicKey::from(&secret);

    Keypair {
        private_key: B64.encode(secret.as_bytes()),
        public_key: B64.encode(public.as_bytes()),
    }
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
    fn test_generate_keypair() {
        let kp = generate_x25519_keypair();
        // Should be base64 encoded 32-byte keys
        assert!(!kp.public_key.is_empty());
        assert!(!kp.private_key.is_empty());
        // Base64 of 32 bytes = 44 chars
        assert_eq!(kp.private_key.len(), 44);
    }
}
