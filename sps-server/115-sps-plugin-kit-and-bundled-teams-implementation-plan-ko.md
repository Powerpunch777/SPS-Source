# SPS Plugin Kit 및 공식 팀 플러그인 구현 계획

## 문서 지위

- 상태: 첫 제품 출시 구현 계획
- 기준 제품 계약: `114-sps-product-and-plugin-platform-contract-ko.md`
- 원칙: 새로운 기능을 넓게 추가하기보다 하나의 완전한 사용자 흐름을 먼저 완성한다.

## 1. 구현 목표

첫 출시 목표는 다음 한 문장으로 검증한다.

> 새 사용자가 SPS를 설치하고 공식 팀 플러그인을 선택한 뒤, 실제 저장소에서 하나의 기능을 요구사항 정리부터 코드 변경·테스트·검토 완료까지 성공시킨다.

## 2. 제안 소스 구조

```text
sps-server/
├─ plugin-platform/
│  ├─ profile/                # Core 호환 표준, 권한·lifecycle·golden path
│  ├─ sdk/                    # @sps/plugin-sdk
│  ├─ testkit/                # @sps/plugin-testkit
│  ├─ cli/                    # sps plugin ...
│  ├─ schemas/                # sps-plugin.schema.json
│  ├─ packaging/              # .spsplugin 생성·검증
│  └─ fixtures/               # 보안·호환성 fixture
├─ plugins/
│  ├─ plugin-studio/
│  ├─ development-core/
│  ├─ indie-game-team/
│  ├─ app-product-team/
│  └─ web-product-team/
└─ docs/
   ├─ plugin-authoring/
   └─ plugin-security/
```

현재 `sps-room-chat`, `sps-memory`와 기존 Core plugin runtime을 즉시 이동하거나 교체하지 않는다. 먼저 기존 Core SDK 위의 SPS Extension Profile을 추출하고, 새 표준이 기존 플러그인과 새 플러그인을 모두 표현할 수 있음을 검증한 뒤 단계적으로 전환한다.

## 3. 단계별 구현

## P0. 문서와 계약 고정

### 작업

- 제품 계약과 첫 출시 범위를 기준 문서로 지정
- 기존 문서에 역사 문서 또는 상세 구현 문서 상태 표시
- Plugin ID, manifest version, permission naming, lifecycle 명칭 고정
- “구현됨”, “검증됨”, “목표” 상태 용어 통일

### 완료 기준

- README에서 제품 정의와 첫 출시 범위가 일치한다.
- 기존 게임 중심 문서가 전체 제품의 단일 기준처럼 보이지 않는다.
- 라이선스와 유료 Marketplace가 미결정 사항으로 명시된다.

## P0.5 Core Node·Runner 운영 계약

Plugin Kit보다 먼저, 모든 팀과 Adapter가 공통으로 사용할 수 있는 Node·Runner 운영 모델을 Core에 고정한다.

### 작업

1. `Node`, `Runner Profile`, `Availability Snapshot`, `Agent Runner Grant`, 실행·감사 기록의 데이터·API 계약을 정의한다.
2. Node는 실행기 종류·버전·모델·안전한 별칭과 현재 상태만 보고하고, 토큰·API 키·쿠키·CLI 홈·공급자 계정 ID는 Hub에 보내지 않게 한다.
3. 실행 시 Node 수준 권한과 선택된 Runner 수준 권한을 함께 검증한다. Runner Profile이 있는 Node에서는 Agent Runner Grant가 없으면 작업을 실행하지 않는다.
4. `available`, `busy`, `quota_limited`, `auth_required`, `offline`, `unknown`을 표준 상태로 사용하고 관측 시각·출처·신뢰도·재시도 시각을 함께 기록한다.
5. 공급자별 한도·로그인 probe는 Core에 넣지 않고 Adapter가 정규화된 Snapshot을 보고하게 한다.

### 완료 기준

- 기존 Node·Agent 실행 경로가 호환성을 유지한다.
- `quota_limited` 또는 `auth_required` Runner에 새 명령을 배정하지 않는다.
- Node 소유자의 실제 CLI 로그인 정보가 Hub DB·Activity Log·명령 행에 남지 않는다.
- Node 관리 화면에서 연결 상태와 안전한 Runner 상태를 구분해 볼 수 있다.

## P0.75 MCP 상호운용성 기준

