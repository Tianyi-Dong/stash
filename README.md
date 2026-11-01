# Stash

A local-first, single-user read-it-later app. Save articles and highlights
straight to a SQLite file on your Mac — no account, no cloud, no sync
service.

**Your data. Your disk. No subscription, no login.**

## Architecture

Stash is a native macOS app built with [Tauri](https://tauri.app/): a Rust
backend holding a real SQLite database (`~/Library/Application
Support/com.stash.app/stash.sqlite`), with the existing vanilla-JS web UI
running inside it as the frontend. There are exactly two ways things get
in:

1. **Chrome extension** — save the current page or a text selection with
   one click; it POSTs straight to a small local HTTP server the app runs
   on `127.0.0.1`.
2. **iPhone Shortcuts → iCloud Drive → scheduled importer** — two Shortcuts
   drop links into an iCloud Drive "Stash Inbox" folder; a Node script on
   your Mac (run daily via `launchd`) fetches, parses, and imports them.
   See [`ios-shortcut/README.md`](ios-shortcut/README.md) and
   [`importer/README.md`](importer/README.md).

## Project Structure

```
stash/
├── src-tauri/       # Rust backend: SQLite access, Tauri commands, local HTTP server
├── web/             # Frontend UI (served inside the Tauri window)
├── extension/       # Chrome extension
├── importer/         # Node script that imports links from the iCloud inbox
└── ios-shortcut/     # Setup guide for the two iPhone Shortcuts
```

## Quick Start

See [SETUP.md](SETUP.md) for full setup instructions (Rust/Tauri toolchain,
building the app, configuring the extension, setting up the Shortcuts and
importer).

## Tech Stack

- **App**: [Tauri 2](https://tauri.app/) (Rust backend, native WebKit webview)
- **Storage**: SQLite (via `rusqlite`, bundled — no external dependency),
  full-text search via FTS5
- **Frontend**: Vanilla JS, HTML, CSS (no framework, no build step)
- **Importer**: Node.js (`@mozilla/readability` + `jsdom` for article
  extraction, `better-sqlite3` for DB access)

## License

MIT
