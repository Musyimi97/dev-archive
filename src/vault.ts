import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.ts";
import type { IndexState, RepoCompact } from "./types.ts";

const STATE_FILE = ".index-state.json";

export function repoDir(slug: string): string {
  return path.join(config.vaultPath, "Repos", slug);
}

export async function ensureVault(): Promise<void> {
  await fs.mkdir(path.join(config.vaultPath, "Repos"), { recursive: true });
  await fs.mkdir(path.join(config.vaultPath, ".obsidian"), { recursive: true });
  await writeIfMissing(
    path.join(config.vaultPath, ".obsidian", "app.json"),
    JSON.stringify(
      {
        legacyEditor: false,
        livePreview: true,
        showLineNumber: false,
        foldHeading: true,
        showFrontmatter: true,
      },
      null,
      2,
    ),
  );
  await writeIfMissing(
    path.join(config.vaultPath, ".obsidian", "appearance.json"),
    JSON.stringify({ baseFontSize: 16, theme: "obsidian" }, null, 2),
  );
  await writeIfMissing(
    path.join(config.vaultPath, ".obsidian", "core-plugins.json"),
    JSON.stringify(
      {
        graph: true,
        backlink: true,
        "file-explorer": true,
        search: true,
        outline: true,
        tag: true,
      },
      null,
      2,
    ),
  );
  await writeIfMissing(
    path.join(config.vaultPath, "Home.md"),
    `---
title: Development Archive
kind: moc
---

# Development Archive

This folder is the Obsidian vault. Keep it open while the server indexes \`Development\`.
`,
  );
}

export async function writeRepoNotes(compact: RepoCompact): Promise<void> {
  const dir = repoDir(compact.repo.slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "Overview.md"), overviewNote(compact));
  await fs.writeFile(path.join(dir, "Map.md"), mapNote(compact));
  await fs.writeFile(path.join(dir, "Signals.md"), signalsNote(compact));
  await fs.writeFile(path.join(dir, "Log.md"), logNote(compact));
}

export async function writeHome(compacts: RepoCompact[]): Promise<void> {
  await ensureVault();
  const rows = compacts
    .map((c) => {
      const langs = c.languages.join(", ") || "unknown";
      return `- [[Repos/${c.repo.slug}/Overview|${c.repo.name}]] — ${c.purpose} (${langs})`;
    })
    .join("\n");

  const body = `---
title: Development Archive
kind: moc
indexed_at: ${new Date().toISOString()}
repo_count: ${compacts.length}
---

# Development Archive

Compact notes for every git repo under \`${config.developmentRoot}\`.
Search this vault instead of loading a whole tree into an agent.

## How to load context

\`\`\`
curl "http://127.0.0.1:${config.port}/api/context?q=your+question&budget=1800&format=md"
\`\`\`

The server returns a token-budgeted pack of notes plus the few source files worth opening.

## Repos

${rows || "_No repos indexed yet. Point \`DEVELOPMENT_ROOT\` at your Development folder and run index._"}

## Notes

- Scope is **only** \`${config.developmentRoot}\` — nothing else on disk is scanned.
- Each repo becomes four notes: Overview, Map, Signals, Log.
- Re-index after a meaningful commit. Unchanged HEADs are skipped.
`;
  await fs.writeFile(path.join(config.vaultPath, "Home.md"), body);
}

export async function readState(): Promise<IndexState> {
  try {
    const raw = await fs.readFile(path.join(config.vaultPath, STATE_FILE), "utf8");
    return JSON.parse(raw) as IndexState;
  } catch {
    return { developmentRoot: config.developmentRoot, repos: {} };
  }
}

export async function writeState(state: IndexState): Promise<void> {
  await ensureVault();
  await fs.writeFile(
    path.join(config.vaultPath, STATE_FILE),
    JSON.stringify(state, null, 2),
  );
}

