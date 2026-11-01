mod commands;
mod db;
mod server;
mod store;

use rand::Rng;
use rusqlite::Connection;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub type Db = Arc<Mutex<Connection>>;

pub struct AppSecrets {
    pub token: String,
}

fn load_or_create_token(app_data_dir: &Path) -> std::io::Result<String> {
    let token_path = app_data_dir.join("extension_token");
    if let Ok(existing) = fs::read_to_string(&token_path) {
        let trimmed = existing.trim().to_string();
        if !trimmed.is_empty() {
            return Ok(trimmed);
        }
    }
    let token: String = rand::thread_rng()
        .sample_iter(rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();
    fs::write(&token_path, &token)?;
    Ok(token)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;

            let db_path = app_data_dir.join("stash.sqlite");
            let conn = db::open(&db_path)?;
            let shared_db: Db = Arc::new(Mutex::new(conn));
            app.manage(shared_db.clone());

            let token = load_or_create_token(&app_data_dir)?;
            app.manage(AppSecrets {
                token: token.clone(),
            });

            server::spawn(shared_db, token);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_saves,
            commands::search_saves,
            commands::get_save,
            commands::list_article_highlights,
            commands::create_save,
            commands::fetch_html,
            commands::set_archived,
            commands::set_favorite,
            commands::set_read,
            commands::set_folder,
            commands::set_notes,
            commands::delete_save,
            commands::list_folders,
            commands::create_folder,
            commands::list_tags,
            commands::add_tag_to_save,
            commands::get_stats,
            commands::get_extension_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
