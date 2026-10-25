# SPS 범용 워크스테이션 / 다중 실행 백엔드 계획

기준일: 2026-10-25 KST. 상태: Stage 0 조사·설계 정리 완료, 런타임 추가 구현 전.
이 문서는 사용자의 다중 백엔드 전달 문서와 후속 **Core 비공개 / SDK 공개 유지**
결정을 제품 문서에 정렬한다. 전달 문서의 예시 API를 실제 export로 간주하지 않는다.
현행 근거는 [재사용 감사](../reviews/MULTI-BACKEND-REUSE-AUDIT-2026-10-25.md),
기존 UI/복구 이전은 [진행 기록](../reviews/CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md)을 따른다.

## 1. 제품 결정과 비변경 범위

- SPS는 고객별 프로그램을 Plugin으로 구성하는 워크스테이션 기반이다. AI는 선택이다.
  첫 실증은 게임 개발 환경이고 고객별 외주 Plugin·운영 절차를 재사용한다.
- Core는 기술적 수명주기·저장·인증·실행·기록·복구를, Plugin은 UI·업무 모델·역할·
  Lead/Worker·업무 승인·평가를 소유한다. 별도 범용 Agent 지휘 엔진을 새로 만들지 않는다.
- 모델 API / 승인된 Process·CLI / Agent 세션은 선택적 실행 경로다. OCE는 그 위의
  별도 Agent 관리·배포 제어 경로이며 모델 공급자나 SPS의 필수 기반이 아니다.
- Primary 0~1개는 기본 진입 UI 선택이다. Extension의 전체 화면·자체 창·headless
  자유는 목표로 유지하며, 전체 표현 계약이 이미 구현됐다는 뜻은 아니다.
- Core 비공개, Plugin SDK 공개를 유지한다. 저장소 공개·라이선스 변경·외부 코드 복사는
  하지 않는다. OCE를 추가해도 SPS Plugin과 OpenClaw Plugin은 서로 다른 패키지다.
- 현재 Windows Desktop / Host·Member / Tailscale / 로그인 계약은 유지한다.
  **No AI는 새 오프라인 제품 모드나 로그인 제거를 뜻하지 않는다.**
- 기존 데이터·Vault·실제 키·Plugin ID·활성화·기본 번들을 무음 변환하지 않는다.
  Marketplace 검색/설치 기존 기능은 유지하되 커뮤니티·결제는 초기 납품의 선행 조건이 아니다.
- Zod/의존성 전환과 설치본 교체의 별도 보류, 서명·Identity·Linux·두 PC 릴리스
  게이트는 해제하지 않는다. 이 설계는 고객 환경 배포나 운영 보안 인증이 아니다.

## 2. 기존 기능부터 연결한다

| 목적 | 재사용 | 추가가 필요한 부분 / 현행 한계 |
| --- | --- | --- |
| AI 없는 UI·데이터·자동화 | 공개 SDK `ui`, `platform`의 data/actions/state/events/jobs, portable Worker | 단일 No-AI 앱의 Desktop 전체 흐름 증거는 별도로 필요 |
| 승인된 CLI 실행 | `runtime.runtimes`, execution grants, `runs.dispatch/get/list/listEvents/cancel`, Node lease | 등록된 Runner 범위이며 임의 executable/cwd를 받는 일반 CLI API가 아님 |
| Agent 대화/취소 | 공개 SDK **`platform`**의 `agents.sessions.create/list/sendMessage/getRun/cancel` | 내부 SDK와 공개 facade의 옵션/close 차이, 실제 backend별 능력·종료 증거 확인 |
| 기술 관측 | `executions.list/get/summarize`, provenance-aware usage, Artifacts | 기존 lane은 node/agent_session. 모델 요청·OCE 배포를 임의로 기존 lane에 위장하지 않음 |
| 일반 OpenClaw | 기존 `openclaw_gateway` 어댑터와 mock WS 시험 | 최신 pairing/challenge, 재연결·승인·취소·세션·Secret 범위를 재검증 |
| Direct model API | provider 설정/권한/기록 primitive만 검토 | 조사 범위에서 범용 generate API 미확인. 기존 HTTP 도구 + 원문 키로 대체하지 않음 |
| OCE 관리 | 현재 직접 재사용 가능한 전용 Connector 미확인 | 읽기 전용 자원 조회부터 별도 connector; 일반 Gateway 세션과 다른 권한/수명주기 |
| 키 사용 | Node credential-local 계약, 저장/권한 primitive | `secrets.resolve` 타입은 string이나 현행 handler는 scope 미완성으로 거부. handle-only broker는 미구현 |

