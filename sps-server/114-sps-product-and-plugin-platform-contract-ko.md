# SPS 제품 및 플러그인 플랫폼 계약

## 문서 지위

- 상태: 첫 제품 출시를 위한 제품 계약
- 결정일: 2026-07-22
- 적용 범위: SPS Core Product, Plugin Kit, 공식 기본 제공 플러그인, 첫 출시 경계
- 우선순위: 제품 범위에 관해 기존 게임 중심 설계나 구현 기록과 충돌하면 이 문서가 우선한다.
- 구현 순서: `115-sps-plugin-kit-and-bundled-teams-implementation-plan-ko.md`
- 문서 체계: `DOCUMENTATION.md`

## 1. 제품 정의

SPS는 여러 AI Agent를 실제 소규모 팀처럼 구성하고, 프로젝트의 대화·작업·권한·로컬 실행·검증·기억을 하나의 흐름으로 운영하는 **로컬 중심 멀티에이전트 제작 플랫폼**이다.

SPS는 단순한 다중 채팅 UI나 AI 코드 생성기만을 목표로 하지 않는다. 제품의 핵심은 다음 실행 계약이다.

```text
프로젝트 생성
→ 팀 플러그인 선택
→ Agent Room에서 방향 논의
→ 유한한 Task Room 생성·할당
→ 승인된 Workspace와 Desktop Node에서 실행
→ 변경·검증·결과 기록
→ 사용자 또는 권한 있는 Owner의 완료 판단
```

## 2. 첫 출시 제품 구성

첫 제품은 세 층으로 구성한다.

### 2.1 SPS Core Product

첫 출시에서 Core Product가 제공해야 하는 최소 범위:

- Hub 로그인, 초대, 멤버십과 프로젝트 경계
- Project, Task, 댓글, 문서와 Work Product의 범용 기록
- Agent와 durable Agent Session
- 프로젝트별 Workspace 연결
- 승인된 Desktop Node와 로컬 실행기 연결
- Node별 Runner Profile, 현재 Availability Snapshot, Agent별 Runner 실행 권한
- Task별 실행 상태, 취소, 오류, 결과 기록
- 첨부 파일, 문서, Work Product와 변경 파일 확인
- 플러그인 Provider의 범위·권한·상태 선언과 발견
- 플러그인 설치, 활성화, 비활성화, 설정과 권한 표시
- 서버 재시작 후 진행 작업 복구
- 중복 실행과 중복 완료 방지

Core는 `Agent Room`, 특정 역할 조직도, Task 운영 의식, Memory 저장·검색 전략을 고정 타입으로 만들지 않는다. Core는 그것들을 구성할 수 있는 Task, Agent Session, 권한, 실행 기록, 이벤트와 확장 Runtime을 제공한다.

MCP는 별도 작업 모델이 아니라 Tool·Integration 확장의 상호운용 규약이다. SPS는 외부 Agent가 SPS의 권한 있는 도구를 사용하는 **SPS MCP Server**와, SPS Agent가 외부 MCP 도구를 사용하는 **MCP Connector Plugin**을 구분한다. 후자는 Hub에서 외부 `stdio` 프로세스를 임의 실행하지 않으며, 로컬 MCP는 승인된 Desktop Node 경로에서만 다룬다.

### 2.1.1 Core 운영 편의 계약

Node와 실행기의 운영 정보는 특정 AI 공급자나 팀 플러그인에 묶이지 않는 Core 계약이다.

| Core 객체 | 책임 | 저장하거나 노출하지 않는 것 |
| --- | --- | --- |
| `Node` | 승인된 컴퓨터의 연결, 플랫폼, 버전, heartbeat, Workspace 실행 경계 | 다른 컴퓨터의 파일·자격 증명 |
| `Runner Profile` | Node 안의 실행기와 사용자가 붙인 안전한 별칭, 실행기 종류·버전·모델 목록 | 토큰, API 키, 쿠키, CLI 홈 경로, 공급자 계정 ID |
| `Availability Snapshot` | `available`, `busy`, `quota_limited`, `auth_required`, `offline`, `unknown` 상태와 관측 시각·출처·신뢰도·재시도 시각 | 남은 토큰 수를 사실처럼 단정한 값 |
| `Agent Runner Grant` | 허가된 Agent가 어느 Node의 어느 Runner Profile을 사용할 수 있는지. Runner Profile이 존재하는 Node에서는 실제 실행에 반드시 필요 | Node 소유자의 실제 로그인 정보 |
| 실행·감사 기록 | 선택된 Node·Runner, 명령 결과, 취소와 권한 변경 근거 | 비밀 값이 포함된 원시 환경 변수 |

