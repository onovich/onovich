import assert from "node:assert/strict";
import test from "node:test";

import { validateConfig } from "../config.mjs";

test("fills the documented defaults for a valid username", () => {
  assert.deepEqual(validateConfig({ username: "onovich" }), {
    username: "onovich",
    top: 6,
    includeArchived: false,
    excludeRepositories: [],
    excludeLanguages: [],
    title: "Most Used Languages",
    width: 400
  });
});

test("rejects malformed, out-of-range, and unknown configuration", () => {
  assert.throws(
    () => validateConfig({ username: "" }),
    /username must be a non-empty string/
  );
  assert.throws(
    () => validateConfig({ username: "onovich", top: 13 }),
    /top must be an integer from 1 to 12/
  );
  assert.throws(
    () => validateConfig({ username: "onovich", width: 200 }),
    /width must be an integer from 320 to 800/
  );
  assert.throws(
    () => validateConfig({ username: "onovich", excludeLanguages: ["C#", 42] }),
    /excludeLanguages must contain only non-empty strings/
  );
  assert.throws(
    () => validateConfig({ username: "onovich", typo: true }),
    /unknown configuration key: typo/
  );
});