앞선 빠른 조사에서 공개 세션 API를 놓친 부분을 정정한다. `runtime`에 없다는 것은
전체 공개 SDK에 없다는 뜻이 아니다. canonical SDK는 `external/sps-plugin-sdk`다.
고정 소스에 있는 추가 기능과 published tag의 지원 여부도 별도로 구분한다.

## 3. 실행 수단과 제어 수단의 계약

아래는 책임 경계이며 새 export 이름/URL/테이블이 아니다. 설치된 Host가 지원하지
않는 기능은 거부하고, SDK 버전 문자열만으로 지원을 추정하지 않는다.

| 경계 | 실제 실행/상태 소유자 | SPS가 연결할 최소 정보 | 취소의 의미 |
| --- | --- | --- | --- |
| 모델 요청 | 선택한 모델 endpoint/요청 | 요청 ID, bounded 입력/출력·schema, usage와 provenance | 요청 취소 수락과 upstream 처리 종료/과금은 다름 |
| CLI | 실행 Node의 프로세스 트리 | grant/Runner/Source/run ID, timeout/log/exit evidence | Core 요청, Node ack, 실제 close 관측을 분리 |
| Agent 세션 | 기존 SPS adapter 또는 Gateway | 정확한 connection/agent/session/turn/run, capabilities, event seq | turn 취소와 세션 종료/후속 예약 취소는 다름 |
| OCE 제어 | 선택한 Installation의 control plane | Namespace/Agent/Revision/operation와 허용 binding | 배포 중지 요청과 Gateway/Harness 종료 확인은 다름 |

공통 read envelope는 기존 안전한 실행 DTO를 우선 재사용한다. 원문 prompt, 환경변수,
키, 내부 경로를 management metadata에 넣지 않는다. 수집 불가능한 usage는 null/
unavailable이고 비용 모델을 섞어 합산하지 않는다. 부분 연결 실패는 unknown/pending;
다른 backend로 자동 재실행하거나 원격 성공을 추정하지 않는다.

## 4. 권한·자격증명·자원 매핑

| 자원 | 권위 있는 소유자 / 필수 검사 |
| --- | --- |
| SPS Workspace, Plugin 활성화·수명주기 | SPS Host의 기존 기술 권한, Plugin capability, 실제 invocation 문맥 |
| Node 실행/로컬 계정 | Node 소유자의 공개 선택 + 현재 grant/lease/Source 권한 |
| Gateway 세션 | 승인된 connection과 device identity/scope, 정확한 Agent·세션 소유권 |
| OCE 관리 자원 | 별도 OCE IAM + SPS의 Workspace별 허용 resource binding. Host 로그인만으로 OCE admin이 되지 않음 |
| 외부 인증자료 | 승인된 credential binding/broker가 사용. Plugin/renderer로 raw 관리자 키 반환 금지 |

Core가 principal/Workspace/Plugin/run 문맥을 유도한다. Plugin이 body에 쓴 ID나
Namespace만 믿지 않는다. OCE endpoint·리소스 범위는 승인된 binding에서 얻고,
임의 URL/redirect를 통해 키가 다른 host로 전달되지 않도록 한다. 고객의 내부망
endpoint는 명시 설정으로 검증할 수 있어야 하며 private IP를 무조건 차단하는 식의
새 전역 정책을 임의 추가하지 않는다. 영속화 위치·rotation·철회/재연결은 broker
구현 PR에서 명시하고 테스트한다. 신규 broker 전에는 모델 실키/OCE 관리자 작업을 켜지 않는다.

논리 scope, manifest capability, cwd, remote Namespace는 각각 OS/renderer 격리의
증거가 아니다. 기존 신뢰 실행의 한시 유지 승인도 강한 보호 표시나 Vault 제한
우회 승인으로 확대하지 않는다. 보호 미지원 lane은 명시적으로 실행 거부한다.

## 5. 원격 파일과 결과 적용

Host의 Windows 폴더 문자열을 Gateway/Harness의 cwd로 전송하는 계약을 만들지 않는다.
첫 원격 Connector는 **자동 Source mount/동기화/전체 프로젝트 업로드 없음**으로 시작한다.
파일 작업이 필요한 Plugin은 다음 중 실제 지원되고 승인된 방식을 명시해야 한다.

1. 현재 SPS Node/암호화 Source route를 쓰는 경우 기존 Host 공유 권한을 재검증한다.
2. 별도 원격 checkout/자료 전달을 쓰는 경우 허용 revision·경로·전달 byte 범위와
   credential binding을 저장한다. `.git` 인증자료/Vault/CLI home은 자동 포함하지 않는다.
