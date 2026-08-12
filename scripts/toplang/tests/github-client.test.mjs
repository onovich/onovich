import assert from "node:assert/strict";
import test from "node:test";

import { fetchAllRepositories } from "../github-client.mjs";

test("fetches every repository page after the first 100 results", async () => {
  const seenCursors = [];
  const fetchImpl = async (_url, options) => {
    const { variables } = JSON.parse(options.body);
    seenCursors.push(variables.cursor);

    if (variables.cursor === null) {
      return graphqlResponse(repositoryPage({
        names: Array.from({ length: 100 }, (_, index) => "repo-" + (index + 1)),
        hasNextPage: true,
        endCursor: "page-2",
        totalCount: 166
      }));
    }

    return graphqlResponse(repositoryPage({
      names: Array.from({ length: 66 }, (_, index) => "repo-" + (index + 101)),
      hasNextPage: false,
      endCursor: null,
      totalCount: 166
    }));
  };

  const result = await fetchAllRepositories({
    username: "onovich",
    token: "test-token",
    fetchImpl,
    sleep: async () => {}
  });

  assert.deepEqual(seenCursors, [null, "page-2"]);
  assert.equal(result.repositories.length, 166);
  assert.equal(result.repositories[0].name, "repo-1");
  assert.equal(result.repositories.at(-1).name, "repo-166");
  assert.equal(result.meta.pageCount, 2);
  assert.equal(result.meta.reportedRepositoryCount, 166);
});

test("falls back to the REST languages endpoint instead of truncating a repository", async () => {
  const requestedUrls = [];
  const fetchImpl = async (url) => {
    requestedUrls.push(url);

    if (url === "https://api.github.com/graphql") {
      const page = repositoryPage({
        names: ["language-heavy"],
        hasNextPage: false,
        endCursor: null,
        totalCount: 1
      });
      page.data.user.repositories.nodes[0].languages.pageInfo.hasNextPage = true;
      return graphqlResponse(page);
    }

    return graphqlResponse({
      "C#": 100,
      "ShaderLab": 50
    });
  };

  const result = await fetchAllRepositories({
    username: "onovich",
    token: "test-token",
    fetchImpl,
    sleep: async () => {}
  });

  assert.deepEqual(requestedUrls, [
    "https://api.github.com/graphql",
    "https://api.github.com/repos/onovich/language-heavy/languages"
  ]);
  assert.deepEqual(result.repositories[0].languages, [
    { name: "C#", color: "#178600", size: 100 },
    { name: "ShaderLab", color: null, size: 50 }
  ]);
});

test("retries a transient GitHub failure before giving up", async () => {
  let requestCount = 0;
  let sleepCount = 0;
  const fetchImpl = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return graphqlResponse({ message: "temporary failure" }, 503);
    }

    return graphqlResponse(repositoryPage({
      names: ["recovered"],
      hasNextPage: false,
      endCursor: null,
      totalCount: 1
    }));
  };

  const result = await fetchAllRepositories({
    username: "onovich",
    token: "test-token",
    fetchImpl,
    sleep: async () => {
      sleepCount += 1;
    }
  });

  assert.equal(requestCount, 2);
  assert.equal(sleepCount, 1);
  assert.equal(result.repositories[0].name, "recovered");
});

test("rejects partial GraphQL data when GitHub also reports errors", async () => {
  const partial = repositoryPage({
    names: ["partial"],
    hasNextPage: false,
    endCursor: null,
    totalCount: 1
  });
  partial.errors = [{ message: "Something could not be resolved" }];

  await assert.rejects(
    fetchAllRepositories({
      username: "onovich",
      token: "test-token",
      fetchImpl: async () => graphqlResponse(partial),
      sleep: async () => {}
    }),
    /GraphQL returned errors: Something could not be resolved/
  );
});

test("rejects an incomplete page cursor instead of silently truncating", async () => {
  await assert.rejects(
    fetchAllRepositories({
      username: "onovich",
      token: "test-token",
      fetchImpl: async () => graphqlResponse(repositoryPage({
        names: ["first-page-only"],
        hasNextPage: true,
        endCursor: null,
        totalCount: 101
      })),
      sleep: async () => {}
    }),
    /invalid or repeated repository cursor/
  );
});

test("does not retry an authentication failure", async () => {
  let requestCount = 0;
  let sleepCount = 0;

  await assert.rejects(
    fetchAllRepositories({
      username: "onovich",
      token: "bad-token",
      fetchImpl: async () => {
        requestCount += 1;
        return graphqlResponse({ message: "Bad credentials" }, 401);
      },
      sleep: async () => {
        sleepCount += 1;
      }
    }),
    /HTTP 401/
  );

  assert.equal(requestCount, 1);
  assert.equal(sleepCount, 0);
});

test("retries a transient network exception", async () => {
  let requestCount = 0;
  const waits = [];
  const result = await fetchAllRepositories({
    username: "onovich",
    token: "test-token",
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) {
        throw new TypeError("fetch failed");
      }
      return graphqlResponse(repositoryPage({
        names: ["after-network-retry"],
        hasNextPage: false,
        endCursor: null,
        totalCount: 1
      }));
    },
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
    }
  });

  assert.equal(requestCount, 2);
  assert.deepEqual(waits, [250]);
  assert.equal(result.repositories[0].name, "after-network-retry");
});

