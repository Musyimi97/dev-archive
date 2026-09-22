import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { ROOT, defaultVaultPath } from "../src/config.ts";

describe("vault path", () => {
  it("keeps the Obsidian vault inside this project", () => {
    assert.equal(defaultVaultPath(), path.join(ROOT, "vault"));
  });
});
