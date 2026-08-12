import { generateTopLanguages } from "./generate.mjs";

try {
  await generateTopLanguages({
    token: process.env.GITHUB_TOKEN
  });
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
}
