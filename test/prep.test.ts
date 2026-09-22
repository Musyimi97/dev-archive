import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HEALTH_WAIT_MS, runPrep, type PrepDeps } from "../src/prep.ts";

function deps(overrides: Partial<PrepDeps> = {}): PrepDeps {
  return {
    cwd: "/work/tokenization-api",
    hook: null,
    hostname: "Collinss-MacBook-Pro.local",
    expectedVaultPath: "/Users/collins/Documents/Development Archive",
    logPath: "/tmp/dev-archive.log",
    healthWaitMs: 30,
    fetchHealth: async () => ({
      ok: true,
      developmentRoot: "/Users/collins/Development",
      vaultPath: "/Users/collins/Documents/Development Archive",
      hostname: "Collinss-MacBook-Pro.local",
      pid: 95664,
    }),
    startServer: async () => {
      throw new Error("startServer should not be called");
    },
    developmentExists: () => true,
    index: async () => ({ status: "done", error: null }),
    indexedName: async () => "tokenization-api",
    packMarkdown: async (query) => `# Context pack — ${query}\n`,
    ...overrides,
  };
}

describe("runPrep", () => {
  it("uses a 15 second health wait by default", () => {
    assert.equal(HEALTH_WAIT_MS, 15_000);
  });

  it("stops before index when Development is missing", async () => {
    let indexed = false;
    const result = await runPrep(
      deps({
        fetchHealth: async () => ({
          ok: true,
          developmentRoot: "/missing/Development",
          vaultPath: "/Users/collins/Documents/Development Archive",
          hostname: "Collinss-MacBook-Pro.local",
          pid: 1,
        }),
        developmentExists: () => false,
        index: async () => {
          indexed = true;
          return { status: "done", error: null };
        },
      }),
    );
    assert.equal(indexed, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /\/missing\/Development/);
    assert.match(result.stderr, /nothing was written|Index aborted/);
  });

  it("stops when the vault path is not the configured vault", async () => {
    let indexed = false;
    const result = await runPrep(
      deps({
        fetchHealth: async () => ({
          ok: true,
          developmentRoot: "/Users/collins/Development",
          vaultPath: "/home/ubuntu/Documents/Development Archive",
          hostname: "Collinss-MacBook-Pro.local",
          pid: 42,
        }),
        index: async () => {
          indexed = true;
          return { status: "done", error: null };
        },
      }),
    );
    assert.equal(indexed, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Collinss-MacBook-Pro.local/);
    assert.match(result.stderr, /42/);
    assert.match(result.stderr, /\/home\/ubuntu\/Documents\/Development Archive/);
  });

  it("stops when this directory is not an indexed project", async () => {
    const result = await runPrep(deps({ indexedName: async () => null, cwd: "/work/dev-archive" }));
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /not an indexed project/);
    assert.match(result.stderr, /dev-archive/);
  });

  it("prints the markdown pack for this checkout", async () => {
    let query = "";
    const result = await runPrep(
      deps({
        packMarkdown: async (q) => {
          query = q;
          return `# Context pack — ${q}\n\nfiles\n`;
        },
      }),
    );
    assert.equal(result.code, 0);
    assert.equal(query, "tokenization-api");
    assert.match(result.stdout, /^# Context pack — tokenization-api/);
    assert.equal(result.stderr, "");
  });

  it("wraps a successful pack for Claude and Cursor hooks and exits 0", async () => {
    const claude = await runPrep(deps({ hook: "claude" }));
    const cursor = await runPrep(deps({ hook: "cursor" }));
    assert.equal(claude.code, 0);
    assert.equal(cursor.code, 0);
    const claudeBody = JSON.parse(claude.stdout);
    const cursorBody = JSON.parse(cursor.stdout);
    assert.match(claudeBody.hookSpecificOutput.additionalContext, /tokenization-api/);
    assert.equal(claudeBody.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(cursorBody.additional_context, /tokenization-api/);
    assert.equal(claude.stderr, "");
  });

  it("puts an index error in hook JSON and still exits 0", async () => {
    const result = await runPrep(
      deps({
        hook: "claude",
        index: async () => ({ status: "error", error: "index failed" }),
      }),
    );
    assert.equal(result.code, 0);
    const body = JSON.parse(result.stdout);
    assert.match(body.hookSpecificOutput.additionalContext, /index failed/);
  });

  it("puts a thrown prep error in hook JSON and still exits 0", async () => {
    const result = await runPrep(
      deps({
        hook: "cursor",
        indexedName: async () => {
          throw new Error("name lookup exploded");
        },
      }),
    );
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const body = JSON.parse(result.stdout);
    assert.match(body.additional_context, /name lookup exploded/);
  });

  it("returns a terminal index error with no pack", async () => {
    const result = await runPrep(
      deps({ index: async () => ({ status: "error", error: "index failed" }) }),
    );
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /index failed/);
  });

  it("starts the server when nothing is listening, then prints the pack", async () => {
    let started = 0;
    let polls = 0;
    const result = await runPrep(
      deps({
        fetchHealth: async () => {
          polls += 1;
          if (polls < 3) return null;
          return {
            ok: true,
            developmentRoot: "/Users/collins/Development",
            vaultPath: "/Users/collins/Documents/Development Archive",
            hostname: "Collinss-MacBook-Pro.local",
            pid: 7,
          };
        },
        startServer: async () => {
          started += 1;
        },
      }),
    );
    assert.equal(started, 1);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /tokenization-api/);
  });

  it("does not start a server when the port answers but is not Dev Archive", async () => {
    let started = 0;
    const result = await runPrep(
      deps({
        healthWaitMs: 20,
        fetchHealth: async () => ({ ok: false }),
        startServer: async () => {
          started += 1;
        },
      }),
    );
    assert.equal(started, 0);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /\/tmp\/dev-archive\.log/);
  });

  it("exits non-zero with an empty stdout when the server never answers", async () => {
    const started = Date.now();
    const result = await runPrep(
      deps({
        healthWaitMs: 40,
        fetchHealth: async () => null,
        startServer: async () => {},
      }),
    );
    assert.ok(Date.now() - started < 15_000);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /\/tmp\/dev-archive\.log/);
  });

  it("reports a dead server through hook JSON and exits 0", async () => {
    const result = await runPrep(
      deps({
        hook: "cursor",
        healthWaitMs: 20,
        fetchHealth: async () => null,
        startServer: async () => {},
      }),
    );
    assert.equal(result.code, 0);
    const body = JSON.parse(result.stdout);
    assert.match(body.additional_context, /dev-archive\.log/);
  });
});
