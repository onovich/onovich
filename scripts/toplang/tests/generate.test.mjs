import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { generateTopLanguages } from "../generate.mjs";

test("generates an auditable SVG and JSON from the public configuration", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "toplang-generate-"));
  const configPath = join(workspace, "toplang.config.json");
  const outputDirectory = join(workspace, "assets");
  t.after(() => rm(workspace, { recursive: true, force: true }));

  await writeFile(
    configPath,
    JSON.stringify({ username: "onovich", title: "Top Languages" }),
    "utf8"
  );

  const summary = await generateTopLanguages({
    configPath,
    outputDirectory,
    token: "test-token",
    fetchImpl: async () => fixtureResponse(),
    sleep: async () => {},
    logger: { info() {} }
  });

  const svg = await readFile(join(outputDirectory, "top-langs.svg"), "utf8");
  const data = JSON.parse(
    await readFile(join(outputDirectory, "top-langs-data.json"), "utf8")
  );
  const firstJson = await readFile(
    join(outputDirectory, "top-langs-data.json"),
    "utf8"
  );

  await generateTopLanguages({
    configPath,
    outputDirectory,
    token: "test-token",
    fetchImpl: async () => fixtureResponse(),
    sleep: async () => {},
    logger: { info() {} }
  });

  assert.match(svg, /Top Languages/);
  assert.match(svg, />C#</);
  assert.equal(summary.repositoryCount, 1);
  assert.deepEqual(data, {
    schemaVersion: 1,
    username: "onovich",
    repositoryCount: 1,
    includedRepositoryCount: 1,
    totalBytes: 1_000,
    languages: [
      { name: "C#", bytes: 1_000, percentage: 100, color: "#178600" }
    ],
    filters: {
      includeForks: false,
      includeArchived: false,
      excludedRepositories: [],
      excludedLanguages: []
    }
  });
  assert.equal("generatedAt" in data, false);
  assert.equal(
    await readFile(join(outputDirectory, "top-langs.svg"), "utf8"),
    svg
  );
  assert.equal(
    await readFile(join(outputDirectory, "top-langs-data.json"), "utf8"),
    firstJson
  );
});

test("keeps the last successful outputs when pagination is incomplete", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "toplang-preserve-"));
  const configPath = join(workspace, "toplang.config.json");
  const outputDirectory = join(workspace, "assets");
  t.after(() => rm(workspace, { recursive: true, force: true }));

  await mkdir(outputDirectory);
  await writeFile(configPath, JSON.stringify({ username: "onovich" }), "utf8");
  await writeFile(join(outputDirectory, "top-langs.svg"), "last good svg", "utf8");
  await writeFile(
    join(outputDirectory, "top-langs-data.json"),
    "last good json",
    "utf8"
  );

  await assert.rejects(
    generateTopLanguages({
      configPath,
      outputDirectory,
      token: "test-token",
      fetchImpl: async () => fixtureResponse({ totalCount: 2 }),
      sleep: async () => {},
      logger: { info() {} }
    }),
    /reported 2 repositories but pagination returned 1/
  );

  assert.equal(
    await readFile(join(outputDirectory, "top-langs.svg"), "utf8"),
    "last good svg"
  );
  assert.equal(
    await readFile(join(outputDirectory, "top-langs-data.json"), "utf8"),
    "last good json"
  );
});

function fixtureResponse({ totalCount = 1 } = {}) {
  return new Response(JSON.stringify({
    data: {
      user: {
        repositories: {
          totalCount,
          nodes: [{
            id: "repo-1",
            name: "unity-game",
            isArchived: false,
            isFork: false,
            visibility: "PUBLIC",
            languages: {
              edges: [{
                size: 1_000,
                node: { name: "C#", color: "#178600" }
              }],
              pageInfo: { hasNextPage: false, endCursor: null }
            }
          }],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      },
      rateLimit: {
        cost: 1,
        remaining: 4_999,
        resetAt: "2030-01-01T00:00:00Z"
      }
    }
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
