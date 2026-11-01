# Stash iPhone Shortcuts

Two Shortcuts drop a small file into an iCloud Drive folder called
`Stash Inbox`. A script on your Mac ([`../importer/`](../importer/)) picks
those files up on a schedule, fetches and parses each link, and adds it to
your local Stash database. Nothing talks to the Mac directly from your
phone — iCloud Drive is the handoff point, so it works even if your Mac is
asleep.

## One-time setup: create the inbox folder

1. Open the **Files** app on your iPhone (or Mac).
2. Go to **iCloud Drive**.
3. Create a new folder named exactly `Stash Inbox`.

## Shortcut 1: "Save to Stash" (default — unread)

This is the one you'll use almost every time — sharing a link marks it
unread, ready to read later.

1. Open **Shortcuts** → **+** to create a new shortcut.
2. Rename it **Save to Stash** (tap the shortcut name at the top).
3. Add these actions in order:
   1. **Receive [Safari web pages, URLs, Text] input from Share Sheet**
      (Shortcuts adds this automatically as the first action — set "Accept"
      to include *Safari web pages*, *URLs*, and *Text*.)
   2. **Get Current Date** → formatted as **ISO 8601** (Format: ISO 8601,
      include time).
   3. **Text** — build the file's contents:
      ```
      {"status":"unread","url":"[Shortcut Input]","added":"[Formatted Date]"}
      ```
      (Tap into the text field and insert the *Shortcut Input* and
      *Formatted Date* variables from the actions above where shown.)
   4. **Save File** →
      - Service: **iCloud Drive**
      - Path: `Stash Inbox/[Formatted Date].txt` (use the same *Formatted
        Date* variable so every filename is unique)
      - Turn **off** "Ask Where to Save"
   5. **Show Notification** — text: `Saved to Stash`
4. Tap the **(i)** info icon → enable **Show in Share Sheet**. Restrict the
   share sheet types to *Safari web pages*, *URLs*, and *Text* if prompted.

Now: from Safari (or any app with a Share button), tap **Share → Save to
Stash** and the link is queued.

## Shortcut 2: "Log as Read" (for backfilling)

For the rare case where you want to log something you've already read
(so it shows up in Stash's history without being in your unread queue).
Duplicate "Save to Stash" (long-press it in the Shortcuts list → Duplicate)
and make two changes:

- Rename it **Log as Read**.
- In the **Text** action, change `"status":"unread"` to `"status":"read"`.

Enable **Show in Share Sheet** on this one too, same as above.

## What the importer expects

Each file is a JSON object on one line:

```json
{"status": "unread", "url": "https://example.com/article", "added": "2026-09-13T08:00:00Z"}
```

`status` is `"unread"` or `"read"`; `added` is informational only (the
importer stamps its own `created_at` on import). See
[`../importer/README.md`](../importer/README.md) for how the Mac-side script
that consumes these files works and how to schedule it.
