import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

type FileConfig = {
  developmentRoot?: string;
  vaultPath?: string;
};

loadDotEnv();
const fileConfig = loadFileConfig();

function loadDotEnv(): void {
  let text = "";
  try {
    text = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function loadFileConfig(): FileConfig {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(ROOT, "dev-archive.config.json"), "utf8"),
    ) as FileConfig;
  } catch {
    return {};
  }
}

function expand(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("~")) {
    return path.join(os.homedir(), trimmed.slice(1));
  }
  if (!path.isAbsolute(trimmed)) {
    return path.resolve(ROOT, trimmed);
  }
  return trimmed;
}

function isDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function macUserDevelopmentFolders(): string[] {
  try {
    return fs
      .readdirSync("/Users")
      .filter((name) => name !== "Shared" && !name.startsWith("."))
      .map((name) => path.join("/Users", name, "Development"));
  } catch {
    return [];
  }
}

function walkForDevelopment(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (dir.toLowerCase().endsWith(`${path.sep}development`) && isDir(dir)) {
      return dir;
    }
    for (const name of ["Development", "development"]) {
      const child = path.join(dir, name);
      if (isDir(child)) return child;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveDevelopmentRoot(): string {
  if (process.env.DEVELOPMENT_ROOT) {
    return expand(process.env.DEVELOPMENT_ROOT);
  }

  const parent = path.dirname(ROOT);
  if (path.basename(parent).toLowerCase() === "development" && isDir(parent)) {
    return parent;
  }

  const walked = walkForDevelopment(ROOT) || walkForDevelopment(process.cwd());
  if (walked) return walked;

  const configured = fileConfig.developmentRoot;
  if (configured && isDir(expand(configured))) {
    return expand(configured);
  }

  for (const candidate of [
    "/Users/collins/Development",
    ...macUserDevelopmentFolders(),
  ]) {
    if (isDir(candidate)) return candidate;
  }

  return "/Users/collins/Development";
}

export const config = {
  get port() {
    return Number(process.env.PORT || 43187);
  },
  get host() {
    return process.env.HOST || "127.0.0.1";
  },
  get developmentRoot() {
    return resolveDevelopmentRoot();
  },
  get vaultPath() {
    return resolveVaultPath();
  },
  get maxScanFiles() {
    return 400;
  },
  get maxFileBytes() {
    return 120_000;
  },
  get defaultBudget() {
    return 1800;
  },
};

export function defaultVaultPath(): string {
  return path.join(ROOT, "vault");
}

export function resolveVaultPath(): string {
  if (process.env.VAULT_PATH) return expand(process.env.VAULT_PATH);

  for (const dir of [
    path.join(os.homedir(), "Documents", "Development Archive"),
    "/Users/collins/Documents/Development Archive",
  ]) {
    if (isDir(dir)) return dir;
  }

  if (fileConfig.vaultPath) return expand(fileConfig.vaultPath);
  return defaultVaultPath();
}

export function developmentExists(): boolean {
  return isDir(config.developmentRoot);
}

export type Config = typeof config;
