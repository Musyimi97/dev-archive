import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchHealth,
  parseDevArchiveArgs,
  realPrepDeps,
  resolveHookCwd,
} from "../src/cli.ts";

describe("parseDevArchiveArgs", () => {
  it("parses prep, hook mode, work, and install", () => {
    assert.deepEqual(parseDevArchiveArgs(["prep"]), { cmd: "prep", hook: null });
    assert.deepEqual(parseDevArchiveArgs(["prep", "--hook=claude"]), {
      cmd: "prep",
      hook: "claude",
    });
    assert.deepEqual(parseDevArchiveArgs(["prep", "--hook=cursor"]), {
      cmd: "prep",
      hook: "cursor",
    });
    assert.deepEqual(parseDevArchiveArgs(["work", "kds-741-something"]), {
      cmd: "work",
      branch: "kds-741-something",
    });
    assert.deepEqual(parseDevArchiveArgs(["install"]), { cmd: "install" });
  });

  it("rejects a bad hook and a missing branch", () => {
    assert.equal(parseDevArchiveArgs(["prep", "--hook=nope"]), null);
    assert.equal(parseDevArchiveArgs(["work"]), null);
    assert.equal(parseDevArchiveArgs(["work", ""]), null);
    assert.equal(parseDevArchiveArgs(["nope"]), null);
  });
});

describe("resolveHookCwd", () => {
  it("uses Claude cwd from hook JSON", () => {
    assert.equal(
      resolveHookCwd("claude", JSON.stringify({ cwd: "/work/claude" }), "/fallback"),
      "/work/claude",
    );
  });

  it("prefers the first Cursor workspace root and falls back to cwd", () => {
    assert.equal(
      resolveHookCwd(
        "cursor",
        JSON.stringify({ workspace_roots: ["/work/cursor"], cwd: "/work/cwd" }),
        "/fallback",
      ),
      "/work/cursor",
    );
    assert.equal(
      resolveHookCwd("cursor", JSON.stringify({ workspace_roots: [], cwd: "/work/cwd" }), "/fallback"),
      "/work/cwd",
    );
  });

  it("falls back for terminal prep, empty input, and invalid JSON", () => {
    assert.equal(resolveHookCwd(null, JSON.stringify({ cwd: "/ignored" }), "/fallback"), "/fallback");
    assert.equal(resolveHookCwd("claude", "", "/fallback"), "/fallback");
    assert.equal(resolveHookCwd("cursor", "not json", "/fallback"), "/fallback");
  });
});

describe("prep HTTP dependencies", () => {
  it("indexes and fetches markdown through the server", async () => {
    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith("/api/index")) {
        return new Response(JSON.stringify({ status: "done" }), { status: 200 });
      }
      return new Response("# server pack\n", { status: 200 });
    };
    try {
      const deps = realPrepDeps("/work/repo", null);
      assert.deepEqual(await deps.index(), { status: "done", error: null });
      assert.equal(await deps.packMarkdown("repo/name"), "# server pack\n");
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.match(requests[0].url, /\/api\/index$/);
    assert.equal(requests[0].init?.method, "POST");
    assert.equal(requests[0].init?.body, "{}");
    assert.match(requests[1].url, /\/api\/context\?/);
    assert.match(requests[1].url, /q=repo%2Fname/);
    assert.match(requests[1].url, /format=md/);
  });

  it("maps an index conflict error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "index busy" }), { status: 409 });
    try {
      const deps = realPrepDeps("/work/repo", null);
      assert.deepEqual(await deps.index(), { status: "error", error: "index busy" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats a non-JSON health response as an unhealthy listener and sets a timeout", async () => {
    const originalFetch = globalThis.fetch;
    let signal: AbortSignal | null | undefined;
    globalThis.fetch = async (_input, init) => {
      signal = init?.signal;
      return new Response("not json", { status: 200 });
    };
    try {
      assert.deepEqual(await fetchHealth(12345), { ok: false });
    } finally {
      globalThis.fetch = originalFetch;
    }
    assert.ok(signal instanceof AbortSignal);
  });
});
