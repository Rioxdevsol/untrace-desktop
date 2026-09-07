use crate::state::{AppState, ConnectionState, TunnelStats};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

type SharedState = Arc<Mutex<AppState>>;

// ─── Config file generation ─────────────────────────────────────────

/// Write a temporary config file for the tunnel engine.
/// Returns the path to the written config.
fn write_tunnel_config(config: &crate::state::TunnelConfig) -> Result<String, String> {
    let config_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("untrace");

    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {e}"))?;

    let config_path = config_dir.join("tunnel.conf");

    let content = format!(
        "[Interface]\n\
         PrivateKey = {private_key}\n\
         Address = {address}/32\n\
         DNS = {dns}\n\
         Jc = {jc}\n\
         Jmin = {jmin}\n\
         Jmax = {jmax}\n\
         S1 = {s1}\n\
         S2 = {s2}\n\
         H1 = {h1}\n\
         H2 = {h2}\n\
         H3 = {h3}\n\
         H4 = {h4}\n\
         \n\
         [Peer]\n\
         PublicKey = {peer_public_key}\n\
         PresharedKey = {preshared_key}\n\
         Endpoint = {endpoint}\n\
         AllowedIPs = {allowed_ips}\n\
         PersistentKeepalive = {keepalive}\n",
        private_key = config.private_key,
        address = config.address,
        dns = config.dns.join(", "),
        jc = config.jc,
        jmin = config.jmin,
        jmax = config.jmax,
        s1 = config.s1,
        s2 = config.s2,
        h1 = config.h1,
        h2 = config.h2,
        h3 = config.h3,
        h4 = config.h4,
        peer_public_key = config.peer_public_key,
        preshared_key = config.preshared_key,
        endpoint = config.endpoint,
        allowed_ips = config.allowed_ips,
        keepalive = config.keepalive,
    );

    // Set restrictive permissions on the config file
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create(true).truncate(true).mode(0o600);
        use std::io::Write;
        let mut file = opts
            .open(&config_path)
            .map_err(|e| format!("Failed to write config: {e}"))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write config: {e}"))?;
    }

    #[cfg(not(unix))]
    {
        std::fs::write(&config_path, &content)
            .map_err(|e| format!("Failed to write config: {e}"))?;
    }

    Ok(config_path.to_string_lossy().to_string())
}

// ─── UAPI config application ───────────────────────────────────────

/// Build the UAPI set command string for amneziawg-go.
/// Format: private_key + device-level AWG params, then peer block.
fn build_uapi_set(config: &crate::state::TunnelConfig) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};

    let priv_bytes = B64.decode(&config.private_key)
        .map_err(|e| format!("Invalid private key base64: {e}"))?;
    let pub_bytes = B64.decode(&config.peer_public_key)
        .map_err(|e| format!("Invalid peer public key base64: {e}"))?;
    let psk_bytes = B64.decode(&config.preshared_key)
        .map_err(|e| format!("Invalid preshared key base64: {e}"))?;

    let priv_hex = hex::encode(&priv_bytes);
    let pub_hex = hex::encode(&pub_bytes);
    let psk_hex = hex::encode(&psk_bytes);

    Ok(format!(
        "set=1\n\
         private_key={priv_hex}\n\
         jc={jc}\n\
         jmin={jmin}\n\
         jmax={jmax}\n\
         s1={s1}\n\
         s2={s2}\n\
         h1={h1}\n\
         h2={h2}\n\
         h3={h3}\n\
         h4={h4}\n\
         public_key={pub_hex}\n\
         preshared_key={psk_hex}\n\
         endpoint={endpoint}\n\
         persistent_keepalive_interval={keepalive}\n\
         allowed_ip=0.0.0.0/0\n\
         \n",
        priv_hex = priv_hex,
        jc = config.jc,
        jmin = config.jmin,
        jmax = config.jmax,
        s1 = config.s1,
        s2 = config.s2,
        h1 = config.h1,
        h2 = config.h2,
        h3 = config.h3,
        h4 = config.h4,
        pub_hex = pub_hex,
        psk_hex = psk_hex,
        endpoint = config.endpoint,
        keepalive = config.keepalive,
    ))
}

