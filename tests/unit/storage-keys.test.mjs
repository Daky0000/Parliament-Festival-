import test from "node:test";
import assert from "node:assert";
import { assertSafeKey } from "../../src/lib/storage.ts";

test("storage keys accept app-shaped paths", () => {
  for (const key of ["events/abc/logo.png", "passes/2026/guest-123.pdf", "a_b-c.d"]) {
    assert.doesNotThrow(() => assertSafeKey(key), key);
  }
});

test("storage keys reject traversal, absolute and odd characters", () => {
  for (const key of ["../secret", "a/../../b", "/etc/passwd", "a b.png", "x?y", "", "a".repeat(513)]) {
    assert.throws(() => assertSafeKey(key), undefined, key);
  }
});
