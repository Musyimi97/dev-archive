# Dev Archive

This repo lives at `~/Development/dev-archive`. The Obsidian vault is `~/Documents/Development Archive` when that folder exists. Do not create a second vault.

```bash
curl "http://127.0.0.1:43187/api/context?q=<task or symbol>&budget=1800&format=md"
```

Use the pack. Open only the files listed under "Files to open". Do not dump a sibling repo into the prompt.

The server must already be running (`npm start` in this folder, http://127.0.0.1:43187). `/api/status` reports hostname, pid, and cwd. Re-index fails if Development is missing.

When the task is in another checkout, query with that repo's name. For several checkouts, name each repo in `q`. Worktrees belong in a sibling `<repo>-worktrees/<branch>` folder. Re-index after adding one.
