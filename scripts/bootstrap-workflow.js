const {
  readJson,
  writeJsonIfMissing,
  writeJson
} = require("./normalize-utils");

function decodeNodeId(rawNodeId) {
  return String(rawNodeId || "0:1").replace(/-/g, ":");
}

function parseFigmaUrl(figmaUrl) {
  const url = new URL(figmaUrl);
  const pathnameParts = url.pathname.split("/").filter(Boolean);
  const fileKey = pathnameParts[1] || "FILE_KEY";
  const rawName = pathnameParts[2] || "screen";
  const fileName = decodeURIComponent(rawName);
  const nodeId = decodeNodeId(url.searchParams.get("node-id"));

  return {
    fileKey,
    fileName,
    nodeId
  };
}

function parseAppUrl(appUrl) {
  const url = new URL(appUrl);
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  const screenId =
    normalizedPath === "/"
      ? "home"
      : normalizedPath
          .split("/")
          .filter(Boolean)
          .join("-")
          .toLowerCase();

  const screenName = screenId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return {
    appUrl: url.toString(),
    screenId,
    screenName
  };
}

function createScope(request) {
  const figma = parseFigmaUrl(request.figmaUrl);
  const app = parseAppUrl(request.appUrl);

  return {
    input: {
      figmaUrl: request.figmaUrl,
      appUrl: request.appUrl
    },
    screen: {
      id: app.screenId,
      name: app.screenName || figma.fileName,
      figmaNodeId: figma.nodeId,
      breakpoint: "desktop",
      url: app.appUrl
    },
    comparisonMode: "full-screen",
    componentSelection: {
      mode: "all-visible-components",
      matchStrategy: "heuristic-then-stable-selector",
      selectorPriority: ["data-testid", "role", "semantic-css"]
    },
    components: request.components || [],
    targetProjectPath: request.targetProjectPath || "",
    autoFixScope: {
      maxPatchesPerIteration: 5,
      maxIterations: 3
    },
    comparison: {
      properties: ["spacing", "color", "font-size", "border-radius"],
      successCriteria: [
        "screen-level weighted diff score decreases",
        "actionable diff count decreases",
        "report-only issues remain visible"
      ]
    },
    artifacts: {
      figmaSource: "artifacts/raw/figma-source.generated.json",
      figmaRaw: "artifacts/raw/figma-response.generated.json",
      domRaw: "artifacts/raw/dom-response.generated.json",
      figmaNormalized: "artifacts/figma-normalized.json",
      domNormalized: "artifacts/dom-normalized.json",
      diff: "artifacts/diff.json",
      actionableDiff: "artifacts/actionable-diff.json",
      reportOnlyDiff: "artifacts/report-only-diff.json",
      remainingIssues: "artifacts/remaining-issues.md"
    },
    bootstrap: {
      figmaFileKey: figma.fileKey,
      figmaFileName: figma.fileName
    }
  };
}

function createFigmaRawTemplate(scope) {
  return {
    _todo: [
      "여기에 Figma MCP 응답을 화면 단위로 매핑하세요.",
      "nodes 배열에는 화면에 보이는 전체 핵심 노드를 넣는 것을 권장합니다."
    ],
    meta: {
      fileKey: scope.bootstrap.figmaFileKey,
      nodeId: scope.screen.figmaNodeId,
      capturedAt: new Date().toISOString()
    },
    screen: {
      id: scope.screen.id,
      name: scope.screen.name,
      breakpoint: scope.screen.breakpoint
    },
    nodes: []
  };
}

function createFigmaSourceTemplate(scope) {
  return {
    _todo: [
      "여기에 Figma MCP 원본 응답을 저장하세요.",
      "collect:figma가 이 파일을 읽어 figma-response.generated.json으로 변환합니다."
    ],
    fileKey: scope.bootstrap.figmaFileKey,
    nodeId: scope.screen.figmaNodeId,
    document: {
      id: scope.screen.figmaNodeId,
      name: scope.screen.name,
      type: "FRAME",
      children: []
    }
  };
}

function createDomRawTemplate(scope) {
  return {
    _todo: [
      "여기에 브라우저 DOM 추출 결과를 매핑하세요.",
      "components 배열에는 현재 화면에서 비교할 전체 가시 컴포넌트를 넣는 것을 권장합니다."
    ],
    meta: {
      url: scope.screen.url,
      capturedAt: new Date().toISOString(),
      viewport: {
        width: 1440,
        height: 900
      }
    },
    screen: {
      id: scope.screen.id,
      breakpoint: scope.screen.breakpoint
    },
    components: []
  };
}

function main() {
  const requestPath = process.env.WORKFLOW_REQUEST || "workflow-request.json";
  const scopePath = process.env.BOOTSTRAP_SCOPE_OUT || "scope.generated.json";
  const overwrite = process.env.BOOTSTRAP_OVERWRITE === "1";
  const request = readJson(requestPath);

  if (!request.figmaUrl || !request.appUrl) {
    throw new Error("workflow request에는 figmaUrl과 appUrl이 모두 필요합니다.");
  }

  const scope = createScope(request);

  writeJson(scopePath, scope);
  const figmaSourceWritten = overwrite
    ? (writeJson(scope.artifacts.figmaSource, createFigmaSourceTemplate(scope)), true)
    : writeJsonIfMissing(scope.artifacts.figmaSource, createFigmaSourceTemplate(scope));
  const figmaRawWritten = overwrite
    ? (writeJson(scope.artifacts.figmaRaw, createFigmaRawTemplate(scope)), true)
    : writeJsonIfMissing(scope.artifacts.figmaRaw, createFigmaRawTemplate(scope));
  const domRawWritten = overwrite
    ? (writeJson(scope.artifacts.domRaw, createDomRawTemplate(scope)), true)
    : writeJsonIfMissing(scope.artifacts.domRaw, createDomRawTemplate(scope));

  process.stdout.write(`Wrote ${scopePath}\n`);
  process.stdout.write(
    `${figmaSourceWritten ? "Wrote" : "Preserved"} ${scope.artifacts.figmaSource}\n`
  );
  process.stdout.write(
    `${figmaRawWritten ? "Wrote" : "Preserved"} ${scope.artifacts.figmaRaw}\n`
  );
  process.stdout.write(
    `${domRawWritten ? "Wrote" : "Preserved"} ${scope.artifacts.domRaw}\n`
  );
  process.stdout.write(
    [
      "",
      "다음 단계:",
      `1. ${scope.artifacts.figmaSource}에 Figma MCP 원본 응답 저장`,
      `2. npm run observe:run`,
      `3. npm run diff:generate && npm run diff:split`
    ].join("\n")
  );
}

main();