test("honors Retry-After for 403 and 429 responses", async (t) => {
  for (const status of [403, 429]) {
    await t.test("HTTP " + status, async () => {
      let requestCount = 0;
      const waits = [];
      await fetchAllRepositories({
        username: "onovich",
        token: "test-token",
        fetchImpl: async () => {
          requestCount += 1;
          if (requestCount === 1) {
            return graphqlResponse(
              { message: "slow down" },
              status,
              { "retry-after": "2" }
            );
          }
          return graphqlResponse(repositoryPage({
            names: ["after-rate-limit"],
            hasNextPage: false,
            endCursor: null,
            totalCount: 1
          }));
        },
        sleep: async (milliseconds) => {
          waits.push(milliseconds);
        }
      });

      assert.equal(requestCount, 2);
      assert.deepEqual(waits, [2_000]);
    });
  }
});

test("logs status, request id, and remaining limit without exposing the token", async () => {
  const messages = [];
  await fetchAllRepositories({
    username: "onovich",
    token: "secret-test-token",
    fetchImpl: async () => graphqlResponse(repositoryPage({
      names: ["observable"],
      hasNextPage: false,
      endCursor: null,
      totalCount: 1
    })),
    sleep: async () => {},
    logger: {
      info(message) {
        messages.push(message);
      },
      warn(message) {
        messages.push(message);
      }
    }
  });

  assert.match(messages.join("\n"), /HTTP 200; request id TEST:123/);
  assert.match(messages.join("\n"), /4999 remaining/);
  assert.doesNotMatch(messages.join("\n"), /secret-test-token/);
});

test("follows a three-page repository connection", async () => {
  const pages = new Map([
    [null, {
      names: ["repo-1"],
      hasNextPage: true,
      endCursor: "page-2",
      totalCount: 3
    }],
    ["page-2", {
      names: ["repo-2"],
      hasNextPage: true,
      endCursor: "page-3",
      totalCount: 3
    }],
    ["page-3", {
      names: ["repo-3"],
      hasNextPage: false,
      endCursor: null,
      totalCount: 3
    }]
  ]);

  const result = await fetchAllRepositories({
    username: "onovich",
    token: "test-token",
    fetchImpl: async (_url, options) => {
      const { variables } = JSON.parse(options.body);
      return graphqlResponse(repositoryPage(pages.get(variables.cursor)));
    },
    sleep: async () => {}
  });

  assert.equal(result.meta.pageCount, 3);
  assert.deepEqual(
    result.repositories.map((repository) => repository.name),
    ["repo-1", "repo-2", "repo-3"]
  );
});

test("rejects duplicate repository ids across pages", async () => {
  let requestCount = 0;
  await assert.rejects(
    fetchAllRepositories({
      username: "onovich",
      token: "test-token",
      fetchImpl: async () => {
        requestCount += 1;
        return graphqlResponse(repositoryPage({
          names: ["same-repository"],
          hasNextPage: requestCount === 1,
          endCursor: requestCount === 1 ? "page-2" : null,
          totalCount: 2
        }));
      },
      sleep: async () => {}
    }),
    /duplicate repository id id-same-repository/
  );
});

test("rejects a repeated cursor and a configured page limit", async (t) => {
  let requestCount = 0;
  await t.test("repeated cursor", async () => {
    await assert.rejects(
      fetchAllRepositories({
        username: "onovich",
        token: "test-token",
        fetchImpl: async () => {
          requestCount += 1;
          return graphqlResponse(repositoryPage({
            names: ["repo-" + requestCount],
            hasNextPage: true,
            endCursor: "same-cursor",
            totalCount: 3
          }));
        },
        sleep: async () => {}
      }),
      /invalid or repeated repository cursor/
    );
  });

  await t.test("page limit", async () => {
    await assert.rejects(
      fetchAllRepositories({
        username: "onovich",
        token: "test-token",
        maxPages: 1,
        fetchImpl: async () => graphqlResponse(repositoryPage({
          names: ["repo-1"],
          hasNextPage: true,
          endCursor: "page-2",
          totalCount: 2
        })),
        sleep: async () => {}
      }),
      /pagination exceeded 1 pages/
    );
  });
});

test("reports HTTP status and request id even when an error body is not JSON", async () => {
  await assert.rejects(
    fetchAllRepositories({
      username: "onovich",
      token: "test-token",
      maxRetries: 0,
      fetchImpl: async () => new Response("Bad Gateway", {
        status: 502,
        headers: { "x-github-request-id": "TEST:TEXT" }
      }),
      sleep: async () => {}
    }),
    /HTTP 502; request id TEST:TEXT/
  );
});

function repositoryPage({ names, hasNextPage, endCursor, totalCount }) {
  return {
    data: {
      user: {
        repositories: {
          totalCount,
          nodes: names.map((name) => ({
            id: "id-" + name,
            name,
            isArchived: false,
            isFork: false,
            visibility: "PUBLIC",
            languages: {
              edges: [{
                size: 100,
                node: { name: "C#", color: "#178600" }
              }],
              pageInfo: { hasNextPage: false, endCursor: null }
            }
          })),
          pageInfo: { hasNextPage, endCursor }
        }
      },
      rateLimit: {
        cost: 1,
        remaining: 4_999,
        resetAt: "2030-01-01T00:00:00Z"
      }
    }
  };
}

function graphqlResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "x-github-request-id": "TEST:123",
      ...extraHeaders
    }
  });
}
