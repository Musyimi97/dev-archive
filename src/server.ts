import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import staticFiles from "@fastify/static";
import { config, developmentExists, ROOT } from "./config.ts";
import { buildContextPack, formatPackMarkdown } from "./context.ts";
import { discoverRepos } from "./discover.ts";
import { getJob, runIndex } from "./index-job.ts";
import { searchVault } from "./search.ts";
import { ensureVault, listNotes, readNote, readState } from "./vault.ts";

const app = Fastify({ logger: false });

function processIdentity() {
  return {
    hostname: os.hostname(),
    pid: process.pid,
    cwd: process.cwd(),
  };
}

app.addHook("onSend", async (_request, reply) => {
  reply.header("cache-control", "no-store");
});

await app.register(cors, { origin: true });
await app.register(staticFiles, {
  root: path.join(ROOT, "public"),
  prefix: "/",
});

app.get("/api/health", async () => ({
  ok: true,
  developmentRoot: config.developmentRoot,
  vaultPath: config.vaultPath,
  port: config.port,
  ...processIdentity(),
}));

app.get("/api/status", async () => {
  const [repos, notes, state, rootStat] = await Promise.all([
    discoverRepos(config.developmentRoot),
    listNotes(),
    readState(),
    fs.stat(config.developmentRoot).catch(() => null),
  ]);
  return {
    ...processIdentity(),
    developmentRoot: config.developmentRoot,
    vaultPath: config.vaultPath,
    developmentExists: Boolean(rootStat),
    repoCount: repos.length,
    noteCount: notes.length,
    job: getJob(),
    repos: repos.map((repo) => ({
      name: repo.name,
      slug: repo.slug,
      path: repo.path,
      indexedAt: state.repos[repo.slug]?.indexedAt ?? null,
      head: state.repos[repo.slug]?.head ?? null,
    })),
  };
});

app.get("/api/search", async (request) => {
  const q = String((request.query as { q?: string }).q ?? "").trim();
  const limit = Number((request.query as { limit?: string }).limit ?? 12);
  if (!q) return { query: q, hits: [] };
  return { query: q, hits: await searchVault(q, Number.isFinite(limit) ? limit : 12) };
});

app.get("/api/context", async (request, reply) => {
  const q = String((request.query as { q?: string }).q ?? "").trim();
  const budget = Number(
    (request.query as { budget?: string }).budget ?? config.defaultBudget,
  );
  const format = String((request.query as { format?: string }).format ?? "json");
  if (!q) return reply.code(400).send({ error: "q is required" });
  const pack = await buildContextPack(q, Number.isFinite(budget) ? budget : config.defaultBudget);
  if (format === "md" || format === "markdown") {
    reply.header("content-type", "text/markdown; charset=utf-8");
    return formatPackMarkdown(pack);
  }
  return pack;
});

app.get("/api/notes", async () => ({ notes: await listNotes() }));

app.get("/api/notes/*", async (request, reply) => {
  const rel = (request.params as { "*": string })["*"];
  try {
    const body = await readNote(rel);
    return { path: rel, body };
  } catch (error) {
    return reply.code(404).send({
      error: error instanceof Error ? error.message : "note not found",
    });
  }
});

app.post("/api/index", async (request, reply) => {
  const force = Boolean((request.body as { force?: boolean } | undefined)?.force);
  const job = await runIndex(force);
  if (job.status === "error") {
    return reply.code(409).send({ error: job.error, job });
  }
  return job;
});

app.setNotFoundHandler((request, reply) => {
  if (request.raw.url?.startsWith("/api/")) {
    return reply.code(404).send({ error: "not found" });
  }
  return reply.sendFile("index.html");
});

async function readHealth(port: number): Promise<{
  developmentRoot?: string;
  vaultPath?: string;
  hostname?: string;
  pid?: number;
  cwd?: string;
} | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      developmentRoot?: string;
      vaultPath?: string;
      hostname?: string;
      pid?: number;
      cwd?: string;
    };
    return data.ok ? data : null;
  } catch {
    return null;
  }
}

await ensureVault();

try {
  const started = await app.listen({ port: config.port, host: config.host });
  console.log(`Dev Archive listening on ${started}`);
} catch (error) {
  const err = error as NodeJS.ErrnoException;
  if (err.code === "EADDRINUSE") {
    const existing = await readHealth(config.port);
    if (existing) {
      console.log(`Dev Archive is already running on http://127.0.0.1:${config.port}`);
      console.log(`Development: ${existing.developmentRoot}`);
      console.log(`Vault:       ${existing.vaultPath}`);
      console.log(`Server:      ${existing.hostname ?? "unknown"} pid ${existing.pid ?? "unknown"}`);
      console.log(`Cwd:         ${existing.cwd ?? "unknown"}`);
      process.exit(0);
    }
    console.error(`Port ${config.port} is already in use. Stop that process or set PORT=43188.`);
    process.exit(1);
  }
  throw error;
}

const identity = processIdentity();
console.log(`Development: ${config.developmentRoot}`);
console.log(`Vault:       ${config.vaultPath}`);
console.log(`Server:      ${identity.hostname} pid ${identity.pid}`);
console.log(`Cwd:         ${identity.cwd}`);
console.log(`UI:          http://127.0.0.1:${config.port}`);
console.log(`Obsidian → Open folder as vault → ${config.vaultPath}`);

if (process.env.AUTO_INDEX !== "0") {
  if (!developmentExists()) {
    console.log(`Development not found at ${config.developmentRoot}`);
    console.log("Set DEVELOPMENT_ROOT to your Development folder and restart.");
  } else {
    const notes = await listNotes();
    const repoNotes = notes.filter((note) => note.startsWith("Repos/"));
    if (repoNotes.length === 0) {
      console.log(`Indexing ${config.developmentRoot}…`);
      await runIndex(true);
    }
  }
}
