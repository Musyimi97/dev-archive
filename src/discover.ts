import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.ts";
import type { RepoRef } from "./types.ts";

const SKIP_TOP = new Set([
  "node_modules",
  "Library",
  "Applications",
  "Development Archive",
  "dev-archive",
  "vault",
]);

const PROJECT_MARKERS = new Set([
  "package.json",
  "go.mod",
  "foundry.toml",
  "cargo.toml",
  "pyproject.toml",
  "readme.md",
  "makefile",
  "hardhat.config.ts",
  "hardhat.config.js",
  "docker-compose.yml",
  "compose.yaml",
]);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(dir, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

async function looksLikeProject(dir: string): Promise<boolean> {
  if (await isGitRepo(dir)) return true;
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return false;
  }
  return names.some((name) => PROJECT_MARKERS.has(name.toLowerCase()));
}

async function listDirs(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        !SKIP_TOP.has(entry.name),
    )
    .map((entry) => path.join(dir, entry.name));
}

function toRef(root: string, dir: string, name: string): RepoRef {
  return {
    name,
    slug: slugify(name),
    path: dir,
    relativeFromRoot: path.relative(root, dir),
  };
}

export async function discoverRepos(root: string): Promise<RepoRef[]> {
  let top: string[];
  try {
    top = await listDirs(root);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }

  const found: RepoRef[] = [];

  for (const dir of top) {
    if (path.resolve(dir) === ROOT) continue;
    if (await looksLikeProject(dir)) {
      found.push(toRef(root, dir, path.basename(dir)));
      continue;
    }

    let nested: string[];
    try {
      nested = await listDirs(dir);
    } catch {
      found.push(toRef(root, dir, path.basename(dir)));
      continue;
    }

    const children: RepoRef[] = [];
    for (const child of nested) {
      if (await looksLikeProject(child)) {
        children.push(
          toRef(root, child, `${path.basename(dir)}/${path.basename(child)}`),
        );
      }
    }

    if (children.length) found.push(...children);
    else found.push(toRef(root, dir, path.basename(dir)));
  }

  found.sort((a, b) => a.name.localeCompare(b.name));
  return found;
}
