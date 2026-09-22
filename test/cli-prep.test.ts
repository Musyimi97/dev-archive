import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDevArchiveArgs } from "../src/cli.ts";

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
    assert.equal(parseDevArchiveArgs(["nope"]), null);
  });
});
