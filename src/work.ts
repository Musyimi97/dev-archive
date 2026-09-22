import path from "node:path";

export type WorkDeps = {
  cwd: string;
  branch: string;
  prep: (cwd: string) => Promise<{ code: number; stderr: string }>;
  execClaude: (cwd: string) => Promise<{ ok: true } | { ok: false }>;
  git: (
    args: string[],
    cwd: string,
  ) => Promise<{ code: number; stdout: string; stderr: string }>;
  exists: (target: string) => Promise<boolean>;
};

export function worktreePath(cwd: string, branch: string): string {
  const name = path.basename(cwd);
  return path.join(path.dirname(cwd), `${name}-worktrees`, branch);
}

export async function runWork(
  deps: WorkDeps,
): Promise<{ code: number; stdout: string; stderr: string }> {
  const inside = await deps.git(["rev-parse", "--is-inside-work-tree"], deps.cwd);
  if (inside.code !== 0 || inside.stdout.trim() !== "true") {
    return { code: 1, stdout: "", stderr: `${deps.cwd} is not a git checkout` };
  }

  const gitDir = await deps.git(["rev-parse", "--git-dir"], deps.cwd);
  const commonDir = await deps.git(["rev-parse", "--git-common-dir"], deps.cwd);
  if (path.resolve(deps.cwd, gitDir.stdout.trim()) !== path.resolve(deps.cwd, commonDir.stdout.trim())) {
    return { code: 1, stdout: "", stderr: `${deps.cwd} is already a worktree` };
  }

  const destination = worktreePath(deps.cwd, deps.branch);
  if (await deps.exists(destination)) {
    return { code: 1, stdout: "", stderr: `${destination} already exists` };
  }

  const branchRef = await deps.git(
    ["show-ref", "--verify", "--quiet", `refs/heads/${deps.branch}`],
    deps.cwd,
  );
  if (branchRef.code === 0) {
    return { code: 1, stdout: "", stderr: `branch ${deps.branch} already exists` };
  }

  const originMain = await deps.git(
    ["rev-parse", "--verify", "--quiet", "origin/main"],
    deps.cwd,
  );
  const base = originMain.code === 0 ? "origin/main" : "HEAD";
  const stderr = base === "HEAD" ? "origin/main is missing; using HEAD\n" : "";

  const added = await deps.git(
    ["worktree", "add", "-b", deps.branch, destination, base],
    deps.cwd,
  );
  if (added.code !== 0) {
    return { code: 1, stdout: "", stderr: stderr + added.stderr };
  }

  const prepared = await deps.prep(destination);
  if (prepared.code !== 0) {
    return { code: prepared.code, stdout: "", stderr: stderr + prepared.stderr };
  }

  const claude = await deps.execClaude(destination);
  if (!claude.ok) {
    return {
      code: 1,
      stdout: `${destination}\n`,
      stderr: stderr + "claude is not on PATH\n",
    };
  }
  return { code: 0, stdout: "", stderr };
}