// ─── Platform-specific tunnel engine path ──────────────────────────

/// Resolve the bundled tunnel-engine binary from Tauri's resource dir.
fn resolve_engine_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Cannot resolve resource dir: {e}"))?;

    #[cfg(target_os = "windows")]
    let engine_name = "tunnel-engine.exe";

    #[cfg(not(target_os = "windows"))]
    let engine_name = "tunnel-engine";

    let engine_path = resource_dir.join(engine_name);

    if !engine_path.exists() {
        return Err(format!(
            "Tunnel engine binary not found at {}. \
             The installation may be incomplete.",
            engine_path.display()
        ));
    }

    // Ensure executable on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&engine_path)
            .map_err(|e| format!("Cannot read engine permissions: {e}"))?
            .permissions();
        if perms.mode() & 0o111 == 0 {
            perms.set_mode(perms.mode() | 0o755);
            std::fs::set_permissions(&engine_path, perms)
                .map_err(|e| format!("Cannot set engine executable: {e}"))?;
        }
    }

    Ok(engine_path)
}

// ─── Connect ────────────────────────────────────────────────────────

/// Connect the VPN tunnel.
///
/// Platform behavior:
/// - **macOS**: Runs tunnel-engine (amneziawg-go) with admin privileges
///   via osascript authorization prompt. Creates a utun interface,
///   applies config via UAPI socket, configures routing.
///
/// - **Windows**: Runs tunnel-engine.exe (amneziawg-go) which creates
///   a WinTUN adapter via the bundled wintun.dll. Config applied via
///   named pipe UAPI.
///
/// - **Linux (dev/test)**: Direct execution with ip netns or sudo.
///
/// Fail-closed: if the binary is missing or the handshake fails,
/// the state moves to Error, never fakes "Connected".
#[tauri::command]
pub async fn connect_tunnel(
    state: State<'_, SharedState>,
    app: AppHandle,
) -> Result<bool, String> {
    let mut app_state = state.lock().await;

    if app_state.connection_state == ConnectionState::Connected {
        return Ok(true);
    }
    if app_state.connection_state == ConnectionState::Connecting {
        return Err("Connection already in progress.".to_string());
    }

    let config = app_state
        .tunnel_config
        .as_ref()
        .ok_or("No tunnel configuration. Pair your device first.")?
        .clone();

    app_state.connection_state = ConnectionState::Connecting;
    drop(app_state);

    // Resolve the bundled binary
    let engine_path = resolve_engine_path(&app)?;
    log::info!("Tunnel engine: {}", engine_path.display());

    // Write config file (for reference/debugging, actual config via UAPI)
    let _config_path = write_tunnel_config(&config)?;

    let tun_name = "utun_untrace";

    // Build UAPI command
    let uapi_set = build_uapi_set(&config)?;

    // Start the tunnel engine and apply config
    let result = start_tunnel_engine(&engine_path, tun_name, &uapi_set, &config).await;

    let mut app_state = state.lock().await;

    match result {
        Ok(pid) => {
            app_state.tunnel_pid = Some(pid);
            app_state.connection_state = ConnectionState::Connected;
            app_state.tunnel_stats.connected_since = Some(chrono::Utc::now().timestamp());
            log::info!("Tunnel connected (PID: {})", pid);
            Ok(true)
        }
        Err(e) => {
            app_state.connection_state = ConnectionState::Error;
            log::error!("Tunnel connection failed: {e}");
            Err(format!("Connection failed: {e}"))
        }
    }
}

