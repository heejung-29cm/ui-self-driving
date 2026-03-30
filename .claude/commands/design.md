# /design — Figma 디자인 기반 자동 구현 워크플로우

사용자가 Figma 링크와 앱 링크를 입력하면 디자인 비교, 코드 수정, annotation 생성을 자동으로 수행합니다.

## 입력 파싱

`$ARGUMENTS`에서 두 개의 URL을 추출합니다:
- 첫 번째 URL (figma.com 포함) → `figmaUrl`
- 두 번째 URL (localhost 또는 앱 도메인) → `appUrl`

예: `/design https://www.figma.com/design/ABC/Page?node-id=0-1 http://localhost:3000/`

URL이 2개가 아니면 사용자에게 올바른 형식을 안내하고 중단합니다.

## 워크플로우

### Step 1: Bootstrap

`workflow-request.json`을 생성합니다:

```json
{
  "figmaUrl": "<파싱된 figmaUrl>",
  "appUrl": "<파싱된 appUrl>",
  "targetProjectPath": "<appUrl의 프로젝트 경로 — 사용자에게 확인>"
}
```

`targetProjectPath`가 필요하면 사용자에게 대상 프로젝트 소스코드 경로를 물어봅니다.

```bash
WORKFLOW_REQUEST=workflow-request.json BOOTSTRAP_OVERWRITE=1 npm run bootstrap:run
```

scope config를 읽어 이후 단계에서 사용합니다.

### Step 2: Observe (Agent 위임)

Observer 에이전트를 호출합니다:

```
Agent("observer") with prompt:
  figmaUrl: <figmaUrl>
  appUrl: <appUrl>
  scopePath: scope.generated.json

  1. Figma MCP로 디자인 데이터를 가져와 figma-source.generated.json에 저장
  2. npm run collect:figma && npm run normalize:figma
  3. npm run collect:dom && npm run normalize:dom
  4. 산출물 검증
```

Observer가 실패하면 이유를 확인하고 사용자에게 보고합니다.

### Step 3: Diff

결정적 스크립트를 직접 실행합니다:

```bash
SCOPE_CONFIG=scope.generated.json npm run diff:generate
SCOPE_CONFIG=scope.generated.json npm run diff:split
```

`artifacts/actionable-diff.json`을 읽고 상태를 확인합니다:
- actionable 항목이 0이면 → "디자인과 구현이 일치합니다" 보고 후 종료
- actionable 항목이 있으면 → Step 4로

`artifacts/diff.json`의 `summary.weightedScore`를 기록합니다 (이전 점수와 비교용).

### Step 4: Fix + Annotate (Agent 위임)

Executor 에이전트를 호출합니다:

```
Agent("executor") with prompt:
  actionableDiffPath: artifacts/actionable-diff.json
  reportOnlyDiffPath: artifacts/report-only-diff.json
  targetProjectPath: <scope의 targetProjectPath>
  iteration: <현재 iteration 번호>

  1. actionable 항목의 코드 수정
  2. report-only 항목의 Agentation annotation 생성 (또는 remaining-issues.md)
  3. 변경 보고
```

### Step 5: Verify

DOM을 재수집하고 diff를 다시 생성합니다:

```bash
SCOPE_CONFIG=scope.generated.json npm run collect:dom
SCOPE_CONFIG=scope.generated.json npm run normalize:dom
SCOPE_CONFIG=scope.generated.json npm run diff:generate
SCOPE_CONFIG=scope.generated.json npm run diff:split
```

`artifacts/diff.json`의 `summary.weightedScore`를 이전 값과 비교합니다.

### Step 6: Loop 판단

아래 조건을 확인합니다:

- **계속**: actionable 항목 > 0 AND iteration < 3 AND weightedScore가 감소함
  → Step 4로 돌아감 (Figma 재수집은 불필요, DOM만 재수집)
- **중단 — 완료**: actionable 항목 == 0
- **중단 — 최대 반복**: iteration >= 3
- **중단 — regression**: weightedScore가 증가함
- **중단 — 개선 없음**: weightedScore가 동일함

### Step 7: 최종 리포트

아래 내용을 사용자에게 출력합니다:

```
## 결과

### 수정 완료
- [파일명]: [property] [before] → [after]
- ...

### Annotation (사용자 검토 필요)
- [componentId]: [property] — [이유]
- ...

### 남은 이슈
- [componentId]: [property] — [이유]
- ...

### 루프 요약
- 반복 횟수: N
- 시작 diff score: X → 최종: Y
- 종료 이유: [완료 / 최대 반복 / regression / 개선 없음]
```
