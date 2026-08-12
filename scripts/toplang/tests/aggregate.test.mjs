import assert from "node:assert/strict";
import test from "node:test";

import { aggregateLanguages } from "../aggregate.mjs";

test("aggregates the same language across repositories by byte count", () => {
  const repositories = [
    repository("game-one", [{ name: "C#", size: 700, color: "#178600" }]),
    repository("game-two", [
      { name: "C#", size: 300, color: "#178600" },
      { name: "ShaderLab", size: 250, color: "#222c37" }
    ])
  ];

  const result = aggregateLanguages(repositories, defaultConfig());

  assert.equal(result.repositoryCount, 2);
  assert.equal(result.includedRepositoryCount, 2);
  assert.equal(result.totalBytes, 1_250);
  assert.deepEqual(result.languages, [
    { name: "C#", bytes: 1_000, percentage: 80, color: "#178600" },
    { name: "ShaderLab", bytes: 250, percentage: 20, color: "#222c37" }
  ]);
});

test("filters forks, private, archived, repository, and language exclusions", () => {
  const repositories = [
    repository("kept", [
      { name: "C#", size: 600, color: "#178600" },
      { name: "HTML", size: 400, color: "#e34c26" }
    ]),
    repository("forked", [{ name: "Rust", size: 900, color: "#dea584" }], {
      isFork: true
    }),
    repository("private", [{ name: "Swift", size: 800, color: "#f05138" }], {
      visibility: "PRIVATE"
    }),
    repository("archived", [{ name: "Python", size: 700, color: "#3572A5" }], {
      isArchived: true
    }),
    repository("ignored", [{ name: "C", size: 500, color: "#555555" }])
  ];

  const result = aggregateLanguages(repositories, defaultConfig({
    excludeRepositories: ["ignored"],
    excludeLanguages: ["HTML"]
  }));

  assert.equal(result.repositoryCount, 5);
  assert.equal(result.includedRepositoryCount, 1);
  assert.equal(result.totalBytes, 600);
  assert.deepEqual(result.languages, [
    { name: "C#", bytes: 600, percentage: 100, color: "#178600" }
  ]);
});

test("sorts tied byte counts by language name for deterministic output", () => {
  const result = aggregateLanguages([
    repository("ties", [
      { name: "TypeScript", size: 100, color: "#3178c6" },
      { name: "C#", size: 100, color: "#178600" }
    ])
  ], defaultConfig());

  assert.deepEqual(
    result.languages.map((language) => language.name),
    ["C#", "TypeScript"]
  );
});

test("returns a valid empty result when every repository is filtered", () => {
  const result = aggregateLanguages([
    repository("old", [{ name: "C", size: 100, color: "#555555" }], {
      isArchived: true
    })
  ], defaultConfig());

  assert.equal(result.includedRepositoryCount, 0);
  assert.equal(result.totalBytes, 0);
  assert.deepEqual(result.languages, []);
});

test("drops zero-byte language entries", () => {
  const result = aggregateLanguages([
    repository("empty-language", [
      { name: "HTML", size: 0, color: "#e34c26" }
    ])
  ], defaultConfig());

  assert.equal(result.includedRepositoryCount, 1);
  assert.equal(result.totalBytes, 0);
  assert.deepEqual(result.languages, []);
});

function repository(name, languages, overrides = {}) {
  return {
    id: "repo-" + name,
    name,
    isArchived: false,
    isFork: false,
    visibility: "PUBLIC",
    languages,
    ...overrides
  };
}

function defaultConfig(overrides = {}) {
  return {
    includeArchived: false,
    excludeRepositories: [],
    excludeLanguages: [],
    ...overrides
  };
}
