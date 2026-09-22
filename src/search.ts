import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.ts";
import { listNotes } from "./vault.ts";
import type { SearchHit } from "./types.ts";

type IndexedNote = {
  path: string;
  title: string;
  repo: string;
  kind: string;
  body: string;
  haystack: string;
};

let cache: { at: number; notes: IndexedNote[] } | null = null;
const CACHE_MS = 1500;

export async function searchVault(query: string, limit = 12): Promise<SearchHit[]> {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const notes = await loadNotes();
  const hits: SearchHit[] = [];

  for (const note of notes) {
    let score = 0;
    for (const term of terms) {
      if (note.path.toLowerCase().includes(term)) score += 8;
      if (note.title.toLowerCase().includes(term)) score += 10;
      if (note.repo.toLowerCase().includes(term)) score += 6;
      if (note.kind.toLowerCase().includes(term)) score += 3;
      const count = countTerm(note.haystack, term);
      if (count) score += Math.min(12, count * 2);
    }
    if (score <= 0) continue;
    hits.push({
      path: note.path,
      title: note.title,
      repo: note.repo,
      kind: note.kind,
      score,
      snippet: snippet(note.body, terms),
    });
  }

  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return hits.slice(0, limit);
}

export async function loadNotes(force = false): Promise<IndexedNote[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.notes;
  const paths = await listNotes();
  const notes: IndexedNote[] = [];
  for (const rel of paths) {
    const abs = path.join(config.vaultPath, rel);
    const body = await fs.readFile(abs, "utf8");
    const fm = parseFrontmatter(body);
    notes.push({
      path: rel,
      title: fm.title || rel.replace(/\.md$/, ""),
      repo: fm.repo || "",
      kind: fm.kind || "note",
      body,
      haystack: body.toLowerCase(),
    });
  }
  cache = { at: Date.now(), notes };
  return notes;
}

export function invalidateSearchCache(): void {
  cache = null;
}

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function countTerm(haystack: string, term: string): number {
  let n = 0;
  let i = 0;
  while (i < haystack.length) {
    const found = haystack.indexOf(term, i);
    if (found < 0) break;
    n += 1;
    i = found + term.length;
  }
  return n;
}

function snippet(body: string, terms: string[]): string {
  const plain = body.replace(/^---[\s\S]*?---\s*/, "").replace(/\s+/g, " ").trim();
  const lower = plain.toLowerCase();
  let idx = -1;
  for (const term of terms) {
    idx = lower.indexOf(term);
    if (idx >= 0) break;
  }
  const start = idx < 0 ? 0 : Math.max(0, idx - 70);
  const slice = plain.slice(start, start + 220);
  return `${start > 0 ? "…" : ""}${slice}${plain.length > start + 220 ? "…" : ""}`;
}

function parseFrontmatter(body: string): Record<string, string> {
  const match = body.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return out;
}
