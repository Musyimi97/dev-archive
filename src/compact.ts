import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config.ts";
import {
  interestingFile,
  isManifest,
  isReadme,
  languageFromFile,
  skipDir,
} from "./ignore.ts";
import type { Commit, RepoCompact, RepoRef, Signal } from "./types.ts";

const exec = promisify(execFile);

type WalkedFile = {
  rel: string;
  abs: string;
  name: string;
};

export async function compactRepo(repo: RepoRef): Promise<RepoCompact> {
  const files = await walkRepo(repo.path);
  const languages = new Map<string, number>();
  const signals: Signal[] = [];
  const envKeys = new Set<string>();
  let readmeExcerpt = "";
  let readmeDepth = Number.POSITIVE_INFINITY;
  const stack = new Set<string>();
  const howToRun: string[] = [];
  let purpose = "";

  for (const file of files) {
    const lang = languageFromFile(file.name);
    if (lang) languages.set(lang, (languages.get(lang) ?? 0) + 1);

    let text = "";
    try {
      const buf = await fs.readFile(file.abs);
      if (buf.length > config.maxFileBytes) continue;
      text = buf.toString("utf8");
    } catch {
      continue;
    }

    if (isReadme(file.name)) {
      const depth = file.rel.split("/").length;
      if (depth < readmeDepth) {
        readmeExcerpt = excerptReadme(text);
        purpose = firstParagraph(text);
        readmeDepth = depth;
      }
    }

    if (isManifest(file.name)) {
      applyManifest(file.name, text, stack, howToRun, envKeys);
    }

    extractSignals(file.rel, text, signals, envKeys);
  }

  const git = await gitMeta(repo.path);
  if (!purpose) {
    purpose = git.lastCommitSubject || `Repository ${repo.name}`;
  }

  return {
    repo,
    head: git.head,
    branch: git.branch,
    lastCommitAt: git.lastCommitAt,
    lastCommitSubject: git.lastCommitSubject,
    languages: rankLanguages(languages),
    purpose: clip(purpose, 280),
    stack: [...stack],
    howToRun: howToRun.slice(0, 8),
    tree: renderTree(files.map((f) => f.rel)),
    signals: dedupeSignals(signals).slice(0, 48),
    envKeys: [...envKeys].sort().slice(0, 40),
    commits: git.commits,
    readmeExcerpt,
    fileCount: files.length,
    indexedAt: new Date().toISOString(),
  };
}

async function walkRepo(root: string): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];

  async function visit(dir: string): Promise<void> {
    if (out.length >= config.maxScanFiles) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= config.maxScanFiles) return;
      if (entry.isDirectory()) {
        if (skipDir(entry.name)) continue;
        await visit(path.join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (!interestingFile(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      out.push({
        abs,
        name: entry.name,
        rel: path.relative(root, abs).split(path.sep).join("/"),
      });
    }
  }

  await visit(root);
  return out;
}

function excerptReadme(text: string): string {
  const stripped = text
    .replace(/^---[\s\S]*?---\s*/, "")
    .split("\n")
    .filter((line) => !line.startsWith("# ") && !line.startsWith("!["))
    .join("\n")
    .trim();
  return clip(stripped, 900);
}

function firstParagraph(text: string): string {
  const lines = text
    .replace(/^---[\s\S]*?---\s*/, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("[") && !line.startsWith("!"));
  return clip(lines[0] ?? "", 280);
}

function applyManifest(
  name: string,
  text: string,
  stack: Set<string>,
  howToRun: string[],
  envKeys: Set<string>,
): void {
  const lower = name.toLowerCase();
  if (lower === "package.json") {
    try {
      const pkg = JSON.parse(text) as {
        name?: string;
        description?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      stack.add("Node.js");
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const dep of Object.keys(deps)) {
        if (["next", "react", "fastify", "express", "hono", "vite"].includes(dep)) {
          stack.add(dep);
        }
      }
      for (const [script, cmd] of Object.entries(pkg.scripts ?? {})) {
        if (["dev", "start", "test", "build", "lint"].includes(script)) {
          howToRun.push(`npm run ${script} — ${cmd}`);
        }
      }
    } catch {
      stack.add("Node.js");
    }
    return;
  }
  if (lower === "go.mod") {
    stack.add("Go");
    const module = text.match(/^module\s+(\S+)/m)?.[1];
    if (module) howToRun.push(`go run ./...  (${module})`);
    return;
  }
  if (lower === "pyproject.toml" || lower === "requirements.txt") {
    stack.add("Python");
    return;
  }
  if (lower === "cargo.toml") {
    stack.add("Rust");
    return;
  }
  if (lower === "foundry.toml") {
    stack.add("Foundry");
    return;
  }
  if (lower.includes("docker")) {
    stack.add("Docker");
    return;
  }
  if (lower.startsWith(".env")) {
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z][A-Z0-9_]+)=/);
      if (match) envKeys.add(match[1]);
    }
  }
}

