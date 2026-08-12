export function aggregateLanguages(repositories, config) {
  const totals = new Map();
  const excludedRepositories = new Set(config.excludeRepositories);
  const excludedLanguages = new Set(config.excludeLanguages);
  const includedRepositories = repositories.filter((repository) =>
    repository.visibility === "PUBLIC"
      && !repository.isFork
      && (config.includeArchived || !repository.isArchived)
      && !excludedRepositories.has(repository.name)
  );

  for (const repository of includedRepositories) {
    for (const language of repository.languages) {
      if (excludedLanguages.has(language.name)) {
        continue;
      }
      if (!Number.isSafeInteger(language.size) || language.size < 0) {
        throw new Error(
          'Language "' + language.name + '" has an invalid byte count'
        );
      }
      if (language.size === 0) {
        continue;
      }

      const current = totals.get(language.name) ?? {
        name: language.name,
        bytes: 0,
        color: language.color
      };
      current.bytes += language.size;
      totals.set(language.name, current);
    }
  }

  const totalBytes = [...totals.values()]
    .reduce((sum, language) => sum + language.bytes, 0);
  const languages = [...totals.values()]
    .sort((left, right) =>
      right.bytes - left.bytes || compareNames(left.name, right.name)
    )
    .map((language) => ({
      ...language,
      percentage: roundPercentage(language.bytes, totalBytes)
    }));

  return {
    repositoryCount: repositories.length,
    includedRepositoryCount: includedRepositories.length,
    totalBytes,
    languages
  };
}

function roundPercentage(bytes, totalBytes) {
  if (totalBytes === 0) {
    return 0;
  }

  return Math.round((bytes / totalBytes) * 1_000_000) / 10_000;
}

function compareNames(left, right) {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
