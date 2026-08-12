import assert from "node:assert/strict";
import test from "node:test";

import { renderSvg } from "../render-svg.mjs";

test("renders a deterministic, escaped, dependency-free compact card", () => {
  const stats = {
    repositoryCount: 2,
    includedRepositoryCount: 2,
    totalBytes: 1_000,
    languages: [
      {
        name: 'C# <script>alert("x")</script>',
        bytes: 750,
        percentage: 75,
        color: "javascript:alert(1)"
      },
      {
        name: "Hidden language",
        bytes: 250,
        percentage: 25,
        color: "#3572A5"
      }
    ]
  };
  const config = {
    title: 'Most <Used> & "Safe"',
    top: 1,
    width: 400
  };

  const first = renderSvg(stats, config);
  const second = renderSvg(stats, config);

  assert.equal(first, second);
  assert.match(first, /role="img"/);
  assert.match(first, /<title id="title">Most &lt;Used&gt; &amp; &quot;Safe&quot;<\/title>/);
  assert.match(first, /C# &lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(first, /fill="#8c959f"/);
  assert.doesNotMatch(first, /<script>/i);
  assert.doesNotMatch(first, /javascript:/i);
  assert.doesNotMatch(first, /Hidden language/);
  assert.doesNotMatch(first, /(?:href|src)=/i);
});

test("renders an accessible empty state when there is no language data", () => {
  const svg = renderSvg({
    repositoryCount: 0,
    includedRepositoryCount: 0,
    totalBytes: 0,
    languages: []
  }, {
    title: "Most Used Languages",
    top: 6,
    width: 400
  });

  assert.match(svg, /No language data available\./);
  assert.match(svg, /0 included public repositories/);
  assert.match(svg, /<title id="title">Most Used Languages<\/title>/);
});

test("uses unrounded byte share for bar width while formatting the label", () => {
  const svg = renderSvg({
    repositoryCount: 1,
    includedRepositoryCount: 1,
    totalBytes: 3,
    languages: [{
      name: "C#",
      bytes: 1,
      percentage: 33.3,
      color: "#178600"
    }]
  }, {
    title: "Most Used Languages",
    top: 1,
    width: 400
  });

  assert.match(svg, />33\.3%<\/text>/);
  assert.match(svg, /width="117\.33" height="6" rx="3" fill="#178600"/);
});

test("matches the approved compact-card snapshot", () => {
  const svg = renderSvg({
    repositoryCount: 1,
    includedRepositoryCount: 1,
    totalBytes: 100,
    languages: [{
      name: "C#",
      bytes: 100,
      percentage: 100,
      color: "#178600"
    }]
  }, {
    title: "Most Used Languages",
    top: 1,
    width: 400
  });
  const expected = [
    '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title description" width="400" height="96" viewBox="0 0 400 96">',
    '  <title id="title">Most Used Languages</title>',
    '  <desc id="description">Language usage across 1 included public repositories.</desc>',
    "  <style>",
    "    .card { fill: #ffffff; stroke: #d0d7de; }",
    "    .title { fill: #24292f; font: 600 16px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }",
    "    .label { fill: #24292f; font: 600 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }",
    "    .percent { fill: #57606a; font: 400 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }",
    "    .track { fill: #eaeef2; }",
    "  </style>",
    '  <rect class="card" x="0.5" y="0.5" width="399" height="95" rx="6"/>',
    '  <text class="title" x="24" y="30">Most Used Languages</text>',
    '  <circle cx="29" cy="54" r="5" fill="#178600"/>',
    '  <text class="label" x="42" y="58">C#</text>',
    '  <text class="percent" text-anchor="end" x="376" y="58">100.0%</text>',
    '  <rect class="track" x="24" y="67" width="352" height="6" rx="3"/>',
    '  <rect x="24" y="67" width="352" height="6" rx="3" fill="#178600"/>',
    "</svg>",
    ""
  ].join("\n");

  assert.equal(svg, expected);
});
