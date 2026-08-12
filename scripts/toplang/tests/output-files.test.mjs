import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeValidatedOutputs } from "../output-files.mjs";
import { renderSvg } from "../render-svg.mjs";

test("invalid SVG or JSON never replaces the last successful outputs", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "toplang-output-"));
  const outputDirectory = join(workspace, "assets");
  t.after(() => rm(workspace, { recursive: true, force: true }));

  await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, "top-langs.svg"), "last good svg", "utf8");
  await writeFile(
    join(outputDirectory, "top-langs-data.json"),
    "last good json",
    "utf8"
  );

  const expected = expectedOutput();
  const validSvg = renderSvg(expected.stats, expected.config);
  const validJson = JSON.stringify(expected.audit, null, 2) + "\n";

  await assert.rejects(
    writeValidatedOutputs({
      outputDirectory,
      svg: '<svg role="img" width="400" height="100" viewBox="0 0 400 100"><script></script></svg>\n',
      json: validJson,
      expectedAudit: expected.audit
    }),
    /forbidden SVG element/
  );
  await assertLastGood(outputDirectory);

  await assert.rejects(
    writeValidatedOutputs({
      outputDirectory,
      svg: validSvg.replace("</svg>", "</g>"),
      json: validJson,
      expectedAudit: expected.audit
    }),
    /mismatched closing elements/
  );
  await assertLastGood(outputDirectory);

  await assert.rejects(
    writeValidatedOutputs({
      outputDirectory,
      svg: validSvg.replace('viewBox="0 0 400 96"', 'viewBox="0 0 399 96"'),
      json: validJson,
      expectedAudit: expected.audit
    }),
    /viewBox must match/
  );
  await assertLastGood(outputDirectory);

  const invalidAudit = structuredClone(expected.audit);
  invalidAudit.languages[0].percentage = 99;
  await assert.rejects(
    writeValidatedOutputs({
      outputDirectory,
      svg: validSvg,
      json: JSON.stringify(invalidAudit, null, 2) + "\n",
      expectedAudit: expected.audit
    }),
    /percentage does not match its byte share/
  );
  await assertLastGood(outputDirectory);

  const invalidCounts = structuredClone(expected.audit);
  invalidCounts.repositoryCount = 0;
  await assert.rejects(
    writeValidatedOutputs({
      outputDirectory,
      svg: validSvg,
      json: JSON.stringify(invalidCounts, null, 2) + "\n",
      expectedAudit: expected.audit
    }),
    /includedRepositoryCount exceeds repositoryCount/
  );
  await assertLastGood(outputDirectory);
});

function expectedOutput() {
  const stats = {
    repositoryCount: 1,
    includedRepositoryCount: 1,
    totalBytes: 100,
    languages: [{
      name: "C#",
      bytes: 100,
      percentage: 100,
      color: "#178600"
    }]
  };
  const config = {
    username: "onovich",
    title: "Most Used Languages",
    top: 6,
    width: 400,
    includeArchived: false,
    excludeRepositories: [],
    excludeLanguages: []
  };
  const audit = {
    schemaVersion: 1,
    username: config.username,
    repositoryCount: stats.repositoryCount,
    includedRepositoryCount: stats.includedRepositoryCount,
    totalBytes: stats.totalBytes,
    languages: stats.languages,
    filters: {
      includeForks: false,
      includeArchived: false,
      excludedRepositories: [],
      excludedLanguages: []
    }
  };
  return { stats, config, audit };
}

async function assertLastGood(outputDirectory) {
  assert.equal(
    await readFile(join(outputDirectory, "top-langs.svg"), "utf8"),
    "last good svg"
  );
  assert.equal(
    await readFile(join(outputDirectory, "top-langs-data.json"), "utf8"),
    "last good json"
  );
}