Core는 이 객체의 수명주기와 최소 권한 검사를 책임진다. Codex, Agy, Ollama 등의 로그인 확인, 사용 한도 탐지, 공급자별 오류 해석은 Adapter가 `Availability Snapshot`으로 정규화한다. 한도 정보는 공급자가 신뢰할 수 있게 제공하지 않을 수 있으므로 `observedAt`, `source`, `confidence`, `retryAfter`를 함께 보관하는 **운영상의 증거**이며 결제·사용량의 확정 원장이 아니다.

Node는 자기 OS의 안전한 저장소에만 자격 증명을 보관한다. Hub와 플러그인은 Node가 보고한 안전한 상태와 명시적으로 승인된 Node·Agent·Runner 조합만 사용한다. 기본 SPS에는 `Nodes`, `Runners & Accounts`, `Availability` 관리 화면이 포함될 수 있지만, 공급자별 상세 사용량 화면이나 계정 전환 구현은 Adapter 또는 선택 확장으로 남긴다.

### 2.2 SPS Extension Profile: Plugin Kit 이전의 표준화

SPS는 새 Plugin Kit나 별도 Plugin Runtime을 먼저 만들지 않는다. 이미 있는 Core plugin SDK·manifest·capability·worker·UI slot·job·Agent Session API를 기준으로, SPS에서 플러그인을 만들 때 반드시 따르는 **SPS Extension Profile**을 먼저 고정한다.

Profile이 고정할 항목:

- Core 공통 객체: `company`, `project`, `task`, `agent`, `agent session`, `workspace`, `node`, `artifact`
- Core 소유 범위와 플러그인 소유 범위
- 표준 권한 이름과 resource scope, actor context 검사 방식
- Tool, UI, Automation, Integration, Team, Memory Provider의 기여 방식
- lifecycle, cancellation, timeout, idempotency, 상태·로그·job namespace 규칙
- Team 플러그인이 Agent Room·Task Room을 표현하는 방식
- Memory Provider가 Task를 자동 생성·배정·완료할 수 없다는 기본 경계

완료 판정은 기존 `sps-room-chat`과 `sps-memory`를 한 번에 재작성하는 것이 아니다. 두 플러그인의 필요한 기능을 Profile로 표현할 수 있고, 새 Tool/UI/Automation 플러그인이 같은 규칙으로 만들어지는 것을 확인하는 것이다.

### 2.3 SPS Plugin Kit

Plugin Kit은 사용자가 SPS 내부 구현을 직접 이해하지 않고도 플러그인을 만들 수 있게 하는 개발자 제품이다. Extension Profile이 고정된 뒤에만 만든다. Kit의 역할은 새 규칙을 만드는 것이 아니라, 표준 Profile을 템플릿·검사·테스트·패키징으로 쉽게 사용하게 만드는 것이다.

구성 요소의 목표 이름:

```text
@sps/plugin-sdk
@sps/plugin-testkit
create-sps-plugin
sps-plugin.schema.json
SPS Plugin CLI
```

첫 출시의 필수 계약:

- 표준 manifest
- 명시적 권한 선언
- Tool, UI, Automation, Integration 기여 지점
- 설치·활성화·중지·업데이트·삭제 lifecycle
- 플러그인별 상태 저장소
- 플러그인별 로그와 실행 추적
- 개발 모드와 Hot Reload
- 자동 검증과 패키징
- 설치 전 권한 검토
- 호환 SPS 버전 선언

### 2.4 공식 기본 제공 플러그인

첫 출시에는 다음 공식 플러그인을 제공한다.

1. `Plugin Studio`
2. `Development Core`
3. `Indie Game Team`
4. `App Product Team`
5. `Web Product Team`

게임·앱·웹 팀 플러그인은 사용자에게는 독립적으로 보이지만, 공통 개발 기능은 `Development Core`를 사용한다.

## 3. 플러그인 표준 계약

