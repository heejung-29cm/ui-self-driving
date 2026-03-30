# ui-self-driving

Figma 디자인 시안과 브라우저 DOM을 비교하고, 차이를 자동 수정하고, 검토가 필요한 항목은 annotation으로 남기는 self-driving UI 워크플로우입니다.

## 사용법

```
/design <figma-link> <app-link>
```

예:

```
/design https://www.figma.com/design/ABC/Page?node-id=0-1 http://localhost:3000/
```

이 커맨드 하나로 아래가 자동 실행됩니다:

1. Figma MCP로 디자인 상태 수집
2. Playwright로 DOM 상태 수집
3. Rule-based diff 생성
4. Actionable 항목 자동 코드 수정
5. Report-only 항목 Agentation annotation 생성
6. 검증 후 반복 (최대 3회)

## 아키텍처

```
/design <figma-link> <app-link>
  │
  ├─ Bootstrap ── URL 파싱 → scope 생성
  │
  ├─ Observe (observer agent)
  │   Figma MCP → figma-source.json → normalize
  │   Playwright → dom-response.json → normalize
  │
  ├─ Diff (scripts)
  │   generate-diff.js → split-diff.js
  │   actionable / report-only 분리
  │
  ├─ Fix (executor agent)
  │   actionable → Edit tool로 코드 수정
  │   report-only → Agentation annotation
  │
  ├─ Verify
  │   DOM 재수집 → 재비교 → diff score 비교
  │
  └─ Loop (최대 3회)
      개선되면 계속, regression이면 중단
```

## 문서 구조

| 파일                         | 내용                  |
| ---------------------------- | --------------------- |
| `.claude/CLAUDE.md`          | Claude 운영 규칙      |
| `.claude/commands/design.md` | `/design` 커맨드 정의 |
| `.claude/agents/observer.md` | 관측 에이전트         |
| `.claude/agents/executor.md` | 수정 에이전트         |

## 스크립트

```bash
npm run bootstrap:run     # URL → scope 파생
npm run observe:run       # bootstrap + collect + normalize
npm run collect:figma     # Figma raw → 내부 포맷
npm run collect:dom       # Playwright → DOM 수집
npm run normalize:figma   # Figma 정규화
npm run normalize:dom     # DOM 정규화
npm run diff:generate     # rule-based diff
npm run diff:split        # actionable / report-only 분리
```

## MCP 서버

`.mcp.json`에 등록:

- **figma** — Figma 디자인 데이터 (HTTP MCP)
- **playwright** — 대화형 브라우저 탐색 (stdio MCP)
- **agentation** — annotation 관리 (stdio MCP)

## 비교 속성

- `spacing` (padding, gap)
- `color` (color, backgroundColor)
- `font-size`
- `border-radius`
- `line-height` (report-only)
- `height` (report-only)

## 분류 기준

**actionable** (자동 수정): target 안정, 값 명확, patch 작음, blast radius 낮음

**report-only** (annotation): rendering noise, font fallback, localization, 구조 변경, 낮은 confidence, fuzzy match

## 종료 조건

- `actionable diff == 0`
- 최대 3회 반복
- Regression 감지 (diff score 증가)
- 개선 없음

## 설치

```bash
npm install
```

Playwright 브라우저가 필요하면:

```bash
npx playwright install chromium
```
