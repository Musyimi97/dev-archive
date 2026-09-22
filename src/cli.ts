import { execFile, spawn } from "node:child_process";
import { statSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ROOT, config } from "./config.ts";
import { buildContextPack, formatPackMarkdown } from "./context.ts";
import { indexedName } from "./discover.ts";
import { installHooks } from "./install-hooks.ts";
import { runIndex } from "./index-job.ts";
import { HEALTH_WAIT_MS, runPrep, type HealthInfo } from "./prep.ts";
import { searchVault } from "./search.ts";
import { ensureVault } from "./vault.ts";
import { runWork } from "./work.ts";

export type DevArchiveArgs =
  | { cmd: "prep"; hook: "claude" | "cursor" | null }
  | { cmd: "work"; branch: string }
  | { cmd: "install" };

export function parseDevArchiveArgs(argv: string[]): DevArchiveArgs | null {
  const [cmd, ...rest] = argv;
  if (cmd === "prep") {
    const hookFlag = rest.find((arg) => arg.startsWith("--hook="));
    if (rest.length > 1 || (rest.length === 1 && !hookFlag)) return null;
    if (!hookFlag) return { cmd: "prep", hook: null };
    const hook = hookFlag.slice("--hook=".length);
    if (hook !== "claude" && hook !== "cursor") return null;
    return { cmd: "prep", hook };
  }
  if (cmd === "work") {
    if (rest.length !== 1 || rest[0].startsWith("-")) return null;
    return { cmd: "work", branch: rest[0] };
  }
  if (cmd === "install" && rest.length === 0) return { cmd: "install" };
  return null;
}

const [, , cmd, ...rest] = process.argv;

const exec = promisify(execFile);
const parsed = parseDevArchiveArgs([cmd, ...rest].filter((part): part is string => part !== undefined));
if (cmd === "prep" || cmd === "work" || cmd === "install") {
  if (!parsed) {
    console.error("Usage: dev-archive <prep|work <branch>|install> [--hook=claude|cursor]");
    process.exit(1);
  }
  if (parsed.cmd === "install") {
    await installHooks({
      claudeSettingsPath: path.join(os.homedir(), ".claude", "settings.json"),
      cursorHooksPath: path.join(os.homedir(), ".cursor", "hooks.json"),
    });
    process.exit(0);
  }
  if (parsed.cmd === "prep") {
    const result = await runPrep(realPrepDeps(process.cwd(), parsed.hook));
    if (result.stderr) console.error(result.stderr);
    if (result.stdout) process.stdout.write(result.stdout);
    process.exit(result.code);
  }
  const result = await runWork({
    cwd: process.cwd(),
    branch: parsed.branch,
    exists: async (target) => {
      try {
        await fs.stat(target);
        return true;
      } catch {
        return false;
      }
    },
    git: async (args, cwd) => {
      try {
        const { stdout, stderr } = await exec("git", args, { cwd });
        return { code: 0, stdout, stderr };
      } catch (error) {
        const err = error as { code?: number; stdout?: string; stderr?: string };
        return {
          code: typeof err.code === "number" ? err.code : 1,
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
        };
      }
    },
    prep: async (cwd) => {
      const prepared = await runPrep(realPrepDeps(cwd, null));
      return { code: prepared.code, stderr: prepared.stderr };
    },
    execClaude: (cwd) =>
      new Promise((resolve) => {
        const child = spawn("claude", { cwd, stdio: "inherit" });
        child.on("error", () => resolve({ ok: false }));
        child.on("spawn", () => {
          child.unref();
          resolve({ ok: true });
        });
      }),
  });
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  process.exit(result.code);
}

if (cmd === "vault") {
  await ensureVault();
  console.log(config.vaultPath);
  console.log("Obsidian welcome screen → Open folder as vault → choose that folder.");
  process.exit(0);
}

if (cmd === "index") {
  const force = rest.includes("--force");
  const job = await runIndex(force);
  console.log(JSON.stringify(job, null, 2));
  process.exit(job.status === "error" ? 1 : 0);
}

if (cmd === "search") {
  const q = rest.filter((a) => !a.startsWith("--")).join(" ");
  const hits = await searchVault(q, 16);
  for (const hit of hits) {
    console.log(`${hit.score.toString().padStart(3)}  ${hit.path}  ${hit.snippet}`);
  }
  process.exit(0);
}

if (cmd === "context") {
  const q = rest.filter((a) => a !== "--md" && !a.startsWith("--budget")).join(" ");
  const budgetFlag = rest.find((a) => a.startsWith("--budget="));
  const budget = budgetFlag ? Number(budgetFlag.split("=")[1]) : config.defaultBudget;
  const pack = await buildContextPack(q, budget);
  if (rest.includes("--md")) {
    console.log(formatPackMarkdown(pack));
  } else {
    console.log(JSON.stringify(pack, null, 2));
  }
  process.exit(0);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  console.error("Usage: tsx src/cli.ts <vault|index|search|context> [query]");
  process.exit(1);
}

function realPrepDeps(cwd: string, hook: "claude" | "cursor" | null) {
  const port = config.port;
  return {
    cwd,
    hook,
    hostname: os.hostname(),
    expectedVaultPath: config.vaultPath,
    logPath: path.join(os.homedir(), "Library", "Logs", "dev-archive.log"),
    healthWaitMs: HEALTH_WAIT_MS,
    fetchHealth: () => fetchHealth(port),
    startServer: () => startDetached(ROOT),
    developmentExists: (root: string) => {
      try {
        return statSync(root).isDirectory();
      } catch {
        return false;
      }
    },
    index: async () => {
      const job = await runIndex(false);
      if (job.status === "error") return { status: "error" as const, error: job.error };
      return { status: "done" as const, error: null };
    },
    indexedName: (dir: string) => indexedName(config.developmentRoot, dir),
    packMarkdown: async (query: string) =>
      formatPackMarkdown(await buildContextPack(query, config.defaultBudget)),
  };
}

async function fetchHealth(port: number): Promise<HealthInfo | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    if (!response.ok) return { ok: false };
    return (await response.json()) as HealthInfo;
  } catch {
    return null;
  }
}

async function startDetached(archiveRoot: string): Promise<void> {
  const logPath = path.join(os.homedir(), "Library", "Logs", "dev-archive.log");
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  const logFd = await fs.open(logPath, "a");
  const child = spawn("npm", ["start"], {
    cwd: archiveRoot,
    detached: true,
    stdio: ["ignore", logFd.fd, logFd.fd],
  });
  child.unref();
  logFd.close();
}
