use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const SAVE_COLUMNS: &str = "id, folder_id, parent_save_id, url, title, excerpt, content, \
    highlight, notes, site_name, author, published_at, image_url, is_archived, is_favorite, \
    read_at, source, created_at, updated_at";

#[derive(Serialize, Clone)]
pub struct TagRef {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Clone)]
pub struct Save {
    pub id: String,
    pub folder_id: Option<String>,
    pub parent_save_id: Option<String>,
    pub url: Option<String>,
    pub title: Option<String>,
    pub excerpt: Option<String>,
    pub content: Option<String>,
    pub highlight: Option<String>,
    pub notes: Option<String>,
    pub site_name: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub image_url: Option<String>,
    pub is_archived: bool,
    pub is_favorite: bool,
    pub read_at: Option<String>,
    pub source: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub tags: Vec<TagRef>,
}

#[derive(Serialize, Clone)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Clone)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Serialize, Default)]
pub struct Stats {
    pub total: i64,
    pub articles: i64,
    pub highlights: i64,
    pub archived: i64,
    pub by_month: Vec<(String, i64)>,
}

/// Fields accepted when creating a save from either the extension (local HTTP
/// server) or the in-app "save highlight from selection" flow.
#[derive(Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub struct NewSave {
    pub url: Option<String>,
    pub title: Option<String>,
    pub excerpt: Option<String>,
    pub content: Option<String>,
    pub highlight: Option<String>,
    pub notes: Option<String>,
    pub site_name: Option<String>,
    pub author: Option<String>,
    pub published_at: Option<String>,
    pub image_url: Option<String>,
    pub parent_save_id: Option<String>,
    pub source: Option<String>,
}

fn row_to_save(row: &Row) -> rusqlite::Result<Save> {
    Ok(Save {
        id: row.get(0)?,
        folder_id: row.get(1)?,
        parent_save_id: row.get(2)?,
        url: row.get(3)?,
        title: row.get(4)?,
        excerpt: row.get(5)?,
        content: row.get(6)?,
        highlight: row.get(7)?,
        notes: row.get(8)?,
        site_name: row.get(9)?,
        author: row.get(10)?,
        published_at: row.get(11)?,
        image_url: row.get(12)?,
        is_archived: row.get::<_, i64>(13)? != 0,
        is_favorite: row.get::<_, i64>(14)? != 0,
        read_at: row.get(15)?,
        source: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
        tags: Vec::new(),
    })
}

