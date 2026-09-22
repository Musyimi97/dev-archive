export const HEALTH_WAIT_MS = 15_000;

export type HealthInfo = {
  ok?: boolean;
  developmentRoot?: string;
  vaultPath?: string;
  hostname?: string;
  pid?: number;
};

export type PrepDeps = {
  cwd: string;
  hook: "claude" | "cursor" | null;
  hostname: string;
  expectedVaultPath: string;
  logPath: string;
  healthWaitMs?: number;
  fetchHealth: () => Promise<HealthInfo | null>;
  startServer: () => Promise<void>;
  developmentExists: (root: string) => boolean;
  index: () => Promise<{ status: "done" | "error"; error: string | null }>;
  indexedName: (cwd: string) => Promise<string | null>;
  packMarkdown: (query: string) => Promise<string>;
};

export async function runPrep(deps: PrepDeps): Promise<{ code: number; stdout: string; stderr: string }> {
  const fail = (message: string) => finish(deps.hook, 1, "", message);

  const health = await deps.fetchHealth();
  if (!health?.ok) {
    return fail(`Dev Archive is not healthy. See ${deps.logPath}`);
  }

  const developmentRoot = health.developmentRoot ?? "";
  if (!deps.developmentExists(developmentRoot)) {
    return fail(
      `No Development folder at ${developmentRoot}. Index aborted; nothing was written.`,
    );
  }

  if (health.hostname !== deps.hostname || health.vaultPath !== deps.expectedVaultPath) {
    return fail(
      `Refusing to use this process. hostname ${health.hostname ?? "unknown"} pid ${health.pid ?? "unknown"} vault ${health.vaultPath ?? "unknown"}`,
    );
  }

  const name = await deps.indexedName(deps.cwd);
  if (!name) {
    return fail(`${deps.cwd} is not an indexed project.`);
  }

  const job = await deps.index();
  if (job.status === "error") {
    return fail(job.error ?? "Index failed.");
  }

  const markdown = await deps.packMarkdown(name);
  return finish(deps.hook, 0, markdown, "");
}

function finish(
  hook: PrepDeps["hook"],
  code: number,
  markdown: string,
  error: string,
): { code: number; stdout: string; stderr: string } {
  if (hook === "claude") {
    return {
      code: 0,
      stdout: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: error || markdown,
        },
      }),
      stderr: "",
    };
  }
  if (hook === "cursor") {
    return {
      code: 0,
      stdout: JSON.stringify({ additional_context: error || markdown }),
      stderr: "",
    };
  }
  if (code !== 0) return { code, stdout: "", stderr: error };
  return { code: 0, stdout: markdown, stderr: "" };
}
