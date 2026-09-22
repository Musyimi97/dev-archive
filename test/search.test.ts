import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tokenize } from "../src/search.ts";

describe("tokenize", () => {
  it("drops tiny tokens and lowercases", () => {
    assert.deepEqual(tokenize("POST /webhooks/stripe"), ["post", "/webhooks/stripe"]);
  });

  it("keeps dotted file paths", () => {
    assert.deepEqual(tokenize("src/auth.ts refresh"), ["src/auth.ts", "refresh"]);
  });
});
