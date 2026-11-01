use rusqlite::Connection;
use std::path::Path;

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS saves (
  id TEXT PRIMARY KEY,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  parent_save_id TEXT REFERENCES saves(id) ON DELETE CASCADE,
  url TEXT,
  title TEXT,
  excerpt TEXT,
  content TEXT,
  highlight TEXT,
  notes TEXT,
  site_name TEXT,
  author TEXT,
  published_at TEXT,
  image_url TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  read_at TEXT,
  source TEXT DEFAULT 'extension',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS saves_created_at_idx ON saves(created_at DESC);
CREATE INDEX IF NOT EXISTS saves_folder_id_idx ON saves(folder_id);
CREATE INDEX IF NOT EXISTS saves_is_archived_idx ON saves(is_archived);
CREATE INDEX IF NOT EXISTS saves_parent_save_id_idx ON saves(parent_save_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#6366f1',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS save_tags (
  save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (save_id, tag_id)
);

-- Auto-bump updated_at on write. Relies on SQLite's default recursive_triggers=off
-- so the UPDATE below does not re-fire this same trigger.
CREATE TRIGGER IF NOT EXISTS saves_updated_at
AFTER UPDATE ON saves
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE saves SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS folders_updated_at
AFTER UPDATE ON folders
FOR EACH ROW WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE folders SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id;
END;

CREATE VIRTUAL TABLE IF NOT EXISTS saves_fts USING fts5(
  title, excerpt, content, highlight, content='saves', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS saves_fts_ai AFTER INSERT ON saves BEGIN
  INSERT INTO saves_fts(rowid, title, excerpt, content, highlight)
  VALUES (new.rowid, new.title, new.excerpt, new.content, new.highlight);
END;

CREATE TRIGGER IF NOT EXISTS saves_fts_ad AFTER DELETE ON saves BEGIN
  INSERT INTO saves_fts(saves_fts, rowid, title, excerpt, content, highlight)
  VALUES ('delete', old.rowid, old.title, old.excerpt, old.content, old.highlight);
END;

CREATE TRIGGER IF NOT EXISTS saves_fts_au AFTER UPDATE ON saves BEGIN
  INSERT INTO saves_fts(saves_fts, rowid, title, excerpt, content, highlight)
  VALUES ('delete', old.rowid, old.title, old.excerpt, old.content, old.highlight);
  INSERT INTO saves_fts(rowid, title, excerpt, content, highlight)
  VALUES (new.rowid, new.title, new.excerpt, new.content, new.highlight);
END;
"#;

pub fn open(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.execute_batch(SCHEMA)?;
    Ok(conn)
}
