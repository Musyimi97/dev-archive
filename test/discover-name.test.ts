import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { after, describe, it } from "node:test";
import { indexedName } from "../src/discover.ts";

const exec = promisify(execFile);
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dev-archive-name-"));

async function gitInit(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await exec("git", ["init"], { cwd: dir });
  await fs.writeFile(path.join(dir, "README.md"), "# demo\n");
}

describe("indexedName", () => {
  after(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("uses the folder name for a first-level checkout", async () => {
    const root = path.join(tmp, "Development");
    const repo = path.join(root, "tokenization-api");
    await gitInit(repo);
    assert.equal(await indexedName(root, repo), "tokenization-api");
  });

  it("uses parent/child for a worktree under a non-project folder", async () => {
    const root = path.join(tmp, "Development-wt");
    const child = path.join(root, "tokenization-contracts-worktrees", "kds-741-something");
    await gitInit(child);
    assert.equal(
      await indexedName(root, child),
      "tokenization-contracts-worktrees/kds-741-something",
    );
  });

  it("returns null for the archive repo and for a folder outside Development", async () => {
    const root = path.join(tmp, "Development-miss");
    await fs.mkdir(path.join(root, "dev-archive"), { recursive: true });
    assert.equal(await indexedName(root, path.join(root, "dev-archive")), null);
    assert.equal(await indexedName(root, tmp), null);
  });
});
