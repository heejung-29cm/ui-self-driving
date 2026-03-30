const {
  findBestMatch,
  getArtifactPath,
  getSeverityWeight,
  loadScopeConfig,
  readJson,
  stableStringifyValue,
  writeJson
} = require("./normalize-utils");

const PROPERTY_GROUPS = {
  spacing: [
    { property: "paddingTop", kind: "style", unit: "px", tokenKey: "padding" },
    { property: "paddingRight", kind: "style", unit: "px", tokenKey: "padding" },
    { property: "paddingBottom", kind: "style", unit: "px", tokenKey: "padding" },
    { property: "paddingLeft", kind: "style", unit: "px", tokenKey: "padding" }
  ],
  color: [
    { property: "color", kind: "style", unit: "color", tokenKey: "" },
    { property: "backgroundColor", kind: "style", unit: "color", tokenKey: "" }
  ],
  "font-size": [
    { property: "fontSize", kind: "style", unit: "px", tokenKey: "fontSize" }
  ],
  "border-radius": [
    { property: "borderRadius", kind: "style", unit: "px", tokenKey: "borderRadius" }
  ],
  "line-height": [
    {
      property: "lineHeight",
      kind: "style",
      unit: "px",
      tokenKey: "",
      defaultFixStrategy: "report-only",
      reason: "font-fallback-or-localization-suspected",
      annotationStatus: "review-needed"
    }
  ],
  gap: [
    {
      property: "gap",
      kind: "layout",
      unit: "px",
      tokenKey: "",
      source: "layout"
    }
  ],
  height: [
    {
      property: "height",
      kind: "layout",
      unit: "px",
      tokenKey: "",
      source: "bounds",
      defaultFixStrategy: "report-only",
      reason: "rendering-noise-suspected",
      annotationStatus: "noise-suspected"
    }
  ],
  "line-count": [
    {
      property: "lineCount",
      kind: "text",
      unit: "lines",
      tokenKey: "",
      source: "text",
      expectedField: "maxLines",
      actualField: "lineCount",
      defaultFixStrategy: "report-only",
      reason: "font-fallback-or-localization-suspected",
      annotationStatus: "review-needed"
    }
  ]
};

function buildLookup(components) {
  const map = new Map();
  for (const component of components || []) {
    map.set(component.componentId, component);
  }
  return map;
}

function resolveMatchedComponent(figmaId, domLookup) {
  const exact = domLookup.get(figmaId);
  if (exact) {
    return { component: exact, matchScore: 1 };
  }

  const match = findBestMatch(figmaId, Array.from(domLookup.keys()));
  if (match) {
    return { component: domLookup.get(match.id), matchScore: match.score };
  }

  return { component: null, matchScore: 0 };
}

function compareValues(expected, actual) {
  if (typeof expected === "number" && typeof actual === "number") {
    return {
      equal: expected === actual,
      delta: Math.abs(expected - actual)
    };
  }

  return {
    equal: stableStringifyValue(expected) === stableStringifyValue(actual),
    delta: stableStringifyValue(expected) === stableStringifyValue(actual) ? 0 : 1
  };
}

function getSeverity(property, delta) {
  if (property === "color" || property === "backgroundColor") {
    return delta === 0 ? "low" : "medium";
  }

  if (delta >= 12) {
    return "high";
  }

  if (delta >= 4) {
    return "medium";
  }

  return "low";
}

function getBaseConfidence(property, fixStrategy, reason) {
  if (fixStrategy === "report-only") {
    if (reason === "missing-component-match") {
      return 0.25;
    }
    if (reason === "font-fallback-or-localization-suspected") {
      return 0.58;
    }
    if (reason === "rendering-noise-suspected") {
      return 0.62;
    }
    return 0.5;
  }

  if (property.startsWith("padding")) {
    return 0.97;
  }
  if (property === "fontSize" || property === "borderRadius") {
    return 0.94;
  }
  if (property === "color" || property === "backgroundColor") {
    return 0.90;
  }
  return 0.84;
}

function getConfidence(property, delta, fixStrategy, reason, matchScore) {
  const base = getBaseConfidence(property, fixStrategy, reason);
  const matchFactor = matchScore >= 1 ? 1 : matchScore;
  const deltaFactor = delta <= 1 ? 0.98 : delta <= 4 ? 1 : delta <= 12 ? 0.95 : 0.85;
  return Math.round(base * matchFactor * deltaFactor * 100) / 100;
}