SPS가 단순히 MCP 서버 하나를 실행하는 데서 끝나지 않고, 외부 Agent와 외부 도구를 모두 안전하게 연결하는 기준을 고정한다.

### 작업

1. SPS 정보를 외부 Agent에 제공하는 `@sps/mcp-server`를 표준 명칭·`SPS_*` 환경 변수·`sps*` 도구 이름으로 제공한다.
2. 이전 `PAPERCLIP_*` 환경 변수와 `paperclip*` 도구 이름은 설치 전환 기간에만 호환 모드로 유지한다.
3. 외부 MCP는 `connector` 플러그인이 `agent.tools.register`, `agent.tools.dynamic.register`, `http.outbound`, `secrets.read-ref` 등 기존 권한을 조합해 제공하도록 한다. 동적으로 발견된 Tool은 Core의 이름·개수·정적 Tool 충돌 검사를 통과하고 Plugin lifecycle에 묶인다.
4. 원격 MCP는 허용된 HTTPS endpoint와 Secret Reference만 사용한다. 로컬 `stdio` MCP는 승인된 Desktop Node가 준비된 뒤 별도 Node Bridge 경로로 지원한다.
5. MCP 도구별 허용 Agent·Project·Node·읽기/쓰기/실행 범위와 호출 결과를 감사 가능하게 남긴다.

### 완료 기준

- 외부 Agent는 SPS MCP Server를 통해 기존 API 권한을 넘지 않는 도구만 사용한다.
- 외부 MCP Connector는 Hub 비밀 값이나 임의 로컬 명령을 요구하지 않는다.
- Node 소유자의 MCP 설정·토큰·쿠키·절대 경로는 Hub에 저장되지 않는다.
- MCP 호출 실패, 인증 필요, 한도 제한은 Agent 실행과 구분되어 사용자에게 보고할 수 있다.

## P1. SPS Extension Profile 표준화 (Plugin Kit 이전)

이 단계의 목적은 새 runtime을 만드는 것이 아니라, 이미 존재하는 Core plugin SDK와 SPS 제품 규칙 사이의 호환 표준을 고정하는 것이다. P1이 끝나기 전에는 `@sps/plugin-sdk`, 새 CLI, Plugin Studio를 만들지 않는다.

### 작업

1. 현재 Core manifest, capability, worker, UI slot, job, Agent Session API의 호환 표 작성
2. Core 공통 객체와 플러그인 소유 객체의 경계 고정
3. `Tool`, `UI`, `Automation`, `Integration`, `Team`, `Memory Provider` golden path 정의
4. host context와 plugin context 타입 경계, 권한·resource scope·actor context 규칙 고정
5. lifecycle, cancellation, timeout, idempotency, state/log/job namespace 규칙 고정
6. 설치·활성화·중지·삭제 실패 rollback과 migration의 최소 계약 정의
7. `sps-room-chat`, `sps-memory` 및 최소 Tool/UI/Automation 예제로 Profile 적합성 확인
8. Profile로 표현할 수 없는 요구만 Core 계약 확장 후보로 기록

### 권한 우선순위

첫 구현 권한:

```text
projects.read
agents.read
tasks.read
tasks.comment
tasks.create
tasks.update
ui.register
network.fetch:<allowlisted-domain>
workspace.read
workspace.write
node.invoke:<allowlisted-command>
secrets.use:<binding>
```

권한은 문자열 비교만으로 끝내지 않고 resource scope와 actor context를 함께 검사한다.

### 완료 기준

- 선언하지 않은 권한 호출이 실패한다.
- 설정 누락이 `workspace.write`, 임의 네트워크, 무승인 실행으로 승격되지 않는다.
- 플러그인 중지 후 listener, timer, job, child process가 남지 않는다.
- 동일 lifecycle 이벤트 재실행이 중복 side effect를 만들지 않는다.
- 문서화된 golden path 하나씩이 기존 Core SDK만으로 구현·검증된다.
- Core에 `Room`이나 특정 팀 역할을 새 고정 타입으로 추가하지 않아도 Team 플러그인이 필요한 경험을 구성할 수 있다.

## P2. Plugin Kit 저작 도구와 Test Kit

P1의 Extension Profile이 승인·검증된 뒤, 그 표준을 쉽게 쓰게 하는 도구를 만든다. Plugin Kit은 Profile을 다시 정의하지 않는다.

### CLI 목표

```text
sps plugin create
sps plugin dev
sps plugin validate
sps plugin test
sps plugin package
sps plugin inspect
```