3. 원격 변경은 base revision과 변경 경로/해시를 가진 결과로 돌려받는다. 파일 삭제·
   rename·충돌·symlink/reparse를 검증하고 Host의 명시적 적용 경로로 넘긴다.
4. 적용 여부는 Plugin/사용자의 작업 정책이다. Core는 허용 Source 밖으로의 쓰기,
   오래된 base에 대한 무음 덮어쓰기와 실행 취소를 파일 undo로 표시하는 일을 막는다.

선택할 전송 기술, Git 호스팅, 저장 기간, Unity/Unreal 실제 실행 환경·라이선스는
아직 결정하지 않았다. 필요한 사례가 생기면 사용자에게 확인하고 좁은 PR로 정한다.

## 6. 작은 구현 단위와 수용 기준

| 순서 | 범위 | 통과 기준 / 롤백 |
| --- | --- | --- |
| 0 이번 조사 | 재사용 매트릭스·권한/파일 경계·문서 정렬, 기존 계약 시험 | 새 런타임/DB/키 변경 없음. 문서 revert 가능 |
| 1 첫 구현 PR | **No-AI reference Plugin + 격리 Desktop 수용 시험** | 아래 범위. 기존 API로 부족한 부분을 먼저 증명; 새 AI API 불필요 |
| 2 선택적 연결 metadata | 기존 Runtime/Agent discovery에서 지원/설정/권한/실행 소유권 구분 | 모델·CLI·세션·OCE를 하나의 실행 명령으로 합치지 않음. 미지원 능력 거부, Workspace A/B 누출 없음 |
| 3 Direct API | mock-first model request + handle broker + bounded output/usage | egress·키 무노출·timeout/응답 유실·중복 효과 검사. 실키/유료 호출은 별도 승인. grant 차단으로 롤백 |
| 4 CLI reference | 승인된 고정 Runner로 작은 검사/게임 빌드 사례 | 일반 CLI 등록/승인 범위와 OS 지원표 확인. child 종료/권한 철회/재시작; 임의 shell API 추가 금지 |
| 5 Gateway | 기존 adapter의 고정 버전 호환부터, 이후 세션 기능 | challenge/pairing/device scope, 재연결 snapshot, seq gap, 취소 pending, 명시 버전 오류. 이전 lane으로 무음 fallback 금지 |
| 6 OCE | 별도 control-plane binding과 mock read-only inspection | Installation/Namespace/Agent/Revision 정확 매핑, OCE IAM 거부·redaction. 배포/중지 mutation은 별도 사용자 승인 |
| 7 Builder/첫 workstation | 기존 Lead/Worker에서 필요한 backend만 선택, Preview/build/package 재사용 | 요구→제작→Preview→Host 명시 설치→실사용. 두 PC·Source와 최종 설치본 검증을 별도 수행 |

순서는 OCE를 마지막에 붙일 때까지 모든 UI 작업을 중지한다는 뜻이 아니다.
Primary/Extension·선택적 Plugin chrome은 기존 이전 계획 E/F-UI와 병행하되
정의하지 않은 보안/종료 보장을 선행 조건처럼 가정하지 않는다. 기존 전체 A~L의
안전성·수명주기 항목을 삭제하거나 조사만으로 완료 표시하지 않는다.

### 첫 구현 PR의 고정 범위

- 프로젝트: SDK의 실제 ui/worker/platform/state/events/jobs 계약만 쓰는 작은
  **Workspace 체크리스트 reference**. AI 모델·Agent·Node Runner가 없어도 UI에서
  항목 추가/완료, Workspace-scoped 저장/다시 읽기, 명시적 기록 갱신을 확인한다.
- 같은 Plugin의 headless job/event handler를 임시 Host에서 실제 등록·호출한다.
  `agent.tools.register`라는 이름만으로 AI 실행/계정이 필요하다고 간주하지 않는다.
  해당 기술 capability가 필요한 UI action 등록은 기존 Core 검사를 따른다.
- 테스트 manifest/데이터·임시 Local Registry만 사용하고 기본 번들에 추가하지 않는다.
  production 설치/공식 서명/공개 게시/실제 사용자 Plugin 변경은 하지 않는다.
- Agent 목록 0개, AI endpoint/Gateway/OCE 미설정에서 initialize→UI action→state→
  event/job→reload→shutdown 흐름을 검증한다. provider/Gateway 요청 0회를 별도 관찰한다.
- Workspace A/B 상태 오염 거부, 권한 미선언 action/state 차단, UI 없는 Worker health,
  재시작 데이터 보존, 오류가 Native 복구를 막지 않는 사례를 시험한다.
