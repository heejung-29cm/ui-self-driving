const { spawnSync } = require("child_process");
const fs = require("fs");
const { readJson, resolveFromCwd } = require("./normalize-utils");

function runStep(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  if (result.error) {
    process.stderr.write(`실행 실패: ${result.error.message}\n`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function getGeneratedScopePath() {
  return process.env.SCOPE_CONFIG || "scope.generated.json";
}

function ensureBootstrap(scopePath) {
  if (fs.existsSync(resolveFromCwd(scopePath))) {
    return;
  }
  runStep("npm", ["run", "bootstrap:run"]);
}

function ensureFigmaSource(scope) {
  const figmaSourcePath = resolveFromCwd(scope.artifacts.figmaSource || "artifacts/raw/figma-source.generated.json");

  if (!fs.existsSync(figmaSourcePath)) {
    process.stderr.write(`Figma source 파일이 없습니다: ${figmaSourcePath}\n`);
    process.exit(1);
  }

  const figmaSource = readJson(figmaSourcePath);
  const rootNode = figmaSource.document || figmaSource.node || figmaSource;
  const children = rootNode.children || [];

  if (!children.length) {
    process.stderr.write(
      [
        `Figma source가 아직 비어 있습니다: ${figmaSourcePath}`,
        "여기에 Figma MCP 원본 응답을 저장한 뒤 다시 실행하세요."
      ].join("\n") + "\n"
    );
    process.exit(2);
  }
}

function main() {
  const scopePath = getGeneratedScopePath();
  ensureBootstrap(scopePath);
  const scope = readJson(scopePath);

  ensureFigmaSource(scope);

  runStep("npm", ["run", "collect:figma"], {
    SCOPE_CONFIG: scopePath,
    FIGMA_SOURCE_JSON: scope.artifacts.figmaSource
  });

  runStep("npm", ["run", "collect:dom"], {
    SCOPE_CONFIG: scopePath
  });

  runStep("npm", ["run", "normalize:figma"], {
    SCOPE_CONFIG: scopePath
  });

  runStep("npm", ["run", "normalize:dom"], {
    SCOPE_CONFIG: scopePath
  });
}

main();