`create-sps-plugin`은 `sps plugin create`의 독립 실행 wrapper로 제공할 수 있다.

### Test Kit

제공할 fixture:

- Mock project, Agent, Task Room
- 권한 허용·거부 context
- 가짜 Workspace
- 가짜 network allowlist
- 가짜 secret binding
- lifecycle restart와 duplicate event
- 취소·timeout·oversized output

### 검증 항목

- manifest schema
- ID와 버전
- 진입점과 파일 hash
- path traversal와 symlink
- 선언하지 않은 외부 도메인
- 비밀 값 로그 노출
- 무한 대기와 timeout
- 호환 SPS 버전
- 설치·업데이트 migration

### 완료 기준

공식 예제 Tool Plugin이 다음 명령만으로 생성·실행·검증·패키징된다.

```text
npx create-sps-plugin
npm install
npm run dev
npm run test
npm run package
```

## P3. Plugin Studio

### 첫 구현 범위

- Tool Plugin 생성
- UI Plugin 기본 패널 생성
- Automation Plugin 기본 이벤트 handler 생성
- manifest form과 JSON 미리보기
- 권한 설명과 위험 등급 표시
- 생성 코드 diff 확인
- local test 실행
- `.spsplugin` 내보내기

### 구현 원칙

- 생성과 설치는 분리한다.
- 생성 결과는 기본 비활성 상태다.
- Core와 다른 플러그인의 소스 수정 기능은 제공하지 않는다.
- 실패 테스트와 고위험 권한을 숨기지 않는다.

### E2E 시나리오

사용자가 “Task 완료 시 요약 댓글을 작성하는 플러그인”을 요청한다.

1. Plugin Studio가 Automation Plugin을 추천한다.
2. `tasks.read`, `tasks.comment` 권한을 제안한다.
3. 코드·manifest·테스트를 생성한다.
4. Mock Task 완료 이벤트로 테스트한다.
5. 사용자가 권한과 diff를 확인한다.
6. 비활성 상태로 설치한다.
7. 사용자가 활성화한 뒤 실제 테스트 프로젝트에서 한 번 실행한다.

## P4. Development Core

### 모듈

- `repository-inspector`
- `requirement-to-task`
- `task-conflict-preview`
- `git-change-summary`
- `verification-runner`
- `review-checklist`
- `release-summary`
- `team-role-contracts`

### 기술 원칙

- 명령 문자열을 임의 Shell에 넘기지 않는다.
- 프로젝트별 허용 명령과 Workspace 경계를 사용한다.
- 테스트·빌드 명령은 plugin config와 프로젝트 adapter가 제공한다.
- 변경 전 preview와 변경 후 evidence를 동일 Task에 연결한다.
- 실제 완료와 Agent의 “완료 주장”을 구분한다.

### 완료 기준

범용 샘플 저장소에서 다음이 통과한다.

```text
요구사항 입력
→ Task 분해
→ 변경 경로 preview
→ Worker 실행
→ Git 변경 요약
→ 테스트 결과
→ in_review
```

## P5. 공식 팀 플러그인

세 플러그인을 동시에 깊게 만들지 않는다. 공통 E2E를 먼저 완성한 뒤 각 분야의 대표 adapter를 하나씩 추가한다.

### P5-A Indie Game Team

- 대표 게임 엔진 1개 공식 adapter
- Game Director, Designer, Gameplay Programmer, QA, Build 역할
- 프로젝트 구조 탐지
- 기능 명세와 플레이 테스트
- 빌드 로그와 패키징 검증

### P5-B App Product Team

- 대표 크로스플랫폼 앱 스택 1개
- 화면 목록과 사용자 흐름
- 클라이언트·백엔드 계약
- 권한·민감 데이터 체크
- 앱 빌드와 릴리스 체크

### P5-C Web Product Team

- 대표 웹 스택 1개
- 페이지·API·DB Task 분해
- 접근성·반응형·SEO 검사
- 테스트·빌드·배포 검토
- 장애와 rollback 체크

### 공통 완료 기준

각 플러그인마다 하나의 공개 sample project에서 다음 E2E를 반복 실행한다.

- clean clone에서 시작
- 요구사항 1개 입력
- Task 2~5개 생성
- 실제 파일 변경
- 테스트 또는 빌드 실행
- 변경과 결과 표시
- 사용자 검토 후 완료
- 서버 재시작 후 상태 일치

## P6. 설치·업데이트 UX와 Private Beta