이 계약은 Core의 기존 plugin SDK를 대체하는 별도 runtime 명세가 아니다. SPS Extension Profile은 Core의 실제 manifest와 capability를 기준으로 호환 표를 만들고, 새 기능이 필요할 때만 Core 계약을 명시적으로 확장한다.

중립 Core 용어의 기준은 `113-sps-generic-agent-platform-core-contract-ko.md`다. Profile은 그 용어를 실제 SDK와 제품 UX에 연결한다.

### 3.1 플러그인 종류

| 종류 | 목적 | 기본 위험도 |
| --- | --- | --- |
| Tool Plugin | Agent가 호출할 도구 추가 | 낮음~중간 |
| UI Plugin | 프로젝트·Room·Task 화면 확장 | 낮음 |
| Automation Plugin | 이벤트 또는 일정에 반응 | 중간~높음 |
| Integration Plugin | 외부 서비스·API 연결 | 중간~높음 |
| Team Plugin | 역할·정책·워크플로·도구 묶음 | 중간 |

하나의 패키지가 여러 종류를 함께 제공할 수 있지만 manifest에서 각각을 선언해야 한다.

### 3.2 패키지 구조

아래 구조는 P1의 Core 호환 표준화와 P2의 Plugin Kit가 검증된 뒤 제공할 배포 목표다. 현재 Core manifest가 호환 기준이며, P1은 기존 manifest를 이 구조와 매핑한다. 한 플러그인에 서로 다른 두 manifest를 요구하지 않는다.

권장 결과물:

```text
example-plugin.spsplugin
├─ sps-plugin.json
├─ dist/
├─ README.md
├─ LICENSE
└─ SIGNATURE
```

`.spsplugin`은 배포용 컨테이너 형식이다. 초기 버전에서는 ZIP 기반이어도 되지만 확장자, manifest 위치, 경로 안전성, 서명 슬롯을 고정한다.

### 3.3 Manifest 최소 필드

다음 필드는 SPS Plugin Kit가 제공할 사용자용 manifest 형태다. P1에서 현재 Core의 실제 필드와 capability로의 손실 없는 매핑을 먼저 검증한다.

```json
{
  "schemaVersion": 1,
  "id": "com.example.plugin",
  "name": "Example Plugin",
  "version": "1.0.0",
  "engines": { "sps": ">=0.1.0 <1.0.0" },
  "entrypoints": {
    "worker": "./dist/worker.js",
    "ui": "./dist/ui.js"
  },
  "permissions": {},
  "contributes": {}
}
```

필수 규칙:

- `id`는 전역적으로 안정적이어야 한다.
- 선언하지 않은 권한은 사용할 수 없다.
- 설치 경로 밖으로 나가는 상대 경로를 금지한다.
- UI와 Worker 진입점은 설치 시 존재 여부와 해시를 검사한다.
- 호환되지 않는 SPS 버전에서는 활성화하지 않는다.

### 3.4 Lifecycle

표준 lifecycle:

```text
onInstall
onEnable
onStart
onStop
onDisable
onUpgrade
onUninstall
```

규칙:

- `onStart`는 중복 호출에도 안전해야 한다.
- 실패한 설치나 업그레이드는 이전 상태로 rollback할 수 있어야 한다.
- 플러그인 중지 시 등록한 listener, job, timer와 실행 프로세스를 정리한다.
- 삭제 시 사용자 데이터 처리 방식을 미리 표시한다.
- 설정과 상태 migration은 버전별로 명시한다.

### 3.5 권한 모델

권한은 기능 이름만이 아니라 범위를 함께 선언한다.

아래 이름은 SPS Extension Profile의 사용자용 권한 분류다. P1 호환 표가 현재 Core capability와 정확한 대응 관계를 고정하기 전에는 독립적인 권한 체계를 구현하지 않는다.

예시:

```json
{
  "permissions": {
    "projects": ["read"],
    "tasks": ["read", "comment"],
    "network": {
      "domains": ["api.example.com"]
    },
    "workspace": {
      "read": true,
      "write": false
    },
    "nodeCommands": []
  }
}
```

설치 화면은 사용자가 이해할 수 있는 문장으로 권한을 표시한다.

권한 위험 등급:

