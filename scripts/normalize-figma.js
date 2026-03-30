const {
  buildComponentLookup,
  ensureNumber,
  getScopeComponent,
  getScopeComponents,
  loadScopeConfig,
  normalizeColor,
  pickComponentId,
  readJson,
  writeJson
} = require("./normalize-utils");

function normalizeFigmaNode(node, scopeLookup) {
  const componentId = pickComponentId(node, scopeLookup);
  const scoped = getScopeComponent(scopeLookup, componentId);

  return {
    componentId,
    name: node.name || componentId,
    selectorHint: scoped.selector,
    kind: String(node.type || scoped.kind || "unknown").toLowerCase(),
    bounds: {
      x: ensureNumber(node.bounds?.x),
      y: ensureNumber(node.bounds?.y),
      width: ensureNumber(node.bounds?.width),
      height: ensureNumber(node.bounds?.height)
    },
    style: {
      paddingTop: ensureNumber(node.style?.paddingTop),
      paddingRight: ensureNumber(node.style?.paddingRight),
      paddingBottom: ensureNumber(node.style?.paddingBottom),
      paddingLeft: ensureNumber(node.style?.paddingLeft),
      fontSize: ensureNumber(node.style?.fontSize),
      fontWeight: ensureNumber(node.style?.fontWeight),
      lineHeight: ensureNumber(node.style?.lineHeight),
      borderRadius: ensureNumber(node.style?.borderRadius),
      color: normalizeColor(node.style?.color, "#111111"),
      backgroundColor: normalizeColor(node.style?.backgroundColor, "#FFFFFF")
    },
    text: {
      content: node.text?.content || "",
      maxLines: Math.max(1, Math.trunc(ensureNumber(node.text?.maxLines, 1))),
      textAlign: String(node.text?.textAlign || "left").toLowerCase()
    },
    layout: {
      display: node.layout?.display || "block",
      direction: node.layout?.direction || "row",
      gap: ensureNumber(node.layout?.gap),
      alignItems: node.layout?.alignItems || "stretch"
    },
    tokens: {
      padding: node.tokens?.padding || "",
      fontSize: node.tokens?.fontSize || "",
      borderRadius: node.tokens?.borderRadius || ""
    }
  };
}

function main() {
  const scope = loadScopeConfig();
  const inputPath = process.env.FIGMA_RAW || scope.artifacts.figmaRaw;
  const outputPath = process.env.FIGMA_NORMALIZED || scope.artifacts.figmaNormalized;
  const raw = readJson(inputPath);
  const scopeLookup = buildComponentLookup(getScopeComponents(scope));

  const normalized = {
    version: "1.0",
    source: {
      type: "figma",
      fileKey: raw.meta?.fileKey || "",
      nodeId: raw.meta?.nodeId || "",
      capturedAt: raw.meta?.capturedAt || new Date().toISOString()
    },
    screen: {
      id: raw.screen?.id || scope.screen.id,
      name: raw.screen?.name || scope.screen.name,
      breakpoint: raw.screen?.breakpoint || scope.screen.breakpoint
    },
    components: (raw.nodes || []).map((node) => normalizeFigmaNode(node, scopeLookup))
  };

  writeJson(outputPath, normalized);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

main();
