import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { compactRepo } from "../src/compact.ts";
import { buildContextPack } from "../src/context.ts";
import { discoverRepos } from "../src/discover.ts";
import { runIndex } from "../src/index-job.ts";
import { searchVault } from "../src/search.ts";
import { seedFixturesIfNeeded } from "../src/seed.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dev-archive-"));
const developmentRoot = path.join(tmp, "Development");
const vaultPath = path.join(tmp, "vault");

describe("Development archive", () => {
  before(() => {
    process.env.DEVELOPMENT_ROOT = developmentRoot;
    process.env.VAULT_PATH = vaultPath;
  });

  after(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("does not invent a Development folder", async () => {
    delete process.env.SEED_FIXTURES;
    const seeded = await seedFixturesIfNeeded();
    assert.equal(seeded, false);
    await assert.rejects(() => fs.access(developmentRoot), /ENOENT/);
    const job = await runIndex(true);
    assert.equal(job.status, "error");
    assert.match(job.error ?? "", /No Development folder/);
    assert.match(job.error ?? "", /nothing was written/);
    assert.equal(job.indexed, 0);
  });

  it("seeds fixtures only when SEED_FIXTURES=1", async () => {
    process.env.SEED_FIXTURES = "1";
    const seeded = await seedFixturesIfNeeded();
    assert.equal(seeded, true);
    const again = await seedFixturesIfNeeded();
    assert.equal(again, false);
  });

  it("discovers every project folder under Development", async () => {
    const loose = path.join(developmentRoot, "docs");
    await fs.mkdir(loose, { recursive: true });
    await fs.writeFile(path.join(loose, "README.md"), "# docs\nInternal notes.");
    const repos = await discoverRepos(developmentRoot);
    assert.deepEqual(
      repos.map((r) => r.name).sort(),
      ["docs", "email-ingest", "ledger-api", "merchant-web"],
    );
  });

  it("compacts routes and env keys without dumping source", async () => {
    const repos = await discoverRepos(developmentRoot);
    const ledger = repos.find((r) => r.slug === "ledger-api");
    assert.ok(ledger);
    const compact = await compactRepo(ledger);
    assert.ok(compact.signals.some((s) => s.label.includes("/webhooks/stripe")));
    assert.ok(compact.envKeys.includes("LEDGER_WEBHOOK_SECRET"));
    assert.ok(compact.purpose.includes("ledger"));
    assert.ok(compact.tree.includes("src/server.ts"));
  });

  it("indexes notes and returns a budgeted context pack", async () => {
    const job = await runIndex(true);
    assert.equal(job.status, "done");
    assert.ok(job.indexed >= 4);

    const hits = await searchVault("webhook secret", 8);
    assert.ok(hits.length > 0);
    assert.ok(hits.some((hit) => hit.path.includes("email-ingest") || hit.path.includes("ledger-api")));

    const pack = await buildContextPack("token refresh", 900);
    assert.ok(pack.tokens <= 900);
    assert.ok(pack.notes.length >= 1);
    assert.ok(pack.notes.some((note) => note.body.toLowerCase().includes("refresh")));
  });
});