function extractSignals(
  file: string,
  text: string,
  signals: Signal[],
  envKeys: Set<string>,
): void {
  const add = (kind: Signal["kind"], label: string) => {
    if (label && label.length < 120) signals.push({ kind, label, file });
  };

  for (const match of text.matchAll(
    /(?:app|router|r)\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/gi,
  )) {
    add("route", `${match[1].toUpperCase()} ${match[2]}`);
  }
  for (const match of text.matchAll(
    /@(Get|Post|Put|Patch|Delete)\(\s*["'`]([^"'`]+)["'`]/g,
  )) {
    add("route", `${match[1].toUpperCase()} ${match[2]}`);
  }
  for (const match of text.matchAll(
    /(?:export\s+(?:async\s+)?function|export\s+const|export\s+class|export\s+type|export\s+interface)\s+([A-Za-z0-9_]+)/g,
  )) {
    add("export", match[1]);
  }
  for (const match of text.matchAll(/^func\s+(?:\([^)]+\)\s+)?([A-Z][A-Za-z0-9_]+)/gm)) {
    add("export", match[1]);
  }
  for (const match of text.matchAll(
    /^(?:abstract\s+)?(?:contract|interface|library)\s+([A-Za-z0-9_]+)/gm,
  )) {
    add("type", match[1]);
  }
  for (const match of text.matchAll(
    /^\s+function\s+([A-Za-z0-9_]+)\s*\(/gm,
  )) {
    add("export", match[1]);
  }
  for (const match of text.matchAll(/^(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]+)/gm)) {
    add("export", match[1]);
  }
  for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
    envKeys.add(match[1]);
  }
  for (const match of text.matchAll(/os\.Getenv\(\s*["'`]([A-Z][A-Z0-9_]+)["'`]/g)) {
    envKeys.add(match[1]);
  }
  if (/(?:createServer|listen\(|Fastify|express\(\)|new Hono)/.test(text)) {
    add("entry", path.basename(file));
  }
}

function dedupeSignals(signals: Signal[]): Signal[] {
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (const signal of signals) {
    const key = `${signal.kind}:${signal.label}:${signal.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
  }
  return out;
}

function rankLanguages(counts: Map<string, number>): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 5);
}

function renderTree(paths: string[]): string {
  const limited = paths.slice(0, 80);
  return limited.map((p) => `- \`${p}\``).join("\n");
}

async function gitMeta(repoPath: string): Promise<{
  head: string;
  branch: string;
  lastCommitAt: string;
  lastCommitSubject: string;
  commits: Commit[];
}> {
  const empty = {
    head: "",
    branch: "",
    lastCommitAt: "",
    lastCommitSubject: "",
    commits: [] as Commit[],
  };
  try {
    const [head, branch, log] = await Promise.all([
      runGit(repoPath, ["rev-parse", "HEAD"]),
      runGit(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
      runGit(repoPath, ["log", "-12", "--format=%h|%ad|%s", "--date=short"]),
    ]);
    const commits = log
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, date, ...rest] = line.split("|");
        return { sha, date, subject: rest.join("|") };
      });
    return {
      head: head.slice(0, 12),
      branch,
      lastCommitAt: commits[0]?.date ?? "",
      lastCommitSubject: commits[0]?.subject ?? "",
      commits,
    };
  } catch {
    return empty;
  }
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, maxBuffer: 1024 * 1024 });
  return stdout.toString().trim();
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}
