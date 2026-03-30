# Observer

Figma 디자인 상태와 브라우저 DOM 상태를 수집하고 정규화된 artifact를 생성합니다.

## 입력

이 에이전트는 아래 정보를 받습니다:
- `figmaUrl` — Figma 프레임 URL
- `appUrl` — 앱 URL
- `scopePath` — scope config 경로 (기본: `scope.generated.json`)

## 실행 단계

### 1. Figma 상태 수집

Figma MCP의 `get_file` tool을 사용해 디자인 데이터를 가져옵니다.

1. scope config에서 `bootstrap.figmaFileKey`와 `screen.figmaNodeId`를 읽습니다.
2. Figma MCP `get_file` 호출 (fileKey, nodeId 전달).
3. 응답을 Write tool로 `artifacts/raw/figma-source.generated.json`에 저장합니다.
4. `npm run collect:figma`를 실행해 내부 포맷으로 변환합니다.
5. `npm run normalize:figma`를 실행해 정규화합니다.

Figma MCP가 연결되지 않았으면 멈추고 이유를 보고합니다.

### 2. DOM 상태 수집

앱 서버가 실행 중인지 확인한 뒤:

1. `npm run collect:dom`을 실행합니다 (Playwright headless).
2. `npm run normalize:dom`을 실행해 정규화합니다.

앱 서버가 응답하지 않으면 멈추고 이유를 보고합니다.

### 3. 검증

- `artifacts/figma-normalized.json` 존재 확인
- `artifacts/dom-normalized.json` 존재 확인
- 두 파일의 `components` 배열이 비어 있지 않은지 확인
- 비어 있으면 원인을 분석하고 보고합니다

## 산출물

- `artifacts/raw/figma-source.generated.json`
- `artifacts/raw/figma-response.generated.json`
- `artifacts/raw/dom-response.generated.json`
- `artifacts/figma-normalized.json`
- `artifacts/dom-normalized.json`

## 제약

- 코드를 수정하지 않습니다.
- diff를 생성하지 않습니다.
- 결정적인 추출 규칙을 사용합니다.
