mod commands;
mod export;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            commands::project::new_project,
            commands::project::load_project,
            commands::project::save_project,
            commands::project::list_recent_projects,
            commands::project::read_text_file,
            commands::assets::import_asset,
            commands::assets::list_assets,
            commands::export::export_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