/// Start the tunnel engine process and configure it via UAPI.
async fn start_tunnel_engine(
    engine_path: &std::path::Path,
    tun_name: &str,
    uapi_set: &str,
    config: &crate::state::TunnelConfig,
) -> Result<u32, String> {
    #[cfg(target_os = "macos")]
    {
        start_tunnel_macos(engine_path, tun_name, uapi_set, config).await
    }

    #[cfg(target_os = "windows")]
    {
        start_tunnel_windows(engine_path, tun_name, uapi_set, config).await
    }

    #[cfg(target_os = "linux")]
    {
        start_tunnel_linux(engine_path, tun_name, uapi_set, config).await
    }
}

/// macOS: Start tunnel-engine with admin privileges via osascript.
/// Creates utun interface, applies config via UAPI socket.
#[cfg(target_os = "macos")]
async fn start_tunnel_macos(
    engine_path: &std::path::Path,
    tun_name: &str,
    uapi_set: &str,
    config: &crate::state::TunnelConfig,
) -> Result<u32, String> {
    let engine_str = engine_path.to_string_lossy();

    // Write a helper script that runs as root
    let helper_dir = dirs::data_local_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
        .join("untrace");
    std::fs::create_dir_all(&helper_dir)
        .map_err(|e| format!("mkdir: {e}"))?;

    let helper_path = helper_dir.join("tunnel-helper.sh");
    let uapi_path = helper_dir.join("uapi-set.txt");

    // Write UAPI config
    std::fs::write(&uapi_path, uapi_set)
        .map_err(|e| format!("Failed to write UAPI config: {e}"))?;

    // Extract endpoint host:port for routing
    let endpoint_host = config.endpoint.split(':').next().unwrap_or("");

    let helper_content = format!(
        "#!/bin/bash\n\
         set -e\n\
         # Start tunnel engine\n\
         \"{engine}\" {tun} &\n\
         ENGINE_PID=$!\n\
         sleep 2\n\
         \n\
         # Apply config via UAPI socket\n\
         SOCK=\"/var/run/amneziawg/{tun}.sock\"\n\
         if [ ! -S \"$SOCK\" ]; then\n\
             SOCK=\"/var/run/wireguard/{tun}.sock\"\n\
         fi\n\
         \n\
         if [ -S \"$SOCK\" ]; then\n\
             cat \"{uapi}\" | nc -U \"$SOCK\"\n\
         fi\n\
         \n\
         # Configure interface\n\
         ifconfig {tun} inet {addr} {addr} netmask 255.255.255.255 up\n\
         \n\
         # Add routes: endpoint via default gateway, then default via tunnel\n\
         DEFAULT_GW=$(route -n get default 2>/dev/null | grep gateway | awk '{{print $2}}')\n\
         if [ -n \"$DEFAULT_GW\" ] && [ -n \"{ep_host}\" ]; then\n\
             route add -host {ep_host} \"$DEFAULT_GW\" 2>/dev/null || true\n\
             route delete default 2>/dev/null || true\n\
             route add default -interface {tun} 2>/dev/null || true\n\
         fi\n\
         \n\
         # Set DNS\n\
         networksetup -setdnsservers Wi-Fi 1.1.1.1 1.0.0.1 2>/dev/null || true\n\
         \n\
         # Write PID file\n\
         echo $ENGINE_PID > \"{pid_file}\"\n\
         wait $ENGINE_PID\n",
        engine = engine_str,
        tun = tun_name,
        uapi = uapi_path.to_string_lossy(),
        addr = config.address,
        ep_host = endpoint_host,
        pid_file = helper_dir.join("tunnel.pid").to_string_lossy(),
    );

    std::fs::write(&helper_path, &helper_content)
        .map_err(|e| format!("Failed to write helper: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&helper_path, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("chmod: {e}"))?;
    }

    // Run with admin privileges via osascript
    let result = tokio::process::Command::new("osascript")
        .args([
            "-e",
            &format!(
                "do shell script \"{}\" with administrator privileges",
                helper_path.to_string_lossy().replace('"', "\\\"")
            ),
        ])
        .spawn();

    match result {
        Ok(mut child) => {
            // Give it time to start and create PID file
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;

            let pid = child.id().unwrap_or(0);
            if pid == 0 {
                // Try reading PID from file
                if let Ok(pid_str) = std::fs::read_to_string(helper_dir.join("tunnel.pid")) {
                    if let Ok(p) = pid_str.trim().parse::<u32>() {
                        return Ok(p);
                    }
                }
            }
            Ok(pid)
        }
        Err(e) => Err(format!("Failed to start tunnel with admin privileges: {e}")),
    }
}

/// Windows: Start tunnel-engine.exe with WinTUN.
/// The wintun.dll must be in the same directory as the binary.
#[cfg(target_os = "windows")]
async fn start_tunnel_windows(
    engine_path: &std::path::Path,
    tun_name: &str,
    uapi_set: &str,
    config: &crate::state::TunnelConfig,
) -> Result<u32, String> {
    let engine_dir = engine_path.parent().unwrap_or(std::path::Path::new("."));
    let wintun_path = engine_dir.join("wintun.dll");

    if !wintun_path.exists() {
        return Err(format!(
            "wintun.dll not found at {}. The installation may be incomplete.",
            wintun_path.display()
        ));
    }

    // Start tunnel engine
    let child = tokio::process::Command::new(engine_path)
        .arg(tun_name)
        .current_dir(engine_dir)
        .spawn()
        .map_err(|e| format!("Failed to start tunnel engine: {e}"))?;

    let pid = child.id().unwrap_or(0);

    // Wait for the named pipe to appear
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // Apply config via named pipe (\\.\pipe\ProtectedPrefix\Administrators\WireGuard\{tun_name})
    let pipe_path = format!(r"\\.\pipe\ProtectedPrefix\Administrators\WireGuard\{}", tun_name);
    let uapi_bytes = uapi_set.as_bytes().to_vec();

    // Write UAPI config via pipe
    match std::fs::write(&pipe_path, &uapi_bytes) {
        Ok(_) => log::info!("UAPI config applied via named pipe"),
        Err(e) => {
            log::warn!("Named pipe write failed ({}), trying alternate path", e);
            // Try alternate pipe path
            let alt_pipe = format!(r"\\.\pipe\WireGuard\{}", tun_name);
            std::fs::write(&alt_pipe, &uapi_bytes)
                .map_err(|e2| format!("UAPI pipe write failed: {e2}"))?;
        }
    }

    // Configure interface IP and routes via netsh
    let addr = &config.address;
    let endpoint_host = config.endpoint.split(':').next().unwrap_or("");

    // Set interface address
    let _ = tokio::process::Command::new("netsh")
        .args(["interface", "ip", "set", "address", tun_name, "static", addr, "255.255.255.255"])
        .output()
        .await;

    // Set DNS
    let _ = tokio::process::Command::new("netsh")
        .args(["interface", "ip", "set", "dns", tun_name, "static", "1.1.1.1"])
        .output()
        .await;

    // Route endpoint via current default gateway, then default via tunnel
    if !endpoint_host.is_empty() {
        // Get current default gateway
        if let Ok(output) = tokio::process::Command::new("cmd")
            .args(["/c", "route", "print", "0.0.0.0"])
            .output()
            .await
        {
            let output_str = String::from_utf8_lossy(&output.stdout);
            // Parse default gateway from route table
            for line in output_str.lines() {
                if line.contains("0.0.0.0") && !line.contains("On-link") {
                    if let Some(gw) = line.split_whitespace().nth(2) {
                        let _ = tokio::process::Command::new("route")
                            .args(["add", endpoint_host, "mask", "255.255.255.255", gw])
                            .output()
                            .await;
                        break;
                    }
                }
            }
        }
        let _ = tokio::process::Command::new("route")
            .args(["add", "0.0.0.0", "mask", "0.0.0.0", addr, "metric", "5"])
            .output()
            .await;
    }

    Ok(pid)
}

/// Linux: Direct execution (dev/test mode).
#[cfg(target_os = "linux")]
async fn start_tunnel_linux(
    engine_path: &std::path::Path,
    tun_name: &str,
    uapi_set: &str,
    config: &crate::state::TunnelConfig,
) -> Result<u32, String> {
    // Start tunnel engine with sudo
    let child = tokio::process::Command::new("sudo")
        .arg(engine_path)
        .arg(tun_name)
        .spawn()
        .map_err(|e| format!("Failed to start tunnel engine: {e}"))?;

    let pid = child.id().unwrap_or(0);
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    // Apply config via UAPI socket
    let sock_paths = [
        format!("/run/amneziawg/{tun_name}.sock"),
        format!("/var/run/wireguard/{tun_name}.sock"),
    ];

    let mut applied = false;
    for sock_path in &sock_paths {
        if std::path::Path::new(sock_path).exists() {
            let result = tokio::process::Command::new("sh")
                .args(["-c", &format!("printf '%s' '{}' | socat - UNIX-CONNECT:{}", uapi_set.replace('\'', "'\\''"), sock_path)])
                .output()
                .await;
            if let Ok(output) = result {
                let out = String::from_utf8_lossy(&output.stdout);
                if out.contains("errno=0") {
                    applied = true;
                    break;
                }
            }
        }
    }

    if !applied {
        log::warn!("Could not apply UAPI config via socket");
    }

    // Configure interface
    let addr = &config.address;
    let endpoint_host = config.endpoint.split(':').next().unwrap_or("");

    let _ = tokio::process::Command::new("sudo")
        .args(["ip", "addr", "add", &format!("{addr}/32"), "dev", tun_name])
        .output()
        .await;

    let _ = tokio::process::Command::new("sudo")
        .args(["ip", "link", "set", tun_name, "up"])
        .output()
        .await;

    if !endpoint_host.is_empty() {
        let _ = tokio::process::Command::new("sudo")
            .args(["ip", "route", "add", &format!("{endpoint_host}/32"), "via",
                   "$(ip route show default | awk '/default/ {print $3}')"])
            .output()
            .await;

        let _ = tokio::process::Command::new("sudo")
            .args(["ip", "route", "add", "default", "dev", tun_name])
            .output()
            .await;
    }

    Ok(pid)
}

// ─── Disconnect ─────────────────────────────────────────────────────

/// Disconnect the VPN tunnel. Kills the engine process and cleans up
/// routes and interface configuration.
#[tauri::command]
pub async fn disconnect_tunnel(state: State<'_, SharedState>) -> Result<bool, String> {
    let mut app = state.lock().await;

    if app.connection_state == ConnectionState::Disconnected {
        return Ok(true);
    }

    app.connection_state = ConnectionState::Disconnecting;

    // Kill the tunnel engine process
    if let Some(pid) = app.tunnel_pid.take() {
        #[cfg(unix)]
        {
            let _ = std::process::Command::new("sudo")
                .args(["kill", "-TERM", &pid.to_string()])
                .output();
            // Also kill by name as fallback
            let _ = std::process::Command::new("sudo")
                .args(["pkill", "-f", "tunnel-engine"])
                .output();
        }

        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .output();
        }
    }

    // Restore default route
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("sh")
            .args(["-c", "route delete default 2>/dev/null; \
                          networksetup -setdnsservers Wi-Fi Empty 2>/dev/null"])
            .output();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("sudo")
            .args(["ip", "link", "del", "utun_untrace"])
            .output();
    }

    // Clean up config file
    if let Some(config_dir) = dirs::data_local_dir() {
        let _ = std::fs::remove_file(config_dir.join("untrace/tunnel.conf"));
        let _ = std::fs::remove_file(config_dir.join("untrace/uapi-set.txt"));
        let _ = std::fs::remove_file(config_dir.join("untrace/tunnel-helper.sh"));
        let _ = std::fs::remove_file(config_dir.join("untrace/tunnel.pid"));
    }

    app.connection_state = ConnectionState::Disconnected;
    app.tunnel_stats = TunnelStats::default();

    Ok(true)
}

