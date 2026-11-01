use crate::store::{self, Folder, NewSave, Save, Stats, TagRef};
use crate::Db;
use serde::Serialize;
use tauri::State;

fn lock_err<T>(_: T) -> String {
    "database lock poisoned".to_string()
}

const FETCH_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) \
    AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

#[derive(Serialize)]
pub struct FetchedPage {
    pub url: String,
    pub html: String,
}

/// Fetches a URL server-side (so the webview's CORS restrictions never come
/// into play) for the in-app "Save Article" flow. The frontend runs the same
/// vendored Readability.js over the returned HTML that the extension uses.
#[tauri::command]
pub fn fetch_html(url: String) -> Result<FetchedPage, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent(FETCH_USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    let final_url = res.url().to_string();
    let html = res.text().map_err(|e| e.to_string())?;
    Ok(FetchedPage { url: final_url, html })
}

#[tauri::command]
pub fn list_saves(
    db: State<'_, Db>,
    view: String,
    folder_id: Option<String>,
    tag_id: Option<String>,
    sort_col: String,
    ascending: bool,
    unread_only: bool,
) -> Result<Vec<Save>, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::list_saves(
        &conn,
        &view,
        folder_id.as_deref(),
        tag_id.as_deref(),
        &sort_col,
        ascending,
        unread_only,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_saves(db: State<'_, Db>, query: String) -> Result<Vec<Save>, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::search_saves(&conn, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_save(db: State<'_, Db>, id: String) -> Result<Option<Save>, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::get_save(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_article_highlights(db: State<'_, Db>, article_id: String) -> Result<Vec<Save>, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::list_article_highlights(&conn, &article_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_save(db: State<'_, Db>, input: NewSave) -> Result<Save, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::create_save(&conn, &input).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_archived(db: State<'_, Db>, id: String, value: bool) -> Result<(), String> {
    let conn = db.lock().map_err(lock_err)?;
    store::set_archived(&conn, &id, value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_favorite(db: State<'_, Db>, id: String, value: bool) -> Result<(), String> {
    let conn = db.lock().map_err(lock_err)?;
    store::set_favorite(&conn, &id, value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_read(db: State<'_, Db>, id: String, value: bool) -> Result<(), String> {
    let conn = db.lock().map_err(lock_err)?;
    store::set_read(&conn, &id, value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_folder(db: State<'_, Db>, id: String, folder_id: Option<String>) -> Result<(), String> {
    let conn = db.lock().map_err(lock_err)?;
    store::set_folder(&conn, &id, folder_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_notes(db: State<'_, Db>, id: String, notes: Option<String>) -> Result<(), String> {
    let conn = db.lock().map_err(lock_err)?;
    store::set_notes(&conn, &id, notes.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_save(db: State<'_, Db>, id: String) -> Result<(), String> {
    let conn = db.lock().map_err(lock_err)?;
    store::delete_save(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_folders(db: State<'_, Db>) -> Result<Vec<Folder>, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::list_folders(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_folder(db: State<'_, Db>, name: String) -> Result<Folder, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::create_folder(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_tags(db: State<'_, Db>) -> Result<Vec<store::Tag>, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::list_tags(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_tag_to_save(db: State<'_, Db>, save_id: String, tag_name: String) -> Result<Vec<TagRef>, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::add_tag_to_save(&conn, &save_id, &tag_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_stats(db: State<'_, Db>) -> Result<Stats, String> {
    let conn = db.lock().map_err(lock_err)?;
    store::get_stats(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_extension_token(state: State<'_, crate::AppSecrets>) -> String {
    state.token.clone()
}