export async function listNotes(): Promise<string[]> {
  const notes: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(abs);
        continue;
      }
      if (entry.name.endsWith(".md")) {
        notes.push(path.relative(config.vaultPath, abs).split(path.sep).join("/"));
      }
    }
  }
  await visit(config.vaultPath);
  return notes.sort();
}

export async function readNote(relPath: string): Promise<string> {
  const safe = normalizeNotePath(relPath);
  return fs.readFile(path.join(config.vaultPath, safe), "utf8");
}

export function normalizeNotePath(relPath: string): string {
  const cleaned = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (cleaned.includes("..") || path.isAbsolute(cleaned)) {
    throw new Error("invalid note path");
  }
  if (!cleaned.endsWith(".md")) {
    throw new Error("not a note");
  }
  return cleaned;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

async function writeIfMissing(file: string, body: string): Promise<void> {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, body);
  }
}

function overviewNote(c: RepoCompact): string {
  return `---
title: ${c.repo.name}
repo: ${c.repo.name}
slug: ${c.repo.slug}
kind: overview
path: ${c.repo.path}
head: ${c.head}
branch: ${c.branch}
languages: [${c.languages.join(", ")}]
indexed_at: ${c.indexedAt}
---

# ${c.repo.name}

${c.purpose}

- **Path:** \`${c.repo.path}\`
- **HEAD:** \`${c.head}\` on \`${c.branch}\`
- **Stack:** ${c.stack.join(", ") || "see languages"}
- **Languages:** ${c.languages.join(", ") || "n/a"}
- **Last commit:** ${c.lastCommitAt} — ${c.lastCommitSubject}
- **Files scanned:** ${c.fileCount}

## Related

- [[Repos/${c.repo.slug}/Map|Map]]
- [[Repos/${c.repo.slug}/Signals|Signals]]
- [[Repos/${c.repo.slug}/Log|Log]]
- [[Home|Development Archive]]

## How to run

${c.howToRun.map((line) => `- \`${line}\``).join("\n") || "- _No start scripts found._"}

## README

${c.readmeExcerpt || "_No README excerpt._"}
`;
}

function mapNote(c: RepoCompact): string {
  return `---
title: ${c.repo.name} map
repo: ${c.repo.name}
slug: ${c.repo.slug}
kind: map
indexed_at: ${c.indexedAt}
---

# ${c.repo.name} — map

Important files only. Open these from disk; do not dump the tree into context.

${c.tree || "_Empty._"}
`;
}

function signalsNote(c: RepoCompact): string {
  const routes = c.signals.filter((s) => s.kind === "route");
  const exported = c.signals.filter((s) => s.kind === "export");
  const entries = c.signals.filter((s) => s.kind === "entry");
  return `---
title: ${c.repo.name} signals
repo: ${c.repo.name}
slug: ${c.repo.slug}
kind: signals
indexed_at: ${c.indexedAt}
---

# ${c.repo.name} — signals

Compact API / export map. Use this to decide which source file to open.

## Routes

${renderSignalList(routes)}

## Exports

${renderSignalList(exported)}

## Entrypoints

${renderSignalList(entries)}

## Env keys

${c.envKeys.map((k) => `- \`${k}\``).join("\n") || "- _None detected._"}
`;
}

function logNote(c: RepoCompact): string {
  const rows = c.commits
    .map((commit) => `- \`${commit.date}\` \`${commit.sha}\` ${commit.subject}`)
    .join("\n");
  return `---
title: ${c.repo.name} log
repo: ${c.repo.name}
slug: ${c.repo.slug}
kind: log
indexed_at: ${c.indexedAt}
---

# ${c.repo.name} — recent commits

${rows || "_No git history._"}
`;
}

function renderSignalList(items: RepoCompact["signals"]): string {
  if (!items.length) return "- _None detected._";
  return items.map((item) => `- \`${item.label}\` — \`${item.file}\``).join("\n");
}