// ─── Stats ──────────────────────────────────────────────────────────

/// Get live tunnel statistics.
/// Reads from the UAPI socket if available for real stats.
#[tauri::command]
pub async fn get_tunnel_stats(state: State<'_, SharedState>) -> Result<TunnelStats, String> {
    let app = state.lock().await;

    if app.connection_state != ConnectionState::Connected {
        return Ok(app.tunnel_stats.clone());
    }

    // Try to read live stats from UAPI
    #[cfg(unix)]
    {
        let sock_paths = [
            "/run/amneziawg/utun_untrace.sock",
            "/var/run/wireguard/utun_untrace.sock",
        ];

        for sock in &sock_paths {
            if std::path::Path::new(sock).exists() {
                if let Ok(output) = std::process::Command::new("sh")
                    .args(["-c", &format!("printf 'get=1\\n\\n' | socat - UNIX-CONNECT:{sock}")])
                    .output()
                {
                    let out = String::from_utf8_lossy(&output.stdout);
                    let mut stats = app.tunnel_stats.clone();

                    for line in out.lines() {
                        if let Some((key, val)) = line.split_once('=') {
                            match key {
                                "tx_bytes" => {
                                    if let Ok(v) = val.parse() { stats.bytes_sent = v; }
                                }
                                "rx_bytes" => {
                                    if let Ok(v) = val.parse() { stats.bytes_received = v; }
                                }
                                "last_handshake_time_sec" => {
                                    if let Ok(v) = val.parse::<u64>() {
                                        if v > 0 {
                                            let now = chrono::Utc::now().timestamp() as u64;
                                            stats.handshake_age_secs = Some(now.saturating_sub(v));
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    return Ok(stats);
                }
            }
        }
    }

    Ok(app.tunnel_stats.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_tunnel_config() {
        let config = crate::state::TunnelConfig {
            private_key: "dGVzdC1rZXk=".to_string(),
            address: "10.10.1.2".to_string(),
            dns: vec!["1.1.1.1".to_string()],
            peer_public_key: "cGVlci1rZXk=".to_string(),
            preshared_key: "cHNr".to_string(),
            endpoint: "1.2.3.4:443".to_string(),
            allowed_ips: "0.0.0.0/0".to_string(),
            keepalive: 25,
            jc: 6,
            jmin: 8,
            jmax: 80,
            s1: 45,
            s2: 90,
            h1: 111,
            h2: 222,
            h3: 333,
            h4: 444,
            stealth_host: None,
            stealth_port: Some(443),
        };

        let path = write_tunnel_config(&config).unwrap();
        let content = std::fs::read_to_string(&path).unwrap();
        assert!(content.contains("PrivateKey = dGVzdC1rZXk="));
        assert!(content.contains("Jc = 6"));
        assert!(content.contains("H1 = 111"));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn test_build_uapi_set() {
        let config = crate::state::TunnelConfig {
            private_key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=".to_string(),
            address: "10.10.1.2".to_string(),
            dns: vec!["1.1.1.1".to_string()],
            peer_public_key: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=".to_string(),
            preshared_key: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=".to_string(),
            endpoint: "1.2.3.4:51820".to_string(),
            allowed_ips: "0.0.0.0/0".to_string(),
            keepalive: 25,
            jc: 6, jmin: 8, jmax: 80,
            s1: 45, s2: 90,
            h1: 111, h2: 222, h3: 333, h4: 444,
            stealth_host: None,
            stealth_port: None,
        };

        let uapi = build_uapi_set(&config).unwrap();
        assert!(uapi.starts_with("set=1\n"));
        assert!(uapi.contains("jc=6\n"));
        assert!(uapi.contains("endpoint=1.2.3.4:51820\n"));
        assert!(uapi.contains("allowed_ip=0.0.0.0/0\n"));
    }
}
