# Stash Setup Guide

Stash is a local-first macOS app: everything lives in a SQLite file on your
Mac, there's no account and nothing to deploy. Setup is: build the app once,
point the Chrome extension at it, and (optionally) wire up the iPhone
Shortcuts + importer for the second collection pathway.

## 1. Build and Run the App

Prerequisites: [Rust](https://rustup.rs/) and Node.js.

```bash
# from the repo root
npm install
npm run dev     # launches the app in dev mode (cargo tauri dev under the hood)
```

The first launch creates the database at
`~/Library/Application Support/com.stash.app/stash.sqlite` and generates a
random local-server token (used to authenticate the Chrome extension — see
step 2).

To build a standalone `.app` you can just double-click:

```bash
npm run build
```

The built app appears under `src-tauri/target/release/bundle/macos/`.

## 2. Configure the Chrome Extension

1. With the Stash app running, click **Connect Extension** in the sidebar
   footer — it shows your local server token.
2. Open `extension/config.js` and paste the token into `TOKEN`
   (`SERVER_URL` is already set to `http://127.0.0.1:47615`, the port the
   app's local server listens on).
3. Open Chrome → `chrome://extensions/` → enable **Developer mode** → **Load
   unpacked** → select the `extension` folder.

### Using it

- **Save a page**: click the Stash icon, or right-click → "Save page to
  Stash".
- **Save a highlight**: select text → right-click → "Save highlight to
  Stash".

The extension only works while the Stash app is running (it's talking to
the app's local server, not the internet).

## 3. Set Up the Second Collection Pathway (optional)

This is for saving links from your phone: two iPhone Shortcuts drop files
into an iCloud Drive folder, and a scheduled script on your Mac imports
them.

1. Follow [`ios-shortcut/README.md`](ios-shortcut/README.md) to create the
   two Shortcuts ("Save to Stash" and "Log as Read") and the `Stash Inbox`
   iCloud Drive folder.
2. Follow [`importer/README.md`](importer/README.md) to install the
   importer's dependencies and (optionally) schedule it with `launchd`.

## Features

- **Save articles** — full text extraction via Readability, same engine in
  the extension and the importer
- **Save highlights** — from the extension's context menu, or by selecting
  text inside the app's reading pane
- **Full-text search** — SQLite FTS5 across title/excerpt/content/highlight
- **Tags & folders** — organize your saves
- **Read/unread** — set from the "Log as Read" Shortcut when backfilling;
  everything saved via the normal pathways starts unread

## Troubleshooting

### Extension not saving
- Confirm the Stash app is running (the extension talks to its local
  server, not the internet)
- Check that `TOKEN` in `extension/config.js` matches the token shown by
  **Connect Extension** in the app (re-click it to see the current value)
- Check the extension's background service worker console
  (`chrome://extensions/` → Stash → "service worker" link) for errors

### App won't build
- Confirm `rustc --version` and `cargo --version` both work — if not,
  reinstall via [rustup.rs](https://rustup.rs/)
- `npm install` at the repo root before `npm run dev`/`npm run build`

### Importer not picking up links
- Confirm `Stash Inbox` exists in iCloud Drive and has actually synced to
  the Mac (`~/Library/Mobile Documents/com~apple~CloudDocs/Stash Inbox/`)
- Check `Stash Inbox/import.log` for per-file errors
- Confirm the Stash app has been opened at least once (the importer needs
  `stash.sqlite` to already exist)

## License

MIT - Do whatever you want with it!
