const FALLBACK_COLOR = "#8c959f";

export function renderSvg(stats, config) {
  const languages = stats.languages.slice(0, config.top);
  const rowCount = Math.max(languages.length, 1);
  const height = 58 + rowCount * 38;
  const barWidth = config.width - 48;
  const lines = [
    '<svg xmlns="http://www.w3.org/2000/svg"'
      + ' role="img" aria-labelledby="title description"'
      + ' width="' + config.width + '" height="' + height + '"'
      + ' viewBox="0 0 ' + config.width + " " + height + '">',
    '  <title id="title">' + escapeXml(config.title) + "</title>",
    '  <desc id="description">Language usage across '
      + stats.includedRepositoryCount + " included public repositories.</desc>",
    "  <style>",
    "    .card { fill: #ffffff; stroke: #d0d7de; }",
    "    .title { fill: #24292f; font: 600 16px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }",
    "    .label { fill: #24292f; font: 600 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }",
    "    .percent { fill: #57606a; font: 400 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; }",
    "    .track { fill: #eaeef2; }",
    "  </style>",
    '  <rect class="card" x="0.5" y="0.5" width="'
      + (config.width - 1) + '" height="' + (height - 1) + '" rx="6"/>',
    '  <text class="title" x="24" y="30">'
      + escapeXml(config.title) + "</text>"
  ];

  if (languages.length === 0) {
    lines.push(
      '  <text class="percent" x="24" y="68">No language data available.</text>'
    );
  } else {
    languages.forEach((language, index) => {
      const labelY = 58 + index * 38;
      const barY = labelY + 9;
      const bytePercentage = stats.totalBytes > 0
        ? language.bytes / stats.totalBytes * 100
        : 0;
      const filledWidth = roundSvgNumber(
        barWidth * clampPercentage(bytePercentage) / 100
      );
      const color = safeColor(language.color);

      lines.push(
        '  <circle cx="29" cy="' + (labelY - 4)
          + '" r="5" fill="' + color + '"/>',
        '  <text class="label" x="42" y="' + labelY + '">'
          + escapeXml(language.name) + "</text>",
        '  <text class="percent" text-anchor="end" x="'
          + (config.width - 24) + '" y="' + labelY + '">'
          + formatPercentage(language.percentage) + "</text>",
        '  <rect class="track" x="24" y="' + barY
          + '" width="' + barWidth + '" height="6" rx="3"/>',
        '  <rect x="24" y="' + barY + '" width="' + filledWidth
          + '" height="6" rx="3" fill="' + color + '"/>'
      );
    });
  }

  lines.push("</svg>", "");
  return lines.join("\n");
}

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : FALLBACK_COLOR;
}

function clampPercentage(value) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function formatPercentage(value) {
  return clampPercentage(value).toFixed(1) + "%";
}

function roundSvgNumber(value) {
  return Math.round(value * 100) / 100;
}