### 제품화 작업

- Plugin 관리 화면
- 설치 전 권한 화면
- 버전·호환성·업데이트 표시
- 실패 버전 rollback
- 플러그인 로그와 실행 이력
- sample project와 첫 실행 튜토리얼
- 진단 export

### Private Beta 목표

- 10~30명
- 게임, 앱, 웹 사용자를 균형 있게 포함
- 기능 수보다 성공률, 중단 지점, 설치 난이도, 오류 이해도를 측정

측정 항목:

- 설치 성공률
- 첫 Task 완료율
- 첫 완료까지 필요한 사용자 개입 횟수
- 재시작 복구 성공률
- 중복 실행 발생 수
- 플러그인 권한 거부·오류의 이해 가능성
- E2E 평균 실행 시간과 비용

## 4. 테스트 전략

### 4.1 계약 테스트

모든 플러그인은 같은 contract suite를 통과해야 한다.

- manifest
- lifecycle
- permission
- cancellation
- restart
- duplicate event
- config migration
- uninstall cleanup

### 4.2 보안 테스트

- ZIP Slip/path traversal
- symlink escape
- 허용하지 않은 도메인
- DNS rebinding 대응 경계
- oversized JSON·첨부 파일·stdout
- null byte와 비정상 filename
- secret redaction
- command injection
- 다른 프로젝트 Workspace 접근
- 다른 회사의 Task·상태 접근

### 4.3 동시성 테스트

- 동일 Task를 두 Worker가 checkout
- 동일 completion event가 두 번 도착
- 플러그인 update 중 이벤트 도착
- 서버 재시작 중 실행 결과 도착
- Node 연결 해제 직후 명령 전송

## 5. 관측성 계약

모든 플러그인 실행 로그에 다음 식별자를 가능한 범위에서 포함한다.

```text
requestId
companyId
projectId
taskId
agentId
pluginId
pluginVersion
nodeId
runId
jobId
```

사용자에게는 이해 가능한 오류를 보여주고, 운영 로그에는 원인 코드와 redacted context를 남긴다.

권장 오류 형식:

```json
{
  "code": "PLUGIN_PERMISSION_DENIED",
  "message": "이 플러그인에는 Task 수정 권한이 없습니다.",
  "requestId": "..."
}
```

## 6. 현재 플러그인 마이그레이션

### sps-memory

- 첫 reference plugin으로 사용한다.
- Memory Provider golden path와 Profile conformance fixture로 사용한다.
- `memory-search`, `memory-propose`를 표준 `defineTool`로 표현한다.
- loopback 네트워크 권한과 candidate-only 경계를 manifest로 검증한다.
- Memory의 durable ownership은 별도 Core 계약을 따른다.

### sps-room-chat

- 한 번에 재작성하지 않는다.
- Team/Workplane golden path와 Profile conformance fixture로 사용한다.
- Room UI, Task operation, runtime adapter, recovery job을 모듈로 나눈다.
- Plugin SDK로 표현 가능한 경계부터 이동한다.
- 현재 거대한 Worker 파일의 책임 분해는 Plugin Kit과 병행한다.

### direct-task 계열

- 임시·특정 환경 경로는 공식 Node command contract로 수렴한다.
- 기존 안전 장치와 테스트는 삭제하지 않고 새 contract의 regression fixture로 사용한다.

## 7. 출시 후 항목

다음은 Public Beta 이후 데이터에 따라 결정한다.

- 무료 Registry
- 플러그인 서명 서비스
- 검증됨 배지
- 외부 개발자 게시 흐름
- 후원과 외부 라이선스 연결
- 유료 Marketplace
- 판매 수수료와 정산
- 코어 라이선스와 상업적 재사용 정책

## 8. 다음 작업 순서

1. Core 호환 표와 SPS Extension Profile golden path 작성
2. 현재 `sps-memory`, `sps-room-chat` 및 최소 Tool/UI/Automation 예제의 conformance spike
3. lifecycle·permission·restart contract test 작성
4. Plugin Kit의 CLI `validate`와 `package` 구현
5. Plugin Studio의 Tool Plugin 생성 E2E
6. Development Core의 범용 저장소 E2E
7. 공식 팀 플러그인을 한 개씩 추가

새 기능 아이디어는 이 순서를 깨지 않는다. 첫 E2E가 안정되기 전에는 Marketplace, 결제, 기업 기능을 구현하지 않는다.
