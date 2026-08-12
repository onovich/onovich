import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { aggregateLanguages } from "./aggregate.mjs";
import { validateConfig } from "./config.mjs";
import { fetchAllRepositories } from "./github-client.mjs";
import { writeValidatedOutputs } from "./output-files.mjs";
import { renderSvg } from "./render-svg.mjs";

export async function generateTopLanguages({
  configPath = resolve("toplang.config.json"),
  outputDirectory = resolve("assets"),
  token,
  fetchImpl = globalThis.fetch,
  sleep,
  logger = console
} = {}) {
  if (typeof token !== "string" || token === "") {
    throw new Error("GITHUB_TOKEN is required");
  }

  const config = await readConfig(configPath);
  const { repositories, meta } = await fetchAllRepositories({
    username: config.username,
    token,
    fetchImpl,
    sleep,
    logger
  });

  if (repositories.length !== meta.reportedRepositoryCount) {
    throw new Error(
      "GitHub reported " + meta.reportedRepositoryCount
        + " repositories but pagination returned " + repositories.length
    );
  }

  const stats = aggregateLanguages(repositories, config);
  const audit = buildAudit(stats, config);
  const svg = renderSvg(stats, config);
  const json = JSON.stringify(audit, null, 2) + "\n";

  await writeValidatedOutputs({
    outputDirectory,
    svg,
    json,
    expectedAudit: audit
  });

  const summary = {
    repositoryCount: stats.repositoryCount,
    includedRepositoryCount: stats.includedRepositoryCount,
    languageCount: stats.languages.length,
    pageCount: meta.pageCount
  };
  logger.info(
    "Generated top languages card from "
      + summary.includedRepositoryCount + "/" + summary.repositoryCount
      + " repositories across " + summary.pageCount + " API page(s)."
  );
  return summary;
}

async function readConfig(configPath) {
  let input;
  try {
    input = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    throw new Error(
      'Unable to read configuration "' + configPath + '": ' + error.message,
      { cause: error }
    );
  }
  return validateConfig(input);
}

function buildAudit(stats, config) {
  return {
    schemaVersion: 1,
    username: config.username,
    repositoryCount: stats.repositoryCount,
    includedRepositoryCount: stats.includedRepositoryCount,
    totalBytes: stats.totalBytes,
    languages: stats.languages,
    filters: {
      includeForks: false,
      includeArchived: config.includeArchived,
      excludedRepositories: [...config.excludeRepositories],
      excludedLanguages: [...config.excludeLanguages]
    }
  };
}