| 등급 | 예시 | 승인 기준 |
| --- | --- | --- |
| 낮음 | UI 표시, 프로젝트 읽기 | 설치 사용자 승인 |
| 중간 | 댓글 작성, 허용 도메인 요청 | 관리자 승인 가능 |
| 높음 | Task 생성·수정, 예약 실행 | Owner/Admin 승인 |
| 위험 | Workspace 쓰기, Desktop Node 실행 | 명시적 고위험 승인과 추가 검증 |

기본값은 항상 최소 권한이다. 설정 누락이나 오타가 더 강한 권한으로 승격되어서는 안 된다.

### 3.6 Plugin SDK 원칙

사용자는 가능한 한 다음 수준의 코드만 작성해야 한다.

```ts
export const tool = defineTool({
  name: "hello",
  input: { name: "string" },
  async run(ctx, { name }) {
    return { text: `안녕, ${name}` };
  }
});
```

SDK가 책임질 항목:

- input/output schema 검증
- 권한 검사
- 요청·실행 ID 전달
- 구조화 로그
- 취소 신호와 timeout
- 비밀 값 redaction
- 사용자용 오류와 운영 로그 분리
- 호스트 API 버전 호환 계층

## 4. Plugin Studio 계약

Plugin Studio는 “플러그인을 만드는 플러그인”이다.

### 4.1 사용자 흐름

```text
기능 설명
→ 플러그인 유형 추천
→ SPS Extension Profile 적합성 확인
→ 필요한 권한 초안
→ 프로젝트 골격 생성
→ 코드·manifest·테스트 생성
→ 정적 검사와 Sandbox 테스트
→ 권한 검토
→ 사용자 승인
→ 로컬 설치 또는 .spsplugin 내보내기
```

### 4.2 필수 안전 경계

- 생성 결과를 자동 활성화하지 않는다.
- 생성된 플러그인이 SPS Core나 다른 플러그인 소스를 직접 수정하지 못한다.
- 설치 전에 manifest, 파일 목록, 권한, 외부 도메인, 실행 명령을 사용자에게 표시한다.
- 테스트에 실패하면 패키징은 가능하더라도 “검증되지 않음” 상태로 명확히 표시하고 설치 기본값은 비활성화한다.
- 비밀 값은 생성 코드나 예제 파일에 기록하지 않는다.
- 고위험 권한은 자동 선택하지 않고 사용자의 명시적 승인을 요구한다.

### 4.3 첫 출시 범위

- TypeScript/JavaScript Worker 플러그인
- 기본 UI 확장 템플릿
- Agent Tool 템플릿
- Automation 템플릿
- manifest 편집기
- 로컬 test harness
- `.spsplugin` 패키징

여러 언어 SDK, 원격 빌드 서비스, Marketplace 직접 게시 기능은 이후 범위다.

Profile이 고정되기 전에는 Plugin Studio를 구현하지 않는다. Studio가 임의의 manifest나 비표준 권한 이름을 생성하면 이후 모든 플러그인의 호환 비용이 커진다.

## 5. Development Core 계약

Development Core는 게임·앱·웹 팀 플러그인이 공유하는 개발 작업 계층이다.

공통 기능:

- 저장소와 기술 스택 탐지
- 요구사항을 검증 가능한 Task로 분해
- 변경 예정 경로와 충돌 Task preview
- Git 상태와 변경 파일 요약
- 코드 리뷰와 검증 체크리스트
- 테스트·빌드 명령 계약
- 실패 로그 구조화
- 릴리스 노트와 완료 보고 형식
- 역할별 Agent instruction과 handoff 형식
- 작업 완료 전 증거 요구

Development Core는 특정 프레임워크를 강제하지 않는다. 공식 팀 플러그인이 각 분야의 대표 스택 adapter를 추가한다.

## 6. 공식 팀 플러그인 계약

### 6.1 Indie Game Team

권장 역할:

- Game Director
- Game Designer
- Gameplay Programmer
- Art Coordinator
- QA Agent
- Build Manager

첫 공식 지원은 하나의 대표 엔진을 깊게 지원하고, 다른 엔진에는 범용 흐름을 제공한다. 대표 엔진 선택은 구현 시작 전에 현재 사용자 프로젝트와 유지보수 비용을 기준으로 고정한다.

필수 흐름:

- 게임 기획서와 시스템 명세
- 기능별 Task 분해
- 프로젝트·씬·스크립트·에셋 구조 분석
- 플레이 테스트 체크리스트
- 버그 재현 보고
- 빌드 로그 분석
- 배포 후보 검증

