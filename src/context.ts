import { config } from "./config.ts";
import { searchVault } from "./search.ts";
import { estimateTokens, readNote } from "./vault.ts";
import type { ContextNote, ContextPack } from "./types.ts";

const KIND_PRIORITY: Record<string, number> = {
  overview: 0,
  signals: 1,
  map: 2,
  moc: 3,
  log: 4,
  note: 5,
};

export async function buildContextPack(
  query: string,
  budget = config.defaultBudget,
): Promise<ContextPack> {
  const hits = await searchVault(query, 16);
  const ranked = [...hits].sort((a, b) => {
    const kind = (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9);
    if (kind !== 0) return kind;
    return b.score - a.score;
  });

  const notes: ContextNote[] = [];
  const filesToOpen = new Set<string>();
  let tokens = 0;

  for (const hit of ranked) {
    const body = await readNote(hit.path);
    const noteTokens = estimateTokens(body);
    if (notes.length && tokens + noteTokens > budget) continue;
    if (!notes.length && noteTokens > budget) {
      const clipped = clipToBudget(body, budget);
      notes.push({
        path: hit.path,
        title: hit.title,
        tokens: estimateTokens(clipped),
        body: clipped,
      });
      tokens += estimateTokens(clipped);
      continue;
    }
    notes.push({
      path: hit.path,
      title: hit.title,
      tokens: noteTokens,
      body,
    });
    tokens += noteTokens;
    for (const file of extractFiles(body)) filesToOpen.add(file);
    if (tokens >= budget) break;
  }

  return {
    query,
    budget,
    tokens,
    notes,
    filesToOpen: [...filesToOpen].slice(0, 12),
  };
}

function clipToBudget(body: string, budget: number): string {
  const maxChars = budget * 4;
  if (body.length <= maxChars) return body;
  return `${body.slice(0, maxChars - 1).trim()}…`;
}

function extractFiles(body: string): string[] {
  const files: string[] = [];
  for (const match of body.matchAll(/`([^`]+?\.[a-zA-Z0-9]+)`/g)) {
    const value = match[1];
    if (value.includes("/") && !value.startsWith("http")) files.push(value);
  }
  return files;
}

export function formatPackMarkdown(pack: ContextPack): string {
  const parts = [
    `# Context pack — ${pack.query}`,
    "",
    `${pack.tokens} tokens / ${pack.budget} budget · ${pack.notes.length} notes`,
    "",
  ];
  if (pack.filesToOpen.length) {
    parts.push("## Files to open", ...pack.filesToOpen.map((f) => `- \`${f}\``), "");
  }
  for (const note of pack.notes) {
    parts.push(`## ${note.title}`, `_${note.path} · ${note.tokens} tokens_`, "", note.body, "");
  }
  return parts.join("\n");
}
