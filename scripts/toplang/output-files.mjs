import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";

const AUDIT_KEYS = [
  "schemaVersion",
  "username",
  "repositoryCount",
  "includedRepositoryCount",
  "totalBytes",
  "languages",
  "filters"
];
const FILTER_KEYS = [
  "includeForks",
  "includeArchived",
  "excludedRepositories",
  "excludedLanguages"
];
const FORBIDDEN_ELEMENTS = new Set([
  "script",
  "foreignobject",
  "iframe",
  "object",
  "embed",
  "image",
  "use"
]);

export async function writeValidatedOutputs({
  outputDirectory,
  svg,
  json,
  expectedAudit
}) {
  validateSvg(svg);
  validateAuditJson(json, expectedAudit);
  await replaceOutputs({ outputDirectory, svg, json });
}

function validateSvg(svg) {
  if (typeof svg !== "string" || !svg.endsWith("\n")) {
    throw new Error("Generated SVG must be UTF-8 text ending in a newline");
  }
  if (/\b(?:href|src)\s*=|url\s*\(/i.test(svg)) {
    throw new Error("Generated SVG contains a forbidden external resource");
  }

  const document = parseSvg(svg);
  const { attributes } = document.root;
  if (document.root.name !== "svg") {
    throw new Error("Generated SVG root element must be svg");
  }
  if (attributes.role !== "img") {
    throw new Error("Generated SVG is missing its accessible image role");
  }
  if (!document.elementNames.has("title")
      || !document.elementNames.has("desc")) {
    throw new Error("Generated SVG must contain title and desc elements");
  }

  const width = positiveNumber(attributes.width, "width");
  const height = positiveNumber(attributes.height, "height");
  const viewBox = String(attributes.viewBox ?? "")
    .trim()
    .split(/\s+/)
    .map(Number);
  if (viewBox.length !== 4
      || viewBox.some((value) => !Number.isFinite(value))
      || viewBox[0] !== 0
      || viewBox[1] !== 0
      || viewBox[2] !== width
      || viewBox[3] !== height) {
    throw new Error("Generated SVG viewBox must match its width and height");
  }
}

function parseSvg(svg) {
  const tokenPattern = /<[^>]*>/g;
  const stack = [];
  const elementNames = new Set();
  let root = null;
  let rootClosed = false;
  let cursor = 0;
  let match;

  while ((match = tokenPattern.exec(svg)) !== null) {
    validateTextSegment(svg.slice(cursor, match.index), stack.length);
    const rawTag = match[0];

    if (rawTag.startsWith("</")) {
      const closing = /^<\/([A-Za-z][\w:.-]*)\s*>$/.exec(rawTag);
      if (!closing || stack.pop() !== closing[1]) {
        throw new Error("Generated SVG has mismatched closing elements");
      }
      if (stack.length === 0) {
        rootClosed = true;
      }
    } else {
      if (rootClosed) {
        throw new Error("Generated SVG contains multiple root elements");
      }
      const opening = parseOpeningTag(rawTag);
      const normalizedName = opening.name.toLowerCase();
      if (FORBIDDEN_ELEMENTS.has(normalizedName)) {
        throw new Error(
          "Generated SVG contains forbidden SVG element " + opening.name
        );
      }
      for (const attributeName of Object.keys(opening.attributes)) {
        if (["href", "xlink:href", "src"].includes(attributeName.toLowerCase())) {
          throw new Error("Generated SVG contains a forbidden external attribute");
        }
      }

      if (root === null) {
        root = opening;
      } else if (stack.length === 0) {
        throw new Error("Generated SVG contains multiple root elements");
      }
      elementNames.add(normalizedName);
      if (!opening.selfClosing) {
        stack.push(opening.name);
      } else if (stack.length === 0) {
        rootClosed = true;
      }
    }

    cursor = tokenPattern.lastIndex;
  }

  validateTextSegment(svg.slice(cursor), stack.length);
  if (!root || stack.length !== 0 || !rootClosed) {
    throw new Error("Generated SVG is not well-formed XML");
  }
  return { root, elementNames };
}

function parseOpeningTag(rawTag) {
  if (rawTag.startsWith("<!") || rawTag.startsWith("<?")) {
    throw new Error("Generated SVG contains an unsupported declaration");
  }

  const selfClosing = /\/\s*>$/.test(rawTag);
  let inner = rawTag.slice(1, -1).trim();
  if (selfClosing) {
    inner = inner.slice(0, -1).trimEnd();
  }

  const nameMatch = /^([A-Za-z][\w:.-]*)(?=\s|$)/.exec(inner);
  if (!nameMatch) {
    throw new Error("Generated SVG contains an invalid opening element");
  }

  const name = nameMatch[1];
  const attributes = {};
  let remainder = inner.slice(name.length);
  while (remainder.length > 0) {
    const attribute = /^\s+([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/
      .exec(remainder);
    if (!attribute) {
      throw new Error("Generated SVG contains invalid attribute syntax");
    }
    if (Object.hasOwn(attributes, attribute[1])) {
      throw new Error("Generated SVG contains a duplicate attribute");
    }
    attributes[attribute[1]] = attribute[2];
    remainder = remainder.slice(attribute[0].length);
  }

  return { name, attributes, selfClosing };
}

function validateTextSegment(text, depth) {
  if (text.includes("<") || text.includes(">")) {
    throw new Error("Generated SVG contains malformed text content");
  }
  if (depth === 0 && text.trim() !== "") {
    throw new Error("Generated SVG contains text outside the root element");
  }
}

function positiveNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 10_000) {
    throw new Error("Generated SVG " + name + " must be a positive number");
  }
  return number;
}

function validateAuditJson(json, expectedAudit) {
  let audit;
  try {
    audit = JSON.parse(json);
  } catch (error) {
    throw new Error("Generated audit JSON is not valid JSON", { cause: error });
  }

  requireExactKeys(audit, AUDIT_KEYS, "audit JSON");
  if (audit.schemaVersion !== 1) {
    throw new Error("Generated audit JSON has an unsupported schemaVersion");
  }
  if (typeof audit.username !== "string" || audit.username === "") {
    throw new Error("Generated audit JSON has an invalid username");
  }
  requireNonNegativeInteger(audit.repositoryCount, "repositoryCount");
  requireNonNegativeInteger(
    audit.includedRepositoryCount,
    "includedRepositoryCount"
  );
  if (audit.includedRepositoryCount > audit.repositoryCount) {
    throw new Error(
      "Generated audit JSON includedRepositoryCount exceeds repositoryCount"
    );
  }
  requireNonNegativeInteger(audit.totalBytes, "totalBytes");
  if (!Array.isArray(audit.languages)) {
    throw new Error("Generated audit JSON languages must be an array");
  }

  let summedBytes = 0;
  const seenLanguages = new Set();
  for (const language of audit.languages) {
    requireExactKeys(
      language,
      ["name", "bytes", "color", "percentage"],
      "language"
    );
    if (typeof language.name !== "string" || language.name === "") {
      throw new Error("Generated audit JSON contains an invalid language name");
    }
    if (seenLanguages.has(language.name)) {
      throw new Error("Generated audit JSON contains duplicate languages");
    }
    seenLanguages.add(language.name);
    requireNonNegativeInteger(language.bytes, "language bytes");
    if (language.bytes === 0) {
      throw new Error("Generated audit JSON contains a zero-byte language");
    }
    if (language.color !== null
        && !/^#[0-9a-f]{6}$/i.test(language.color)) {
      throw new Error("Generated audit JSON contains an invalid language color");
    }
    if (!Number.isFinite(language.percentage)
        || language.percentage < 0
        || language.percentage > 100) {
      throw new Error("Generated audit JSON contains an invalid percentage");
    }

    const expectedPercentage = audit.totalBytes === 0
      ? 0
      : Math.round(
        (language.bytes / audit.totalBytes * 100) * 10_000
      ) / 10_000;
    if (Math.abs(language.percentage - expectedPercentage) > 0.000_001) {
      throw new Error(
        'Language "' + language.name
          + '" percentage does not match its byte share'
      );
    }
    summedBytes += language.bytes;
  }

  if (summedBytes !== audit.totalBytes) {
    throw new Error("Generated audit JSON language bytes do not match totalBytes");
  }
  validateFilters(audit.filters);
  compareExpectedAudit(audit, expectedAudit);
}

function validateFilters(filters) {
  requireExactKeys(filters, FILTER_KEYS, "audit filters");
  if (filters.includeForks !== false
      || typeof filters.includeArchived !== "boolean") {
    throw new Error("Generated audit JSON contains invalid inclusion filters");
  }
  for (const key of ["excludedRepositories", "excludedLanguages"]) {
    if (!Array.isArray(filters[key])
        || filters[key].some((value) => typeof value !== "string")) {
      throw new Error("Generated audit JSON contains invalid " + key);
    }
  }
}

function compareExpectedAudit(actual, expected) {
  for (const key of [
    "username",
    "repositoryCount",
    "includedRepositoryCount",
    "totalBytes"
  ]) {
    if (actual[key] !== expected[key]) {
      throw new Error("Generated audit JSON " + key + " differs from source data");
    }
  }
  if (JSON.stringify(actual.languages) !== JSON.stringify(expected.languages)
      || JSON.stringify(actual.filters) !== JSON.stringify(expected.filters)) {
    throw new Error("Generated audit JSON differs from source data");
  }
}

function requireExactKeys(value, expectedKeys, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Generated " + name + " must be an object");
  }
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpected)) {
    throw new Error("Generated " + name + " has unexpected fields");
  }
}

function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Generated audit JSON " + name + " must be non-negative");
  }
}

async function replaceOutputs({ outputDirectory, svg, json }) {
  await mkdir(outputDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(outputDirectory, ".toplang-"));
  const targets = [
    {
      temporary: join(temporaryDirectory, "top-langs-data.json"),
      destination: join(outputDirectory, "top-langs-data.json"),
      content: json
    },
    {
      temporary: join(temporaryDirectory, "top-langs.svg"),
      destination: join(outputDirectory, "top-langs.svg"),
      content: svg
    }
  ];

  try {
    for (const target of targets) {
      await writeFile(target.temporary, target.content, "utf8");
      target.previous = await readIfPresent(target.destination);
      target.replaced = false;
    }

    try {
      for (const target of targets) {
        await rename(target.temporary, target.destination);
        target.replaced = true;
      }
    } catch (error) {
      await rollbackOutputs(targets);
      throw error;
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function readIfPresent(path) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function rollbackOutputs(targets) {
  for (const target of targets.filter((item) => item.replaced).reverse()) {
    if (target.previous === null) {
      await rm(target.destination, { force: true });
    } else {
      await writeFile(target.destination, target.previous);
    }
  }
}
