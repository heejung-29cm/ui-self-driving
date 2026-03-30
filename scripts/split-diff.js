const {
  getArtifactPath,
  loadScopeConfig,
  readJson,
  writeJson
} = require("./normalize-utils");

function main() {
  const scope = loadScopeConfig();
  const diffPath = process.env.DIFF_JSON || getArtifactPath(scope, "diff", "artifacts/diff.json");
  const actionablePath =
    process.env.ACTIONABLE_DIFF_JSON || getArtifactPath(scope, "actionableDiff", "artifacts/actionable-diff.json");
  const reportOnlyPath =
    process.env.REPORT_ONLY_DIFF_JSON || getArtifactPath(scope, "reportOnlyDiff", "artifacts/report-only-diff.json");
  const diff = readJson(diffPath);

  const actionableItems = diff.items.filter((item) => item.fixStrategy !== "report-only");
  const reportOnlyItems = diff.items.filter((item) => item.fixStrategy === "report-only");

  const actionable = {
    version: diff.version,
    screenId: diff.screenId,
    breakpoint: diff.breakpoint,
    summary: { count: actionableItems.length },
    items: actionableItems
      .map((item) => {
        const nextItem = { ...item };
        if (!nextItem.tokenPath) {
          delete nextItem.tokenPath;
        }
        delete nextItem.reason;
        delete nextItem.annotationStatus;
        return nextItem;
      })
  };

  const reportOnly = {
    version: diff.version,
    screenId: diff.screenId,
    breakpoint: diff.breakpoint,
    summary: { count: reportOnlyItems.length },
    items: reportOnlyItems.map((item) => ({
      ...item,
      annotationStatus: item.annotationStatus || "review-needed"
    }))
  };

  writeJson(actionablePath, actionable);
  writeJson(reportOnlyPath, reportOnly);
  process.stdout.write(`Wrote ${actionablePath}\n`);
  process.stdout.write(`Wrote ${reportOnlyPath}\n`);
}

main();
