import { randomUUID } from "node:crypto";
import { compactRepo } from "./compact.ts";
import { developmentExists, config } from "./config.ts";
import { discoverRepos } from "./discover.ts";
import { invalidateSearchCache } from "./search.ts";
import type { IndexJob, RepoCompact } from "./types.ts";
import {
  ensureVault,
  readState,
  writeHome,
  writeRepoNotes,
  writeState,
} from "./vault.ts";

const job: IndexJob = {
  id: "",
  status: "idle",
  startedAt: null,
  finishedAt: null,
  current: null,
  indexed: 0,
  skipped: 0,
  total: 0,
  error: null,
};

export function getJob(): IndexJob {
  return { ...job };
}

export async function runIndex(force = false): Promise<IndexJob> {
  if (job.status === "running") return getJob();
  job.id = randomUUID();
  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.current = "discovering";
  job.indexed = 0;
  job.skipped = 0;
  job.total = 0;
  job.error = null;

  try {
    if (!developmentExists()) {
      throw new Error(
        `No Development folder at ${config.developmentRoot}. Index aborted; nothing was written.`,
      );
    }
    await ensureVault();
    const repos = await discoverRepos(config.developmentRoot);
    job.total = repos.length;
    const state = await readState();
    const written: RepoCompact[] = [];

    for (const repo of repos) {
      job.current = repo.name;
      const compact = await compactRepo(repo);
      const prev = state.repos[repo.slug];
      if (!force && prev?.head && prev.head === compact.head) {
        job.skipped += 1;
        written.push(compact);
        continue;
      }
      await writeRepoNotes(compact);
      state.repos[repo.slug] = {
        head: compact.head,
        indexedAt: compact.indexedAt,
        path: repo.path,
      };
      written.push(compact);
      job.indexed += 1;
    }

    state.developmentRoot = config.developmentRoot;
    await writeHome(written);
    await writeState(state);
    invalidateSearchCache();
    job.status = "done";
    job.current = null;
    job.finishedAt = new Date().toISOString();
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
    job.finishedAt = new Date().toISOString();
  }

  return getJob();
}
