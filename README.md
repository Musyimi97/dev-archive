# Dev Archive

A small Node.js server that indexes the projects under `~/Development` into compact Obsidian notes, then serves search and a token-budgeted context pack. Cursor and Claude Code use the pack instead of loading a whole repo tree.

On this Mac the pieces are:

| Piece | Path |
| --- | --- |
| This server | `~/Development/dev-archive` |
| Projects it indexes | First-level folders next to it, plus one level of `*-worktrees/` checkouts |
| Obsidian vault | `~/Documents/Development Archive` when that folder already exists |
| UI | http://127.0.0.1:43187 |

The server does not create a second vault, and it does not index `dev-archive` itself.

## Run

```bash
cd ~/Development/dev-archive
npm install
npm start
```

Leave that process running while you work. The sidebar shows hostname, pid, and working directory so you can see which process the browser hit.

Re-index from the UI button, or:

```bash
curl -X POST http://127.0.0.1:43187/api/index \
  -H 'content-type: application/json' \
  -d '{"force":true}'
```

If `~/Development` is missing, re-index fails and writes nothing.

Each project becomes four notes under `Repos/<slug>/`: Overview, Map, Signals, Log. `Home.md` links them.

## Ask for context

```bash
curl "http://127.0.0.1:43187/api/context?q=tokenization-api+webhook&budget=1800&format=md"
```

Paste the markdown into the chat. Open only the paths under **Files to open**.

| Endpoint | Use |
| --- | --- |
| `GET /api/context?q=…&budget=1800&format=md` | Pack for an agent |
| `GET /api/search?q=…` | Ranked note hits |
| `GET /api/status` | Vault path, repo count, hostname, pid, cwd |
| `POST /api/index` | Rewrite notes. Unchanged HEADs are skipped unless `force` is true |

`PORT` defaults to `43187`. `DEVELOPMENT_ROOT` and `VAULT_PATH` override the folders. See `.env.example`.

## One repo

Open that repo as the Cursor or Claude Code workspace, for example `~/Development/tokenization-api`. Query with the repo name plus the task:

```bash
curl "http://127.0.0.1:43187/api/context?q=tokenization-api+issuance&budget=1800&format=md"
```

## Several repos, with worktrees

Keep each task in its own worktree, next to the main checkout:

```bash
cd ~/Development/tokenization-contracts
git fetch origin
git worktree add \
  ../tokenization-contracts-worktrees/kds-741-something \
  -b kds-741-something origin/main
```

Open each worktree as its own window. Name every repo the task touches:

```bash
curl "http://127.0.0.1:43187/api/context?q=tokenization-contracts+tokenization-api+issuance&budget=1800&format=md"
```

Click **Re-index vault** after you add a worktree or land a commit you want the notes to reflect.

## Cursor

Yes. With this folder open, Cursor reads `AGENTS.md` and should call `/api/context` instead of attaching a sibling repo.

With another repo open, the server is still on localhost. Paste the curl above into the chat, or add the same instruction as a user rule. The agent runs on your Mac, so `127.0.0.1:43187` is this process.

## Claude Code CLI

Yes. Same server, same curl. Claude Code reads `CLAUDE.md` when you launch it from this folder:

```bash
cd ~/Development/dev-archive
claude
```

From another repo, start Claude Code there and tell it to fetch the context URL, or put this in `~/.claude/CLAUDE.md` so every session sees it:

```markdown
Before reading a Development repo, fetch a context pack and open only the listed files:

curl "http://127.0.0.1:43187/api/context?q=<task or symbol>&budget=1800&format=md"
```

Start `npm start` in `dev-archive` first. Claude Code and Cursor both talk to that local process. They do not need a GitHub copy of the notes.

## Tests

```bash
npm test
```
