# Dev Archive

This repo lives at `~/Development/dev-archive`. The Obsidian vault is `~/Documents/Development Archive` when that folder exists. Do not create a second vault. Do not open Development itself as a vault.

```bash
curl "http://127.0.0.1:43187/api/context?q=<task or symbol>&budget=1800&format=md"
```

Use the pack. Open only `filesToOpen`. Do not dump a sibling repo into the prompt.

The server must already be running (`npm start` in this folder, http://127.0.0.1:43187). `/api/status` reports hostname, pid, and cwd. Re-index fails if Development is missing.
