# CLAUDE.md

## 역할

`ui-self-driving` 저장소에서 Figma 디자인과 브라우저 DOM을 비교하고, 코드를 수정하고, 검토가 필요한 항목을 annotation으로 남기는 self-driving UI 워크플로우를 수행합니다.

## 사용법

```
/design <figma-link> <app-link>
```

이 커맨드 하나로 관측, 비교, 수정, annotation이 자동 실행됩니다.

## 워크플로우

```
/design
  ├─ Bootstrap: URL → scope 생성
  ├─ Observe (agent): Figma MCP + Playwright → 정규화
  ├─ Diff (scripts): rule-based 비교 → actionable / report-only 분리
  ├─ Fix (agent): actionable 코드 수정 + report-only annotation
  ├─ Verify: DOM 재수집 → 재비교
  └─ Loop: 최대 3회, regression 시 중단
```

## 에이전트

| 에이전트 | 역할 | 코드 수정 |
|----------|------|-----------|
| **observer** | Figma MCP 브리지 + DOM 수집 + 정규화 | 안 함 |
| **executor** | diff 기반 코드 수정 + annotation 생성 | 함 |

## 스크립트

```bash
npm run bootstrap:run     # URL → scope 파생
npm run observe:run       # bootstrap + collect + normalize 체이닝
npm run collect:figma     # Figma raw → 내부 포맷
npm run collect:dom       # Playwright → DOM 수집
npm run normalize:figma   # Figma 정규화
npm run normalize:dom     # DOM 정규화
npm run diff:generate     # rule-based diff
npm run diff:split        # actionable / report-only 분리
```

## MCP 연결

`.mcp.json`에 등록된 서버:

- **figma** — Figma 디자인 데이터 읽기. Claude 세션에서 MCP로 응답을 받아 파일에 저장.
- **playwright** — 대화형 브라우저 탐색. 결정적 파이프라인은 `collect-dom.js`가 직접 Playwright 사용.
- **agentation** — annotation 생성/관리. 없으면 `remaining-issues.md`로 대체.

## 작업 원칙

- 결정적 연산은 스크립트, 판단은 Claude.
- diff는 엄격하게 유지. noise도 숨기지 않음.
- 자동 수정은 actionable만. report-only는 annotation.
- 종료 조건: `actionable == 0` 또는 최대 iteration 또는 regression.

## componentId 매칭

- 정확 매칭 우선, 실패 시 Dice coefficient 0.6+ fuzzy fallback
- fuzzy 매칭 항목은 자동 report-only, confidence에 matchScore 반영
- 안정적 루프를 위해 핵심 영역에 `data-testid` 권장

## 분류 기준

**actionable**: target 안정, 값 명확, patch 작음, blast radius 낮음
**report-only**: rendering noise, font fallback, localization, 구조 변경 필요, 낮은 confidence

## Agentation 정책

- `diff.json`이 source of truth, annotation은 뷰 모델
- report-only + 승인 필요 항목을 Agentation에 노출
- Agentation 미연결 시 `remaining-issues.md`로 대체
- 사용자 피드백 > 자동 diff > heuristic 판단

## 검토 기준

- diff가 결정적인가?
- report-only 이유가 분명한가?
- 종료 조건이 actionable diff 기준인가?
- patch 범위가 적절한가?
