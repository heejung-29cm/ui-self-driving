const {
  getArtifactPath,
  loadScopeConfig,
  readJson,
  writeJson
} = require("./normalize-utils");

function toKebabCase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractTokenPath(boundVariables, field) {
  const binding = boundVariables?.[field];
  if (!binding) {
    return "";
  }

  const entry = Array.isArray(binding) ? binding[0] : binding;
  return entry?.id || entry?.name || "";
}

function inferTokenHint(componentId, property, value) {
  if (!componentId || !value) {
    return "";
  }

  const base = componentId.replace(/-/g, ".");
  const propertyMap = {
    padding: "spacing",
    fontSize: "typography.fontSize",
    borderRadius: "radii"
  };

  const prefix = propertyMap[property];
  return prefix ? `${prefix}.${base}` : "";
}

function resolveToken(node, componentId, property, value) {
  const explicit = extractTokenPath(node.boundVariables, property);
  if (explicit) {
    return explicit;
  }

  return inferTokenHint(componentId, property, value);
}

function figmaColorToHex(colorObj, fallback) {
  if (!colorObj || typeof colorObj !== "object") {
    return fallback;
  }

  const clamp = (v) => Math.max(0, Math.min(255, Math.round((v || 0) * 255)));
  return `#${[clamp(colorObj.r), clamp(colorObj.g), clamp(colorObj.b)]
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function extractTextColor(node) {
  const textFills = node.style?.fills || node.fills || [];
  const solidFill = Array.isArray(textFills)
    ? textFills.find((f) => f.type === "SOLID")
    : null;
  return figmaColorToHex(solidFill?.color, "#111111");
}

function mapFigmaNode(node) {
  const bounds = node.absoluteBoundingBox || node.bounds || {};
  const fills = Array.isArray(node.fills) ? node.fills : [];
  const solidFill = fills.find((fill) => fill.type === "SOLID");
  const backgroundColor = figmaColorToHex(solidFill?.color, "#FFFFFF");

  const componentId = toKebabCase(node.name || node.id || "unknown-component");
  const paddingTop = node.paddingTop || 0;
  const fontSize = node.style?.fontSize || 0;
  const borderRadius = node.cornerRadius || 0;

  return {
    id: node.id || "",
    name: node.name || "",
    type: node.type || "FRAME",
    componentId,
    bounds: {
      x: bounds.x || 0,
      y: bounds.y || 0,
      width: bounds.width || 0,
      height: bounds.height || 0
    },
    style: {
      paddingTop,
      paddingRight: node.paddingRight || 0,
      paddingBottom: node.paddingBottom || 0,
      paddingLeft: node.paddingLeft || 0,
      fontSize,
      fontWeight: node.style?.fontWeight || 400,
      lineHeight: node.style?.lineHeightPx || node.style?.lineHeight || 0,
      borderRadius,
      color: extractTextColor(node),
      backgroundColor
    },
    text: {
      content: node.characters || "",
      maxLines: node.style?.maxLines || 1,
      textAlign: node.style?.textAlignHorizontal || "LEFT"
    },
    layout: {
      display: node.layoutMode ? "flex" : "block",
      direction: (node.layoutMode || "NONE").toLowerCase() === "vertical" ? "column" : "row",
      gap: node.itemSpacing || 0,
      alignItems: (node.counterAxisAlignItems || "STRETCH").toLowerCase()
    },
    tokens: {
      padding: resolveToken(node, componentId, "padding", paddingTop),
      fontSize: resolveToken(node, componentId, "fontSize", fontSize),
      borderRadius: resolveToken(node, componentId, "borderRadius", borderRadius)
    }
  };
}

function flattenNodes(nodes, result = []) {
  for (const node of nodes || []) {
    result.push(mapFigmaNode(node));
    if (Array.isArray(node.children) && node.children.length > 0) {
      flattenNodes(node.children, result);
    }
  }

  return result;
}

function main() {
  const scope = loadScopeConfig();
  const sourcePath =
    process.env.FIGMA_SOURCE_JSON ||
    getArtifactPath(scope, "figmaSource", "artifacts/raw/figma-source.generated.json");
  const outputPath = process.env.FIGMA_RAW || getArtifactPath(scope, "figmaRaw", "artifacts/raw/figma-response.generated.json");
  const source = readJson(sourcePath);
  const rootNode = source.document || source.node || source;
  const rootChildren = rootNode.children || [];

  const payload = {
    meta: {
      fileKey: scope.bootstrap?.figmaFileKey || source.fileKey || "",
      nodeId: scope.screen.figmaNodeId,
      capturedAt: new Date().toISOString()
    },
    screen: {
      id: scope.screen.id,
      name: scope.screen.name,
      breakpoint: scope.screen.breakpoint
    },
    nodes: flattenNodes(rootChildren)
  };

  writeJson(outputPath, payload);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

main();
