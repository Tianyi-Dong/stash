# Stash Importer

Pulls links dropped into the iCloud Drive "Stash Inbox" folder by the iPhone
Shortcuts (see [`../ios-shortcut/README.md`](../ios-shortcut/README.md)) into
the same local SQLite database the Stash app uses, fetching and parsing each
URL with the same Readability engine as the Chrome extension.

## Setup

```bash
cd importer
npm install
```

Open the Stash app at least once before running the importer — it creates
the database file the importer writes into.

## Run manually

```bash
npm run import
```

This scans `~/Library/Mobile Documents/com~apple~CloudDocs/Stash Inbox/` for
files, imports each one, and moves successful ones into a `processed/`
subfolder. Anything that fails (page unreachable, extraction failed) is left
in place so the next run retries it — check `Stash Inbox/import.log` for
what happened.

## Run on a schedule (launchd)

`com.stash.importer.plist.example` is the tracked template; make your own
real copy (gitignored, since it has to hardcode your username) and install
it:

```bash
cp com.stash.importer.plist.example com.stash.importer.plist
# edit com.stash.importer.plist and fill in your actual paths (see "Note on paths" below)
cp com.stash.importer.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.stash.importer.plist
```

To change the schedule, edit the `Hour`/`Minute` values in the copy under
`~/Library/LaunchAgents/`, then reload:

```bash
launchctl unload ~/Library/LaunchAgents/com.stash.importer.plist
launchctl load ~/Library/LaunchAgents/com.stash.importer.plist
```

To run it once immediately (without waiting for the schedule):

```bash
launchctl start com.stash.importer
```

Logs from the scheduled runs go to `importer/launchd.log`; import-specific
detail (what was imported, what failed and why) goes to
`Stash Inbox/import.log`.

To stop the schedule entirely:

```bash
launchctl unload ~/Library/LaunchAgents/com.stash.importer.plist
```

## Note on paths

`com.stash.importer.plist.example` ships with placeholder paths
(`/Users/YOUR_USERNAME/Claude/stash`) — fill in your actual username (and
move/rename the repo path if different) before loading it. It also
hardcodes the path to `node` (`/usr/local/bin/node`, confirmed via `which
node`) — update that too if yours lives elsewhere. If you later move the
repo or reinstall Node somewhere else, update the paths again and reload.
