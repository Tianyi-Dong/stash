#!/usr/bin/env node
// Stash importer: reads link files dropped into the iCloud Drive "Stash Inbox"
// folder by the iPhone Shortcuts (see ../ios-shortcut/README.md), fetches and
// parses each URL, and writes the result straight into the same SQLite file
// the Tauri app uses. Run manually, or on a schedule via launchd
// (see com.stash.importer.plist + README.md in this folder).

import { readdirSync, mkdirSync, renameSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

const INBOX_DIR = join(
  homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/Stash Inbox'
);
const PROCESSED_DIR = join(INBOX_DIR, 'processed');
const LOG_FILE = join(INBOX_DIR, 'import.log');

// Must match the app_data_dir Tauri resolves for the "com.stash.app"
// identifier in src-tauri/tauri.conf.json.
const DB_PATH = join(
  homedir(),
  'Library/Application Support/com.stash.app/stash.sqlite'
);

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const turndown = new TurndownService({ headingStyle: 'atx' });

// iCloud Drive keeps rarely-touched files "evicted" (cloud-only) until something
// reads them. The first read kicks off a download but fails immediately with this
// (unmapped-on-macOS) EAGAIN; without a retry, a file that nothing else ever opens
// stays stuck in this state forever, failing the same way on every scheduled run.
function isCloudNotDownloadedYet(err) {
  return err.code === 'UNKNOWN' && err.errno === -11 && err.syscall === 'read';
}

async function readFileWaitingForICloud(path, attempts = 15, delayMs = 2000) {
  for (let i = 0; i < attempts; i++) {
    try {
      return readFileSync(path, 'utf8');
    } catch (err) {
      if (!isCloudNotDownloadedYet(err) || i === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Inbox folder not created yet - nothing to log to. Ignored.
  }
}

function openDb() {
  if (!existsSync(DB_PATH)) {
    throw new Error(
      `Stash database not found at ${DB_PATH}. Open the Stash app at least once first.`
    );
  }
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

function extractMeta(document) {
  const meta = (name) =>
    document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
    document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
    null;

  return {
    siteName: meta('og:site_name') || document.location?.hostname || null,
    author: meta('author') || meta('article:author') || null,
    imageUrl: meta('og:image') || meta('twitter:image') || null,
    publishedAt:
      document.querySelector('time[datetime]')?.getAttribute('datetime') ||
      meta('article:published_time') ||
      null,
  };
}

async function fetchAndParse(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`fetch failed: HTTP ${res.status}`);
  }
  const html = await res.text();

  const dom = new JSDOM(html, { url });
  const meta = extractMeta(dom.window.document);

  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  if (!article || !article.content) {
    throw new Error('readability could not extract article content');
  }

  return {
    title: article.title || null,
    excerpt: article.excerpt || null,
    content: turndown.turndown(article.content),
    siteName: article.siteName || meta.siteName,
    author: article.byline || meta.author,
    imageUrl: meta.imageUrl,
    publishedAt: article.publishedTime || meta.publishedAt,
  };
}

function insertSave(db, { url, title, excerpt, content, siteName, author, imageUrl, publishedAt, readAt }) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO saves
      (id, url, title, excerpt, content, site_name, author, published_at, image_url, source, read_at, created_at, updated_at)
     VALUES
      (@id, @url, @title, @excerpt, @content, @siteName, @author, @publishedAt, @imageUrl, 'ios-shortcut', @readAt, @now, @now)`
  ).run({ id, url, title, excerpt, content, siteName, author, publishedAt, imageUrl, readAt, now });
  return id;
}

function parseEntry(raw) {
  const data = JSON.parse(raw);
  if (!data.url || typeof data.url !== 'string') {
    throw new Error('entry is missing a "url" field');
  }
  return {
    url: data.url,
    status: data.status === 'read' ? 'read' : 'unread',
  };
}

async function main() {
  mkdirSync(INBOX_DIR, { recursive: true });
  mkdirSync(PROCESSED_DIR, { recursive: true });

  const files = readdirSync(INBOX_DIR, { withFileTypes: true })
    .filter((f) => f.isFile() && !f.name.startsWith('.') && f.name !== 'import.log');

  if (files.length === 0) {
    log('no new files in inbox');
    return;
  }

  const db = openDb();
  let imported = 0;
  let failed = 0;

  for (const file of files) {
    const path = join(INBOX_DIR, file.name);
    try {
      const entry = parseEntry(await readFileWaitingForICloud(path));
      const parsed = await fetchAndParse(entry.url);
      const id = insertSave(db, {
        url: entry.url,
        readAt: entry.status === 'read' ? new Date().toISOString() : null,
        ...parsed,
      });
      renameSync(path, join(PROCESSED_DIR, file.name));
      imported++;
      log(`imported ${entry.url} -> save ${id}`);
    } catch (err) {
      failed++;
      log(`FAILED ${file.name}: ${err.message}`);
      // Left in place in INBOX_DIR so the next run retries it.
    }
  }

  db.close();
  log(`done: ${imported} imported, ${failed} failed`);
}

main().catch((err) => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
