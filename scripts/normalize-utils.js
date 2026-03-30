const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonIfMissing(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    return false;
  }

  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return true;
}

function pathExists(filePath) {
  return fs.existsSync(filePath);
}

function resolveFromCwd(filePath) {
  return path.resolve(process.cwd(), filePath);
}

function loadScopeConfig() {
  const scopePath = process.env.SCOPE_CONFIG || "scope.generated.json";
  return readJson(scopePath);
}

function getScopeComponents(scope) {
  return Array.isArray(scope.components) ? scope.components : [];
}

function ensureNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace("px", "").trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function clampColorChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeColor(value, fallback = "#000000") {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (!rgbMatch) {
    return fallback;
  }

  const channels = rgbMatch[1]
    .split(",")
    .slice(0, 3)
    .map((part) => clampColorChannel(Number.parseFloat(part)));

  if (channels.length !== 3 || channels.some((part) => Number.isNaN(part))) {
    return fallback;
  }

  return `#${channels.map((part) => part.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function buildComponentLookup(components) {
  return new Map(components.map((component) => [component.componentId, component]));
}

function pickComponentId(node, scopeLookup) {
  if (node.componentId && scopeLookup.has(node.componentId)) {
    return node.componentId;
  }

  const normalizedName = String(node.name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (normalizedName && scopeLookup.has(normalizedName)) {
    return normalizedName;
  }

  return node.componentId || normalizedName || "unknown-component";
}

function getScopeComponent(scopeLookup, componentId) {
  return scopeLookup.get(componentId) || {
    componentId,
    selector: `[data-testid='${componentId}']`,
    kind: "unknown"
  };
}

function writeMarkdown(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function getArtifactPath(scope, key, fallback) {
  return scope.artifacts?.[key] || fallback;
}

function getSeverityWeight(severity) {
  const weights = {
    low: 1,
    medium: 3,
    high: 5,
    critical: 8
  };

  return weights[severity] || 0;
}

function stableStringifyValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }

  return String(value ?? "");
}

function normalizeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function bigrams(str) {
  const normalized = normalizeId(str);
  const pairs = new Set();
  for (let i = 0; i < normalized.length - 1; i++) {
    pairs.add(normalized.slice(i, i + 2));
  }
  return pairs;
}

function diceCoefficient(a, b) {
  if (normalizeId(a) === normalizeId(b)) {
    return 1;
  }

  const setA = bigrams(a);
  const setB = bigrams(b);
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const pair of setA) {
    if (setB.has(pair)) {
      intersection++;
    }
  }

  return (2 * intersection) / (setA.size + setB.size);
}

function findBestMatch(targetId, candidateIds, threshold = 0.6) {
  let bestId = null;
  let bestScore = 0;

  for (const candidateId of candidateIds) {
    const score = diceCoefficient(targetId, candidateId);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestId = candidateId;
    }
  }

  return bestId ? { id: bestId, score: bestScore } : null;
}

module.exports = {
  buildComponentLookup,
  diceCoefficient,
  ensureNumber,
  findBestMatch,
  getArtifactPath,
  getScopeComponent,
  getScopeComponents,
  getSeverityWeight,
  loadScopeConfig,
  normalizeColor,
  normalizeId,
  pathExists,
  pickComponentId,
  readJson,
  resolveFromCwd,
  stableStringifyValue,
  writeMarkdown,
  writeJsonIfMissing,
  writeJson
};