- 기존 pinned 공개 SDK로 가능하면 API/schema/version 변경 0개를 유지한다. 부족하면
  재현 테스트와 최소 additive 계약을 먼저 검토하고, 비공개 Core import로 우회하지 않는다.
- 기존 grant/Runner/Agent를 자동 생성하거나 working directory로 sandbox를 꾸미지 않는다.
  시험 통과는 source fixture 증거이지 비신뢰 Plugin의 production 보호 인증이 아니다.
- rollback은 시험 Plugin/임시 Host 제거와 테스트 코드 revert다. 기존 DB down migration 없음.

## 7. 공식 자료 고정과 알려진 간극

2026-10-25에 공식 main 문서를 다음 리비전으로 고정해 읽었다. 설치본/패키지 검증은 아니다.

- OpenClaw `824aa79ff0078f8fa732e0af702d315c7c329131`:
  [Gateway clients](https://github.com/openclaw/openclaw/blob/824aa79ff0078f8fa732e0af702d315c7c329131/docs/gateway/clients.md).
  문서는 client/protocol `2026.8.1`, wire 4를 안내하며 Gateway와 함께 검증하도록 한다.
  challenge의 `ts`를 서명 시각으로 요구한다. SPS도 wire 4이나 challenge nonce만
  보관하고 `Date.now()`로 서명하는 경로가 있다. 최신 조합 지원으로 홍보하기 전
  이 간극과 mock fixture를 수정·검증한다. SDK를 추가로 설치하거나 wire 코드를 이식하지 않았다.
- OCE `cf02a4cf8c4dc603c55cbda662e9e6a972fc3e16`:
  [아키텍처](https://github.com/openclaw/openclaw-enterprise/blob/cf02a4cf8c4dc603c55cbda662e9e6a972fc3e16/docs/design.md),
  [격리](https://github.com/openclaw/openclaw-enterprise/blob/cf02a4cf8c4dc603c55cbda662e9e6a972fc3e16/docs/reference/security/runtime-isolation.md),
  [OpenShell](https://github.com/openclaw/openclaw-enterprise/blob/cf02a4cf8c4dc603c55cbda662e9e6a972fc3e16/docs/reference/drivers/openshell-sandbox.md).
  관리 plane과 실제 실행 환경의 책임을 분리하며 실험/미검증 경계를 명시한다.
  OCE 선택만으로 SPS Plugin/renderer/Vault가 보호된 것으로 처리하지 않는다.

코드 직접 이식/새 의존성을 도입하는 PR은 그 **정확한 버전의 라이선스·고지**를
다시 확인한다. 이번 조사에서 외부 코드를 복사하거나 라이선스를 바꾸지 않았다.

## 8. 검증·남은 결정

- 조사 baseline: Source `f353df0b78c8d6a5c139906a35c0504b7fbb4769`, Core
  `df26bea0148e163cd05efaa62aba6a2959d89870`, SDK
  `cfa64ec4f589ea9765661834e1685ef1f2e14453`, Desktop 소스 `0.4.137`.
- 공개 SDK `npm test`: **157/157**, Core mock Gateway/session/job/Node 4파일:
  **40/40**. 실제 문서 변경 전/진행 중 동일 runtime 코드에서 수행했다.
  모델/고객 데이터/실제 Gateway/OCE/물리 Node·클러스터 호출 없음.
- 위 Core 40개 재현 명령 (`external/sps-core`):

  ```sh
  pnpm exec vitest run server/src/__tests__/openclaw-gateway-adapter.test.ts server/src/__tests__/plugin-agent-session-context.test.ts server/src/__tests__/plugin-job-workspace-scheduler.test.ts server/src/services/sps-node-execution.test.ts
  ```

- 문서 정렬 후 Core pin은 `8c2a4989b32bf6661223df5e0330c68741590d08`이다.
  이 Core 변경은 README/계약 문서뿐이며 실행 코드·SDK는 조사 baseline과 같다.
- 이전 D2의 source Electron/512 Desktop 시험은 그 고정 tuple의 이력이다.
  이번에 전체 Core/빌드/실제 Electron/의존성 감사/서명본 시험을 새로 실행한 것으로
  표시하지 않는다. 첫 No-AI reference의 전체 Desktop 시험도 아직 하지 않았다.
- 고객 실데이터, 유료 API, OCE 실 클러스터·관리 mutation, 원격 파일 전송 기술,
  production 보호 지원 모드는 관련 단계에서 사용자의 선택/승인을 확인한다.
  그 전까지 mock/명시 unsupported로 두고 별도 제품 결정을 임의 확정하지 않는다.
