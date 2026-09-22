import fs from "node:fs/promises";
import path from "node:path";

const CLAUDE_COMMAND = "dev-archive prep --hook=claude";
const CURSOR_COMMAND = "dev-archive prep --hook=cursor";

export async function installHooks(options: {
  claudeSettingsPath: string;
  cursorHooksPath: string;
}): Promise<void> {
  await writeJson(options.claudeSettingsPath, (current) => {
    const hooks = asRecord(current.hooks);
    const session = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
    const commands = session.flatMap((entry) => {
      const group = asRecord(entry);
      return Array.isArray(group.hooks) ? group.hooks : [];
    });
    const exists = commands.some((hook) => asRecord(hook).command === CLAUDE_COMMAND);
    if (!exists) {
      session.push({
        hooks: [{ type: "command", command: CLAUDE_COMMAND, timeout: 20 }],
      });
    }
    return { ...current, hooks: { ...hooks, SessionStart: session } };
  });

  await writeJson(options.cursorHooksPath, (current) => {
    const hooks = asRecord(current.hooks);
    const session = Array.isArray(hooks.sessionStart) ? hooks.sessionStart : [];
    const exists = session.some((hook) => asRecord(hook).command === CURSOR_COMMAND);
    if (!exists) {
      session.push({
        command: CURSOR_COMMAND,
        timeout: 20,
        failClosed: false,
      });
    }
    return { ...current, version: 1, hooks: { ...hooks, sessionStart: session } };
  });
}

async function writeJson(
  file: string,
  update: (current: Record<string, unknown>) => Record<string, unknown>,
): Promise<void> {
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tempFile = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    await fs.writeFile(tempFile, JSON.stringify(update(current), null, 2) + "\n");
    await fs.rename(tempFile, file);
  } catch (error) {
    await fs.rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