function getFixStrategy(config, figmaComponent) {
  if (config.defaultFixStrategy) {
    return config.defaultFixStrategy;
  }

  if (config.property === "color" || config.property === "backgroundColor") {
    return "class";
  }

  const tokenPath = figmaComponent.tokens?.[config.tokenKey] || "";
  return tokenPath ? "token" : "class";
}

function createDiffId(componentId, property) {
  return `diff-${componentId}-${property}`.replace(/[^a-zA-Z0-9-]/g, "-");
}

function getPropertyValue(component, config, side) {
  const source = config.source || "style";
  const field =
    side === "expected"
      ? config.expectedField || config.property
      : config.actualField || config.property;

  if (source === "bounds") {
    return component.bounds?.[field];
  }

  if (source === "layout") {
    return component.layout?.[field];
  }

  if (source === "text") {
    return component.text?.[field];
  }

  return component.style?.[field];
}

function getEnabledPropertyConfigs(scope) {
  const properties = scope.comparison?.properties || ["spacing", "color", "font-size", "border-radius"];
  return properties.flatMap((property) => PROPERTY_GROUPS[property] || []);
}

function compareComponentPair(figmaComponent, domComponent, propertyConfigs, matchScore) {
  const items = [];
  const target = domComponent?.selector || figmaComponent?.selectorHint || `[data-testid='${figmaComponent.componentId}']`;

  if (!domComponent) {
    items.push({
      id: createDiffId(figmaComponent.componentId, "missing-component"),
      componentId: figmaComponent.componentId,
      target,
      kind: "structure",
      property: "component",
      expected: "present",
      actual: "missing",
      unit: "state",
      severity: "high",
      fixStrategy: "report-only",
      reason: "missing-component-match",
      confidence: 0.25,
      annotationStatus: "review-needed"
    });
    return items;
  }

  const isFuzzy = matchScore < 1;

  for (const config of propertyConfigs) {
    const expected = getPropertyValue(figmaComponent, config, "expected");
    const actual = getPropertyValue(domComponent, config, "actual");
    const { equal, delta } = compareValues(expected, actual);

    if (equal) {
      continue;
    }

    const fixStrategy = isFuzzy && !config.defaultFixStrategy ? "report-only" : getFixStrategy(config, figmaComponent);
    const severity = getSeverity(config.property, delta);
    const tokenPath = config.tokenKey ? figmaComponent.tokens?.[config.tokenKey] || "" : "";
    const reason = isFuzzy ? (config.reason || "fuzzy-match-unverified") : config.reason;

    items.push({
      id: createDiffId(figmaComponent.componentId, config.property),
      componentId: figmaComponent.componentId,
      target,
      kind: config.kind,
      property: config.property,
      expected,
      actual,
      unit: config.unit,
      severity,
      fixStrategy,
      confidence: getConfidence(config.property, delta, fixStrategy, reason, matchScore),
      matchScore: Math.round(matchScore * 100) / 100,
      ...(reason ? { reason } : {}),
      ...(config.annotationStatus ? { annotationStatus: config.annotationStatus } : {}),
      ...(tokenPath ? { tokenPath } : {})
    });
  }

  return items;
}

function summarize(items) {
  const actionableCount = items.filter((item) => item.fixStrategy !== "report-only").length;
  const reportOnlyCount = items.length - actionableCount;
  const weightedScore = items.reduce((total, item) => total + getSeverityWeight(item.severity), 0);

  return {
    totalCount: items.length,
    actionableCount,
    reportOnlyCount,
    weightedScore
  };
}

function main() {
  const scope = loadScopeConfig();
  const figmaPath = process.env.FIGMA_NORMALIZED || getArtifactPath(scope, "figmaNormalized", "artifacts/figma-normalized.json");
  const domPath = process.env.DOM_NORMALIZED || getArtifactPath(scope, "domNormalized", "artifacts/dom-normalized.json");
  const diffPath = process.env.DIFF_JSON || getArtifactPath(scope, "diff", "artifacts/diff.json");
  const figma = readJson(figmaPath);
  const dom = readJson(domPath);
  const domLookup = buildLookup(dom.components);
  const propertyConfigs = getEnabledPropertyConfigs(scope);

  const items = (figma.components || []).flatMap((figmaComponent) => {
    const { component, matchScore } = resolveMatchedComponent(figmaComponent.componentId, domLookup);
    return compareComponentPair(figmaComponent, component, propertyConfigs, matchScore);
  });

  const diff = {
    version: "1.0",
    screenId: figma.screen.id,
    breakpoint: figma.screen.breakpoint,
    summary: summarize(items),
    items
  };

  writeJson(diffPath, diff);
  process.stdout.write(`Wrote ${diffPath}\n`);
}

main();
