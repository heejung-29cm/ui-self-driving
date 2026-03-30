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

function normalizeDomComponent(component, scopeLookup) {
  const componentId = pickComponentId(component, scopeLookup);
  const scoped = getScopeComponent(scopeLookup, componentId);

  return {
    componentId,
    selector: component.selector || scoped.selector,
    domPath: component.domPath || "",
    bounds: {
      x: ensureNumber(component.bounds?.x),
      y: ensureNumber(component.bounds?.y),
      width: ensureNumber(component.bounds?.width),
      height: ensureNumber(component.bounds?.height)
    },
    style: {
      paddingTop: ensureNumber(component.style?.paddingTop),
      paddingRight: ensureNumber(component.style?.paddingRight),
      paddingBottom: ensureNumber(component.style?.paddingBottom),
      paddingLeft: ensureNumber(component.style?.paddingLeft),
      fontSize: ensureNumber(component.style?.fontSize),
      fontWeight: ensureNumber(component.style?.fontWeight),
      lineHeight: ensureNumber(component.style?.lineHeight),
      borderRadius: ensureNumber(component.style?.borderRadius),
      color: normalizeColor(component.style?.color, "#111111"),
      backgroundColor: normalizeColor(component.style?.backgroundColor, "#FFFFFF")
    },
    text: {
      content: component.text?.content || "",
      lineCount: Math.max(1, Math.trunc(ensureNumber(component.text?.lineCount, 1))),
      textAlign: String(component.text?.textAlign || "left").toLowerCase()
    },
    layout: {
      display: component.layout?.display || "block",
      direction: component.layout?.direction || "row",
      gap: ensureNumber(component.layout?.gap),
      alignItems: component.layout?.alignItems || "stretch"
    },
    tokens: {
      padding: component.tokens?.padding || "",
      fontSize: component.tokens?.fontSize || "",
      borderRadius: component.tokens?.borderRadius || ""
    }
  };
}

function main() {
  const scope = loadScopeConfig();
  const inputPath = process.env.DOM_RAW || scope.artifacts.domRaw;
  const outputPath = process.env.DOM_NORMALIZED || scope.artifacts.domNormalized;
  const raw = readJson(inputPath);
  const scopeLookup = buildComponentLookup(getScopeComponents(scope));

  const normalized = {
    version: "1.0",
    source: {
      type: "playwright",
      url: raw.meta?.url || scope.screen.url,
      capturedAt: raw.meta?.capturedAt || new Date().toISOString()
    },
    screen: {
      id: raw.screen?.id || scope.screen.id,
      breakpoint: raw.screen?.breakpoint || scope.screen.breakpoint,
      viewport: {
        width: ensureNumber(raw.meta?.viewport?.width),
        height: ensureNumber(raw.meta?.viewport?.height)
      }
    },
    components: (raw.components || []).map((component) => normalizeDomComponent(component, scopeLookup))
  };

  writeJson(outputPath, normalized);
  process.stdout.write(`Wrote ${outputPath}\n`);
}

main();
