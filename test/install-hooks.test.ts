import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { installHooks } from "../src/install-hooks.ts";

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dev-archive-hooks-"));
const claudeSettingsPath = path.join(tmp, "claude-settings.json");
const cursorHooksPath = path.join(tmp, "hooks.json");

describe("installHooks", () => {
  after(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("writes both hook commands and does not duplicate them", async () => {
    await fs.writeFile(
      claudeSettingsPath,
      JSON.stringify({ theme: "dark" }),
    );
    await installHooks({ claudeSettingsPath, cursorHooksPath });
    await installHooks({ claudeSettingsPath, cursorHooksPath });

    const claude = JSON.parse(await fs.readFile(claudeSettingsPath, "utf8"));
    const cursor = JSON.parse(await fs.readFile(cursorHooksPath, "utf8"));
    assert.equal(claude.theme, "dark");
    assert.equal(claude.hooks.SessionStart.length, 1);
    assert.equal(
      claude.hooks.SessionStart[0].hooks[0].command,
      "dev-archive prep --hook=claude",
    );
    assert.equal(claude.hooks.SessionStart[0].hooks[0].type, "command");
    assert.equal(claude.hooks.SessionStart[0].hooks[0].timeout, 20);
    assert.equal(cursor.version, 1);
    assert.equal(cursor.hooks.sessionStart.length, 1);
    assert.equal(cursor.hooks.sessionStart[0].command, "dev-archive prep --hook=cursor");
    assert.equal(cursor.hooks.sessionStart[0].timeout, 20);
    assert.equal(cursor.hooks.sessionStart[0].failClosed, false);
  });

  it("preserves existing hooks and unrelated settings", async () => {
    const claudePath = path.join(tmp, "preserve-claude.json");
    const cursorPath = path.join(tmp, "preserve-cursor.json");
    const existingClaudeHook = { hooks: [{ type: "command", command: "existing claude hook" }] };
    const existingCursorHook = { command: "existing cursor hook", timeout: 5 };
    await fs.writeFile(
      claudePath,
      JSON.stringify({ theme: "light", hooks: { SessionStart: [existingClaudeHook], Stop: ["keep"] } }),
    );
    await fs.writeFile(
      cursorPath,
      JSON.stringify({
        custom: true,
        hooks: { sessionStart: [existingCursorHook], afterFileEdit: ["keep"] },
      }),
    );

    await installHooks({ claudeSettingsPath: claudePath, cursorHooksPath: cursorPath });

    const claude = JSON.parse(await fs.readFile(claudePath, "utf8"));
    const cursor = JSON.parse(await fs.readFile(cursorPath, "utf8"));
    assert.deepEqual(claude.hooks.SessionStart[0], existingClaudeHook);
    assert.deepEqual(claude.hooks.Stop, ["keep"]);
    assert.equal(claude.theme, "light");
    assert.deepEqual(cursor.hooks.sessionStart[0], existingCursorHook);
    assert.deepEqual(cursor.hooks.afterFileEdit, ["keep"]);
    assert.equal(cursor.custom, true);
  });

  it("does not overwrite malformed JSON", async () => {
    const malformedPath = path.join(tmp, "malformed-claude.json");
    const cursorPath = path.join(tmp, "malformed-cursor.json");
    await fs.writeFile(malformedPath, "{ definitely not json");

    await assert.rejects(
      installHooks({ claudeSettingsPath: malformedPath, cursorHooksPath: cursorPath }),
      SyntaxError,
    );
    assert.equal(await fs.readFile(malformedPath, "utf8"), "{ definitely not json");
    await assert.rejects(fs.stat(cursorPath), { code: "ENOENT" });
  });
});
