const {
  getArtifactPath,
  loadScopeConfig,
  resolveFromCwd,
  writeJson
} = require("./normalize-utils");

async function loadPlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    throw new Error(
      [
        "Playwright 패키지를 찾을 수 없습니다.",
        "DOM 자동 수집을 사용하려면 `playwright`를 설치한 뒤 다시 실행하세요.",
        "예: npm install -D playwright"
      ].join("\n")
    );
  }
}

function getCollectorConfig(scope) {
  const viewportWidth = Number.parseInt(process.env.VIEWPORT_WIDTH || "1440", 10);
  const viewportHeight = Number.parseInt(process.env.VIEWPORT_HEIGHT || "900", 10);
  const waitMs = Number.parseInt(process.env.COLLECT_WAIT_MS || "1500", 10);
  const outputPath = process.env.DOM_RAW || getArtifactPath(scope, "domRaw", "artifacts/raw/dom-response.generated.json");

  return {
    appUrl: scope.screen.url,
    outputPath,
    viewportWidth,
    viewportHeight,
    waitMs
  };
}

async function collectComponents(page) {
  return page.evaluate(() => {
    const selectorCandidates = [
      "[data-testid]",
      "main section",
      "main article",
      "main aside",
      "main nav",
      "main header",
      "main footer",
      "main button",
      "main a",
      "main h1",
      "main h2",
      "main h3",
      "main h4",
      "main h5",
      "main h6"
    ];

    const elements = selectorCandidates.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const seen = new Set();

    function toKebabCase(value) {
      return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    function getDomPath(element) {
      const segments = [];
      let current = element;

      while (current && current.nodeType === Node.ELEMENT_NODE && segments.length < 6) {
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) {
          segments.unshift(tag);
          break;
        }

        const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        const index = siblings.indexOf(current) + 1;
        segments.unshift(`${tag}:nth-of-type(${index})`);
        current = parent;
      }

      return segments.join(" > ");
    }

    function getLineCount(rect, computedStyle) {
      const lineHeight = Number.parseFloat(computedStyle.lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        return 1;
      }

      return Math.max(1, Math.round(rect.height / lineHeight));
    }

    function getTextContent(element) {
      return (element.textContent || "").replace(/\s+/g, " ").trim();
    }

    function pickComponentId(element, textContent) {
      const testId = element.getAttribute("data-testid");
      if (testId) {
        return toKebabCase(testId);
      }

      const id = element.getAttribute("id");
      if (id) {
        return toKebabCase(id);
      }

      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel) {
        return toKebabCase(ariaLabel);
      }

      const role = element.getAttribute("role");
      if (role) {
        return toKebabCase(`${role}-${textContent.slice(0, 24)}`);
      }

      return toKebabCase(`${element.tagName.toLowerCase()}-${textContent.slice(0, 24)}`) || "unknown-component";
    }

    function pickSelector(element, componentId) {
      const testId = element.getAttribute("data-testid");
      if (testId) {
        return `[data-testid='${testId}']`;
      }

      const id = element.getAttribute("id");
      if (id) {
        return `#${id}`;
      }

      const role = element.getAttribute("role");
      if (role) {
        return `[role='${role}']`;
      }

      return `[data-generated-id='${componentId}']`;
    }

    return elements
      .filter((element) => {
        if (seen.has(element)) {
          return false;
        }
        seen.add(element);
        return true;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        const textContent = getTextContent(element);
        const componentId = pickComponentId(element, textContent);
        return {
          element,
          rect,
          computedStyle,
          textContent,
          componentId
        };
      })
      .filter(({ rect, computedStyle, textContent }) => {
        if (computedStyle.display === "none" || computedStyle.visibility === "hidden") {
          return false;
        }

        if (rect.width < 8 || rect.height < 8) {
          return false;
        }

        if (rect.bottom < 0 || rect.top > window.innerHeight * 1.5) {
          return false;
        }

        return textContent.length > 0 || rect.width > 40 || rect.height > 40;
      })
      .map(({ element, rect, computedStyle, textContent, componentId }) => ({
        selector: pickSelector(element, componentId),
        componentId,
        domPath: getDomPath(element),
        bounds: {
          x: Number(rect.x.toFixed(2)),
          y: Number(rect.y.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2))
        },
        style: {
          paddingTop: computedStyle.paddingTop,
          paddingRight: computedStyle.paddingRight,
          paddingBottom: computedStyle.paddingBottom,
          paddingLeft: computedStyle.paddingLeft,
          fontSize: computedStyle.fontSize,
          fontWeight: computedStyle.fontWeight,
          lineHeight: computedStyle.lineHeight,
          borderRadius: computedStyle.borderRadius,
          color: computedStyle.color,
          backgroundColor: computedStyle.backgroundColor
        },
        text: {
          content: textContent,
          lineCount: getLineCount(rect, computedStyle),
          textAlign: computedStyle.textAlign
        },
        layout: {
          display: computedStyle.display,
          direction: computedStyle.flexDirection || "row",
          gap: computedStyle.gap === "normal" ? "0px" : computedStyle.gap,
          alignItems: computedStyle.alignItems || "stretch"
        },
        tokens: {
          padding: "",
          fontSize: "",
          borderRadius: ""
        }
      }));
  });
}

async function main() {
  const scope = loadScopeConfig();
  const config = getCollectorConfig(scope);
  const playwright = await loadPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: {
        width: config.viewportWidth,
        height: config.viewportHeight
      }
    });

    await page.goto(config.appUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(config.waitMs);

    const components = await collectComponents(page);

    writeJson(config.outputPath, {
      meta: {
        url: config.appUrl,
        capturedAt: new Date().toISOString(),
        viewport: {
          width: config.viewportWidth,
          height: config.viewportHeight
        }
      },
      screen: {
        id: scope.screen.id,
        breakpoint: scope.screen.breakpoint
      },
      components
    });

    process.stdout.write(`Wrote ${config.outputPath}\n`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