### 6.2 App Product Team

권장 역할:

- Product Manager
- UX Designer
- App Developer
- Backend Developer
- QA Agent
- Release Manager

필수 흐름:

- 사용자 흐름과 화면 목록
- 기능 우선순위와 수용 조건
- 클라이언트·백엔드 계약
- 앱 권한과 민감 데이터 점검
- 테스트 시나리오
- 모바일·데스크톱 빌드 검증
- 스토어 설명과 릴리스 노트

### 6.3 Web Product Team

권장 역할:

- Product Manager
- UI/UX Designer
- Frontend Developer
- Backend Developer
- QA Agent
- DevOps Agent

필수 흐름:

- 페이지·기능·데이터 모델 정의
- 프론트엔드·백엔드 Task 분리
- 접근성·반응형·SEO 기본 검사
- 테스트와 빌드
- 배포 설정 검토
- 성능·보안 기본 검사
- 장애 로그 분석과 rollback 계획

## 7. 제품 보안 경계

플러그인 생태계는 사용자 코드와 로컬 Workspace에 접근할 수 있으므로 기능보다 신뢰 경계가 먼저다.

첫 출시의 최소 보안 요구:

- 플러그인별 명시적 권한
- Worker 실행 경계와 timeout
- CPU·메모리·출력 크기 제한을 추가할 수 있는 런타임 인터페이스
- 허용 도메인 기반 네트워크 접근
- Workspace path containment와 symlink 정책
- argument array 기반 프로세스 실행
- 임의 Shell 문자열 실행 금지
- 비밀 값 전달과 로그 redaction
- 설치·업데이트 파일 무결성 검사
- 실패 버전 비활성화와 이전 버전 rollback
- 모든 고위험 실행의 actor, plugin, project, task, node, run ID 기록

## 8. 첫 출시 성공 기준

처음 사용하는 사용자가 다음 흐름을 문서 도움만으로 성공해야 한다.

```text
SPS 설치
→ 프로젝트 생성
→ 공식 팀 플러그인 선택
→ Workspace 연결
→ 요구사항 입력
→ Agent가 Task를 분해
→ Worker가 실제 변경 수행
→ 테스트·빌드 결과 기록
→ 사용자가 변경을 검토하고 완료
```

출시 차단 조건:

- 서버 재시작 후 Task 실행이 사라지거나 중복되는 경우
- 권한 선언 없이 파일·네트워크·Task mutation이 가능한 경우
- 작업 취소가 실행 프로세스를 정리하지 못하는 경우
- 실패 원인과 변경 파일을 사용자가 확인할 수 없는 경우
- 플러그인 제거 후 listener나 job이 남는 경우
- 기본 제공 플러그인의 핵심 E2E가 반복 실행에서 안정적으로 통과하지 않는 경우

## 9. 첫 출시 비목표

다음은 제품 방향에서 제외하는 것이 아니라 첫 출시 뒤로 미룬다.

- 유료 Marketplace 결제
- 판매자 정산과 세금 처리
- 공개 판매자 심사 프로그램
- 플러그인 자동 원격 차단 서비스
- 기업용 비공개 Marketplace
- SSO, SAML, SCIM
- 모든 게임 엔진·앱 프레임워크·웹 스택 지원
- 코어 라이선스 최종 결정
- 코어 상업적 재사용 제한 정책

라이선스와 Marketplace는 실제 사용자·플러그인 개발자·운영 비용 데이터가 생긴 뒤 결정한다.

## 10. 문서 우선순위

현재 기준 문서:

1. `114-sps-product-and-plugin-platform-contract-ko.md`: 제품과 첫 출시 범위
2. `115-sps-plugin-kit-and-bundled-teams-implementation-plan-ko.md`: 구현 순서와 완료 기준
3. `75-optimal-work-environment-blueprint-ko.md`: Room·Task·Workspace 상세 Workplane 청사진
4. `113-sps-generic-agent-platform-core-contract-ko.md`: Core와 범용 Agent 플랫폼 경계
5. 운영·배포 문서: 현재 배포 방식과 실제 절차
6. 번호가 붙은 구현 로그: 당시의 증거와 역사

이 문서가 구현 완료를 주장하지 않는다. 각 기능의 실제 상태는 구현 계획과 검증 로그에서 별도로 관리한다.