fn attach_tags(conn: &Connection, saves: &mut [Save]) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name FROM tags t JOIN save_tags st ON st.tag_id = t.id \
         WHERE st.save_id = ?1 ORDER BY t.name",
    )?;
    for save in saves.iter_mut() {
        let tags = stmt
            .query_map(params![save.id], |r| {
                Ok(TagRef {
                    id: r.get(0)?,
                    name: r.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        save.tags = tags;
    }
    Ok(())
}

fn sort_column(col: &str) -> &str {
    match col {
        "created_at" | "updated_at" | "title" => col,
        _ => "created_at",
    }
}

pub fn list_saves(
    conn: &Connection,
    view: &str,
    folder_id: Option<&str>,
    tag_id: Option<&str>,
    sort_col: &str,
    ascending: bool,
    unread_only: bool,
) -> rusqlite::Result<Vec<Save>> {
    let col = sort_column(sort_col);
    let dir = if ascending { "ASC" } else { "DESC" };

    let (base_where, param): (&str, Option<&str>) = match view {
        "highlights" => ("WHERE highlight IS NOT NULL", None),
        "articles" => ("WHERE highlight IS NULL AND is_archived = 0", None),
        "favorites" => ("WHERE is_favorite = 1 AND is_archived = 0", None),
        "archived" => ("WHERE is_archived = 1", None),
        "folder" => (
            "WHERE folder_id = ?1 AND is_archived = 0",
            folder_id,
        ),
        "tag" => (
            "WHERE id IN (SELECT save_id FROM save_tags WHERE tag_id = ?1) AND is_archived = 0",
            tag_id,
        ),
        _ => ("WHERE is_archived = 0", None),
    };
    let where_clause = if unread_only {
        format!("{base_where} AND read_at IS NULL")
    } else {
        base_where.to_string()
    };

    let sql = format!(
        "SELECT {SAVE_COLUMNS} FROM saves {where_clause} ORDER BY {col} {dir}"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut saves: Vec<Save> = match param {
        Some(p) => stmt
            .query_map(params![p], row_to_save)?
            .collect::<Result<_, _>>()?,
        None => stmt.query_map([], row_to_save)?.collect::<Result<_, _>>()?,
    };
    attach_tags(conn, &mut saves)?;
    Ok(saves)
}

pub fn search_saves(conn: &Connection, query: &str) -> rusqlite::Result<Vec<Save>> {
    let fts_query = build_fts_query(query);
    if fts_query.is_empty() {
        return Ok(Vec::new());
    }
    let sql = format!(
        "SELECT {SAVE_COLUMNS} FROM saves_fts \
         JOIN saves ON saves.rowid = saves_fts.rowid \
         WHERE saves_fts MATCH ?1 ORDER BY bm25(saves_fts)"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut saves: Vec<Save> = stmt
        .query_map(params![fts_query], row_to_save)?
        .collect::<Result<_, _>>()?;
    attach_tags(conn, &mut saves)?;
    Ok(saves)
}

/// Quote+prefix each token so user input can't break FTS5 query syntax
/// (hyphens, colons, quotes, etc. are all neutralized by quoting).
fn build_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .map(|tok| format!("\"{}\"*", tok.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn list_recent_saves(conn: &Connection, limit: i64) -> rusqlite::Result<Vec<Save>> {
    let sql = format!("SELECT {SAVE_COLUMNS} FROM saves ORDER BY created_at DESC LIMIT ?1");
    let mut stmt = conn.prepare(&sql)?;
    let mut saves: Vec<Save> = stmt
        .query_map(params![limit], row_to_save)?
        .collect::<Result<_, _>>()?;
    attach_tags(conn, &mut saves)?;
    Ok(saves)
}

pub fn get_save(conn: &Connection, id: &str) -> rusqlite::Result<Option<Save>> {
    let sql = format!("SELECT {SAVE_COLUMNS} FROM saves WHERE id = ?1");
    let save = conn
        .query_row(&sql, params![id], row_to_save)
        .optional()?;
    if let Some(mut s) = save {
        attach_tags(conn, std::slice::from_mut(&mut s))?;
        Ok(Some(s))
    } else {
        Ok(None)
    }
}

pub fn list_article_highlights(conn: &Connection, article_id: &str) -> rusqlite::Result<Vec<Save>> {
    let sql = format!(
        "SELECT {SAVE_COLUMNS} FROM saves WHERE parent_save_id = ?1 ORDER BY created_at ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut saves: Vec<Save> = stmt
        .query_map(params![article_id], row_to_save)?
        .collect::<Result<_, _>>()?;
    attach_tags(conn, &mut saves)?;
    Ok(saves)
}

pub fn create_save(conn: &Connection, input: &NewSave) -> rusqlite::Result<Save> {
    let id = Uuid::new_v4().to_string();
    let source = input.source.clone().unwrap_or_else(|| "extension".into());
    conn.execute(
        "INSERT INTO saves (id, parent_save_id, url, title, excerpt, content, highlight, \
         notes, site_name, author, published_at, image_url, source) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            id,
            input.parent_save_id,
            input.url,
            input.title,
            input.excerpt,
            input.content,
            input.highlight,
            input.notes,
            input.site_name,
            input.author,
            input.published_at,
            input.image_url,
            source,
        ],
    )?;
    Ok(get_save(conn, &id)?.expect("just-inserted save must exist"))
}

pub fn set_archived(conn: &Connection, id: &str, value: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE saves SET is_archived = ?1 WHERE id = ?2",
        params![value as i64, id],
    )?;
    Ok(())
}

pub fn set_favorite(conn: &Connection, id: &str, value: bool) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE saves SET is_favorite = ?1 WHERE id = ?2",
        params![value as i64, id],
    )?;
    Ok(())
}

pub fn set_read(conn: &Connection, id: &str, value: bool) -> rusqlite::Result<()> {
    if value {
        conn.execute(
            "UPDATE saves SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1",
            params![id],
        )?;
    } else {
        conn.execute("UPDATE saves SET read_at = NULL WHERE id = ?1", params![id])?;
    }
    Ok(())
}

pub fn set_folder(conn: &Connection, id: &str, folder_id: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE saves SET folder_id = ?1 WHERE id = ?2",
        params![folder_id, id],
    )?;
    Ok(())
}

pub fn set_notes(conn: &Connection, id: &str, notes: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE saves SET notes = ?1 WHERE id = ?2",
        params![notes, id],
    )?;
    Ok(())
}

pub fn delete_save(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM saves WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_folders(conn: &Connection) -> rusqlite::Result<Vec<Folder>> {
    let mut stmt =
        conn.prepare("SELECT id, name, color, created_at, updated_at FROM folders ORDER BY name")?;
    let rows = stmt.query_map([], |r| {
        Ok(Folder {
            id: r.get(0)?,
            name: r.get(1)?,
            color: r.get(2)?,
            created_at: r.get(3)?,
            updated_at: r.get(4)?,
        })
    })?;
    rows.collect()
}

pub fn create_folder(conn: &Connection, name: &str) -> rusqlite::Result<Folder> {
    let id = Uuid::new_v4().to_string();
    conn.execute("INSERT INTO folders (id, name) VALUES (?1, ?2)", params![id, name])?;
    conn.query_row(
        "SELECT id, name, color, created_at, updated_at FROM folders WHERE id = ?1",
        params![id],
        |r| {
            Ok(Folder {
                id: r.get(0)?,
                name: r.get(1)?,
                color: r.get(2)?,
                created_at: r.get(3)?,
                updated_at: r.get(4)?,
            })
        },
    )
}

pub fn list_tags(conn: &Connection) -> rusqlite::Result<Vec<Tag>> {
    let mut stmt = conn.prepare("SELECT id, name, color, created_at FROM tags ORDER BY name")?;
    let rows = stmt.query_map([], |r| {
        Ok(Tag {
            id: r.get(0)?,
            name: r.get(1)?,
            color: r.get(2)?,
            created_at: r.get(3)?,
        })
    })?;
    rows.collect()
}

/// Gets-or-creates a tag by name, attaches it to the save, and returns the
/// save's current tag list.
pub fn add_tag_to_save(conn: &Connection, save_id: &str, tag_name: &str) -> rusqlite::Result<Vec<TagRef>> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM tags WHERE name = ?1",
            params![tag_name],
            |r| r.get(0),
        )
        .optional()?;

    let tag_id = match existing {
        Some(id) => id,
        None => {
            let id = Uuid::new_v4().to_string();
            conn.execute("INSERT INTO tags (id, name) VALUES (?1, ?2)", params![id, tag_name])?;
            id
        }
    };

    conn.execute(
        "INSERT OR IGNORE INTO save_tags (save_id, tag_id) VALUES (?1, ?2)",
        params![save_id, tag_id],
    )?;

    let mut stmt = conn.prepare(
        "SELECT t.id, t.name FROM tags t JOIN save_tags st ON st.tag_id = t.id \
         WHERE st.save_id = ?1 ORDER BY t.name",
    )?;
    let rows = stmt.query_map(params![save_id], |r| {
        Ok(TagRef {
            id: r.get(0)?,
            name: r.get(1)?,
        })
    })?;
    rows.collect()
}

pub fn get_stats(conn: &Connection) -> rusqlite::Result<Stats> {
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM saves", [], |r| r.get(0))?;
    let highlights: i64 =
        conn.query_row("SELECT COUNT(*) FROM saves WHERE highlight IS NOT NULL", [], |r| r.get(0))?;
    let archived: i64 =
        conn.query_row("SELECT COUNT(*) FROM saves WHERE is_archived = 1", [], |r| r.get(0))?;

    let mut stmt = conn.prepare(
        "SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) \
         FROM saves GROUP BY month ORDER BY month",
    )?;
    let by_month = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Stats {
        total,
        articles: total - highlights,
        highlights,
        archived,
        by_month,
    })
}
