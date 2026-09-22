import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { runWork, worktreePath, type WorkDeps } from "../src/work.ts";

const repo = "/tmp/tokenization-contracts";

function gitOk(stdout = ""): { code: number; stdout: string; stderr: string } {
  return { code: 0, stdout, stderr: "" };
}

describe("runWork", () => {
  it("builds the sibling worktree path", () => {
    assert.equal(
      worktreePath(repo, "kds-741-something"),
      path.join("/tmp", "tokenization-contracts-worktrees", "kds-741-something"),
    );
  });

  it("refuses when the destination folder exists", async () => {
    const dest = worktreePath(repo, "kds-741-something");
    let added = false;
    const result = await runWork(
      base({
        exists: async (target) => target === dest,
        git: async (args) => {
          if (args[0] === "worktree") added = true;
          if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return gitOk("true\n");
          if (args.includes("--git-dir")) return gitOk(".git\n");
          if (args.includes("--git-common-dir")) return gitOk(".git\n");
          if (args[0] === "show-ref") return { code: 1, stdout: "", stderr: "" };
          return gitOk();
        },
      }),
    );
    assert.equal(added, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /tokenization-contracts-worktrees/);
  });

  it("refuses when the branch exists", async () => {
    let added = false;
    const result = await runWork(
      base({
        git: async (args) => {
          if (args[0] === "worktree") added = true;
          if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return gitOk("true\n");
          if (args.includes("--git-dir")) return gitOk(".git\n");
          if (args.includes("--git-common-dir")) return gitOk(".git\n");
          if (args[0] === "show-ref") return gitOk();
          return gitOk();
        },
      }),
    );
    assert.equal(added, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /kds-741-something/);
  });

  it("refuses inside an existing worktree", async () => {
    let added = false;
    const result = await runWork(
      base({
        git: async (args) => {
          if (args[0] === "worktree") added = true;
          if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return gitOk("true\n");
          if (args.includes("--git-dir")) return gitOk("/repo/.git/worktrees/kds\n");
          if (args.includes("--git-common-dir")) return gitOk("/repo/.git\n");
          return gitOk();
        },
      }),
    );
    assert.equal(added, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /already a worktree/);
  });

  it("fails closed when git directory checks fail", async () => {
    let added = false;
    const result = await runWork(
      base({
        git: async (args) => {
          if (args[0] === "worktree") added = true;
          if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return gitOk("true\n");
          if (args.includes("--git-dir") || args.includes("--git-common-dir")) {
            return { code: 128, stdout: "", stderr: "git metadata unavailable" };
          }
          return gitOk();
        },
      }),
    );
    assert.equal(added, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /git metadata|main checkout/);
  });

  it("uses the repository root when invoked from a subdirectory", async () => {
    const cwd = path.join(repo, "src");
    const destination = worktreePath(repo, "kds-741-something");
    let addedDestination = "";
    const result = await runWork(
      base({
        cwd,
        git: async (args) => {
          if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return gitOk("true\n");
          if (args.includes("--show-toplevel")) return gitOk(`${repo}\n`);
          if (args.includes("--git-dir")) return gitOk(`${repo}/.git\n`);
          if (args.includes("--git-common-dir")) return gitOk(`${repo}/.git\n`);
          if (args[0] === "show-ref") return { code: 1, stdout: "", stderr: "" };
          if (args[0] === "worktree") addedDestination = args[args.length - 2];
          if (args.includes("origin/main")) return gitOk("abc\n");
          return gitOk();
        },
      }),
    );
    assert.equal(result.code, 0);
    assert.equal(addedDestination, destination);
  });

  it("uses HEAD when origin/main is absent and says so", async () => {
    const added: string[][] = [];
    const result = await runWork(
      base({
        git: async (args) => {
          if (args[0] === "worktree") added.push(args);
          if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return gitOk("true\n");
          if (args.includes("--git-dir")) return gitOk(".git\n");
          if (args.includes("--git-common-dir")) return gitOk(".git\n");
          if (args[0] === "show-ref") return { code: 1, stdout: "", stderr: "" };
          if (args.includes("origin/main")) return { code: 1, stdout: "", stderr: "" };
          return gitOk();
        },
      }),
    );
    assert.equal(result.code, 0);
    assert.match(result.stderr, /HEAD/);
    assert.deepEqual(added[0].slice(-1), ["HEAD"]);
  });

  it("refuses when the directory is not a git checkout", async () => {
    let added = false;
    const result = await runWork(
      base({
        git: async (args) => {
          if (args[0] === "worktree") added = true;
          if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
            return { code: 128, stdout: "", stderr: "not a git repository" };
          }
          return gitOk();
        },
      }),
    );
    assert.equal(added, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /not a git checkout/);
  });

  it("prints the worktree path when claude cannot start", async () => {
    const dest = worktreePath(repo, "kds-741-something");
    const added: string[] = [];
    const result = await runWork(
      base({
        execClaude: async () => ({ ok: false }),
        git: async (args) => {
          if (args[0] === "worktree") added.push(args[args.length - 1]);
          if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return gitOk("true\n");
          if (args.includes("--git-dir")) return gitOk(".git\n");
          if (args.includes("--git-common-dir")) return gitOk(".git\n");
          if (args[0] === "show-ref") return { code: 1, stdout: "", stderr: "" };
          if (args.includes("origin/main")) return gitOk("abc\n");
          return gitOk();
        },
      }),
    );
    assert.equal(result.code, 1);
    assert.equal(result.stdout, `${dest}\n`);
    assert.deepEqual(added, ["origin/main"]);
  });

  it("returns Claude's exit status", async () => {
    const result = await runWork(
      base({
        execClaude: async () => ({ ok: true, code: 17 }),
      }),
    );
    assert.equal(result.code, 17);
  });
});

function base(overrides: Partial<WorkDeps> = {}): WorkDeps {
  return {
    cwd: repo,
    branch: "kds-741-something",
    prep: async () => ({ code: 0, stderr: "" }),
    execClaude: async () => ({ ok: true }),
    exists: async () => false,
    git: async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") return gitOk("true\n");
      if (args.includes("--show-toplevel")) return gitOk(`${repo}\n`);
      if (args.includes("--git-dir")) return gitOk(".git\n");
      if (args.includes("--git-common-dir")) return gitOk(".git\n");
      if (args[0] === "show-ref") return { code: 1, stdout: "", stderr: "" };
      if (args.includes("origin/main")) return gitOk("abc\n");
      return gitOk();
    },
    ...overrides,
  };
}
