mod api;
mod crypto;
mod state;
mod tunnel;

use state::AppState;
use std::sync::Arc;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let app_state = Arc::new(Mutex::new(AppState::default()));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            api::pair_device,
            api::get_connection_status,
            api::get_nodes,
            api::get_settings,
            api::update_settings,
            api::get_device_info,
            api::unpair_device,
            tunnel::connect_tunnel,
            tunnel::disconnect_tunnel,
            tunnel::get_tunnel_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Untrace");
}
