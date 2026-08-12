const GRAPHQL_URL = "https://api.github.com/graphql";

const TOP_LANGUAGES_QUERY = [
  "query TopLanguages($login: String!, $cursor: String) {",
  "  user(login: $login) {",
  "    repositories(",
  "      first: 100",
  "      after: $cursor",
  "      ownerAffiliations: OWNER",
  "      isFork: false",
  "      privacy: PUBLIC",
  "      orderBy: { field: NAME, direction: ASC }",
  "    ) {",
  "      totalCount",
  "      nodes {",
  "        id",
  "        name",
  "        isArchived",
  "        isFork",
  "        visibility",
  "        languages(first: 100, orderBy: { field: SIZE, direction: DESC }) {",
  "          edges {",
  "            size",
  "            node { name color }",
  "          }",
  "          pageInfo { hasNextPage endCursor }",
  "        }",
  "      }",
  "      pageInfo { hasNextPage endCursor }",
  "    }",
  "  }",
  "  rateLimit { cost remaining resetAt }",
  "}"
].join("\n");

export async function fetchAllRepositories({
  username,
  token,
  fetchImpl = globalThis.fetch,
  maxPages = 20,
  maxRetries = 3,
  sleep = delay,
  logger = {}
}) {
  const client = createGitHubClient({
    token,
    fetchImpl,
    maxRetries,
    sleep,
    logger
  });
  const repositories = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursor = null;
  let pageCount = 0;
  let reportedRepositoryCount = null;
  let rateLimit = null;

  while (true) {
    if (pageCount >= maxPages) {
      throw new Error("GitHub repository pagination exceeded " + maxPages + " pages");
    }

    const response = await client.request({
      url: GRAPHQL_URL,
      operation: "GitHub GraphQL",
      method: "POST",
      body: JSON.stringify({
        query: TOP_LANGUAGES_QUERY,
        variables: { login: username, cursor }
      })
    });
    if (!response.ok) {
      throw new Error(
        "GitHub GraphQL request failed with HTTP " + response.status
          + requestIdSuffix(response)
      );
    }
    const payload = await parseJsonResponse(response, "GitHub GraphQL");
    if (payload.errors?.length) {
      throw new Error(
        "GitHub GraphQL returned errors: "
          + payload.errors.map((error) => error.message).join("; ")
      );
    }

    const connection = payload.data?.user?.repositories;
    if (!connection) {
      throw new Error('GitHub user "' + username + '" was not found');
    }

    reportedRepositoryCount ??= connection.totalCount;
    for (const node of connection.nodes) {
      if (seenIds.has(node.id)) {
        throw new Error("GitHub returned duplicate repository id " + node.id);
      }
      seenIds.add(node.id);
      repositories.push(await normalizeRepository(node, {
        username,
        client
      }));
    }

    pageCount += 1;
    rateLimit = payload.data.rateLimit ?? rateLimit;
    if (payload.data.rateLimit) {
      logger.info?.(
        "GitHub GraphQL rate limit: "
          + payload.data.rateLimit.remaining + " remaining; resets at "
          + payload.data.rateLimit.resetAt + "."
      );
    }

    if (!connection.pageInfo.hasNextPage) {
      break;
    }

    const nextCursor = connection.pageInfo.endCursor;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      throw new Error("GitHub returned an invalid or repeated repository cursor");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return {
    repositories,
    meta: {
      pageCount,
      reportedRepositoryCount,
      rateLimit
    }
  };
}

async function normalizeRepository(
  node,
  { username, client }
) {
  const languages = node.languages.pageInfo.hasNextPage
    ? await fetchCompleteLanguages({
      username,
      repository: node,
      client
    })
    : normalizeLanguageEdges(node.languages.edges);

  return {
    id: node.id,
    name: node.name,
    isArchived: node.isArchived,
    isFork: node.isFork,
    visibility: node.visibility,
    languages
  };
}

async function fetchCompleteLanguages({
  username,
  repository,
  client
}) {
  const url = "https://api.github.com/repos/"
    + encodeURIComponent(username)
    + "/"
    + encodeURIComponent(repository.name)
    + "/languages";
  const response = await client.request({
    url,
    operation: 'GitHub languages for "' + repository.name + '"'
  });
  if (!response.ok) {
    throw new Error(
      'GitHub languages request for "' + repository.name
        + '" failed with HTTP ' + response.status
        + requestIdSuffix(response)
    );
  }
  const payload = await parseJsonResponse(
    response,
    'GitHub languages for "' + repository.name + '"'
  );

  const knownColors = new Map(
    normalizeLanguageEdges(repository.languages.edges)
      .map((language) => [language.name, language.color])
  );
  return Object.entries(payload).map(([name, size]) => ({
    name,
    color: knownColors.get(name) ?? null,
    size
  }));
}

function normalizeLanguageEdges(edges) {
  return edges.map((edge) => ({
      name: edge.node.name,
      color: edge.node.color,
      size: edge.size
    }));
}

function createGitHubClient({ token, fetchImpl, maxRetries, sleep, logger }) {
  const baseHeaders = {
    accept: "application/vnd.github+json",
    authorization: "Bearer " + token,
    "x-github-api-version": "2022-11-28"
  };

  return {
    request({ url, operation, method = "GET", body }) {
      return requestWithRetry({
        fetchImpl,
        url,
        options: {
          method,
          headers: body
            ? { ...baseHeaders, "content-type": "application/json" }
            : { ...baseHeaders },
          ...(body === undefined ? {} : { body })
        },
        operation,
        maxRetries,
        sleep,
        logger
      });
    }
  };
}

async function requestWithRetry({
  fetchImpl,
  url,
  options,
  operation,
  maxRetries,
  sleep,
  logger
}) {
  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch (error) {
      if (attempt >= maxRetries) {
        throw new Error(
          operation + " network request failed: " + error.message,
          { cause: error }
        );
      }

      const waitMilliseconds = exponentialDelay(attempt);
      logger.warn?.(
        operation + " network request failed; retrying in "
          + waitMilliseconds + " ms."
      );
      await sleep(waitMilliseconds);
      continue;
    }

    logger.info?.(
      operation + " HTTP " + response.status
        + requestIdSuffix(response) + "."
    );
    if (!isRetryable(response.status) || attempt >= maxRetries) {
      return response;
    }

    const waitMilliseconds = retryDelay(response, attempt);
    logger.warn?.(
      operation + " returned HTTP " + response.status
        + "; retrying in " + waitMilliseconds + " ms."
    );
    await sleep(waitMilliseconds);
  }
}

function isRetryable(status) {
  return status === 403 || status === 429 || status >= 500;
}

function retryDelay(response, attempt) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return cappedDelay(seconds * 1_000);
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt) && retryAt > Date.now()) {
      return cappedDelay(retryAt - Date.now());
    }
  }

  const rateLimitReset = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(rateLimitReset) && rateLimitReset > 0) {
    const resetDelay = rateLimitReset * 1_000 - Date.now();
    if (resetDelay > 0) {
      return cappedDelay(resetDelay);
    }
  }

  return exponentialDelay(attempt);
}

function exponentialDelay(attempt) {
  return 250 * (2 ** attempt);
}

function cappedDelay(milliseconds) {
  return Math.min(Math.max(Math.ceil(milliseconds), 0), 60_000);
}

function requestIdSuffix(response) {
  const requestId = response.headers.get("x-github-request-id");
  return requestId ? "; request id " + requestId : "; request id unavailable";
}

async function parseJsonResponse(response, operation) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(
      operation + " returned invalid JSON" + requestIdSuffix(response),
      { cause: error }
    );
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
