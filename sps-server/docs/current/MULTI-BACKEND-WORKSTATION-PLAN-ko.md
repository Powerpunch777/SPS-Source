# SPS 범용 워크스테이션 / 다중 실행 백엔드 계획

기준일: 2026-10-25 KST. 상태: Stage 0/1 및 Stage 2a/2b/2c 소스 수용 통과,
Stage 3b 모델 broker 구현·통합 검증 진행.
이 문서는 사용자의 다중 백엔드 전달 문서와 후속 **Core 비공개 / SDK 공개 유지**
결정을 제품 문서에 정렬한다. 전달 문서의 예시 API를 실제 export로 간주하지 않는다.
현행 근거는 [재사용 감사](../reviews/MULTI-BACKEND-REUSE-AUDIT-2026-10-25.md),
기존 UI/복구 이전은 [진행 기록](../reviews/CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md)을 따른다.
Stage 1의 실제 변경·버그 재현·최종 시험 범위는
[No-AI 수용 기록](../reviews/NO-AI-WORKSPACE-ACCEPTANCE-2026-10-25.md)으로 구분한다.
Stage 2a의 최종 tuple·82/157/530 및 실제 앱 범위는
[Runtime 관측 수용 기록](../reviews/RUNTIME-DISCOVERY-ACCEPTANCE-2026-10-25.md)을 따른다.
Stage 2b의 Host API 등록 확인과 실제 권한 거부는
[Host 지원 수용 기록](../reviews/HOST-SUPPORT-ACCEPTANCE-2026-10-25.md)을 따른다.
Stage 2c의 안전한 Agent 조회·Node freshness 보정은
[Agent 조회 수용 기록](../reviews/AGENT-EXECUTION-DESCRIPTOR-ACCEPTANCE-2026-10-25.md)을 따른다.
모델 요청의 mock-first 구현 범위는 아래 Stage 3b로 구분한다. OCE와 실제 제공자
인증을 포함한 전체 다중 백엔드 목표가 완료된 것은 아니다.
Stage 3b의 최종 통합/실제 앱 상태는 [모델 broker 검증 기록](../reviews/MODEL-BROKER-ACCEPTANCE-2026-10-25.md)을 따른다.

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
| AI 없는 UI·데이터·자동화 | 공개 SDK `ui`, `platform`의 data/actions/state/events/jobs, portable Worker | Stage 1 임시 reference의 source Desktop 수용 통과. 실제 고객 앱/설치본 증거와는 별도 |
| 승인된 CLI 실행 | `runtime.runtimes`, execution grants, `runs.dispatch/get/list/listEvents/cancel`, Node lease | Stage 2a optional 연결 관측 추가. 등록된 Runner 범위이며 임의 executable/cwd를 받는 일반 CLI API가 아님 |
| Agent 대화/취소 | 공개 SDK **`platform`**의 `agents.sessions.create/list/sendMessage/getRun/cancel` | 내부 SDK와 공개 facade의 옵션/close 차이, 실제 backend별 능력·종료 증거 확인 |
| 기술 관측 | `executions.list/get/summarize`, provenance-aware usage, Artifacts | Stage 3b는 model_request lane을 추가. OCE 배포를 기존 lane에 위장하지 않음 |
| 일반 OpenClaw | 기존 `openclaw_gateway` 어댑터와 mock WS 시험 | 최신 pairing/challenge, 재연결·승인·취소·세션·Secret 범위를 재검증 |
| Direct model API | Stage 3a 내부 전송 + Stage 3b 영속 연결/grant/Run과 공개 models API | Responses-compatible 텍스트 subset의 mock-first 구현. 설정 UI·실제 제공자 인증은 미완료 |
| OCE 관리 | 현재 직접 재사용 가능한 전용 Connector 미확인 | 읽기 전용 자원 조회부터 별도 connector; 일반 Gateway 세션과 다른 권한/수명주기 |
| 키 사용 | Node credential-local, 암호화 Secret + model connection 전용 grant/binding | models API는 Host 내부에서 키 사용, 원문 resolve RPC는 계속 거부. OCE 관리 broker는 미구현 |

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

### Stage 2a: Node 연결 관측의 좁은 구현

새 통합 backend registry나 전역 실행 엔진 대신 기존 `sps.runtimes.list`에
optional `connection` DTO만 추가한다. 과거 Host가 필드를 생략하면 unknown이다.
실행 주체 `node`, 별도 execution grant 필요, heartbeat 기반 상태와 관측 시각을
제공한다. 새 connection은 active/키 검증/유효한 최근 heartbeat가 모두 맞아야
recently_seen이며, 철회·미검증·과거·미래/누락 시각을 구분한다. 기존 online의
heartbeat-only 의미는 보존하며 철회 직후에도 true일 수 있다. 최근 관측이 CLI 로그인·사용 가능·권한을
증명하지 않는다. credential/availability 정보와 dispatch 시 재검사를 그대로 둔다.

읽기 권한만 가진 임시 Worker로 실제 Desktop→공개 SDK→Core 조회를 확인한다.
모의 Node의 서명 heartbeat/Host 승인/철회와 A/B Workspace 분리를 실제 API로
검증하되 CLI 명령·실제 Provider·원격 PC는 실행하지 않는다. DB 시험은 조회가
grant/run을 생성하지 않는 점과 Node/Runner 양쪽 tenant 검사를 포함한다.
이 단계에는 UI 변경, DB migration, 새 Secret 읽기, 실제 키 또는 의존성 전환이 없다.
Agent/모델/OCE 연결과 취소·복구 지원은 아직 별도 후속 범위다.
실제 source Electron의 모의 Node 조회와 기존 No-AI 전체 수용을 통과했다. 실제
CLI/원격 PC/설치본 수용은 아니며 위 상세 기록으로 증거 범위를 고정한다.

### Stage 2b: 호출 전 Host API 등록 확인

기존 초기화 메시지에 optional `spsHost` snapshot을 추가한다. 공개 Runtime/Agent
session API 중 실제 등록된 Host handler 이름만 제공하며 Worker callback 목록과
구분한다. 공개 SDK reader는 구 Host의 미제공/모르는 계약을 unknown으로 다룬다.
SDK/제품 버전만 보고 호출 가능하다고 추정하지 않고, 미지의 미래 method도 지원
목록에 넣지 않는다. 비정상 snapshot은 거부하며 키/경로/tenant 자료는 포함하지 않는다.

이는 API 등록 상태이며 Plugin 권한·Workspace 활성화·실제 backend 설정/로그인/
readiness 판정이 아니다. 목록에 있는 Runtime API도 capability가 없으면 실제 호출은
거부되어야 한다. 초기화/Worker 재시작 시 새 snapshot을 만들고 매 호출의 기존
검사는 유지한다. 모델 API/OCE broker는 이 단계를 통해 구현된 것으로 표시하지 않는다.
DB migration/새 endpoint/무음 fallback 없이 기존 transport를 확장한다.
이 소스의 Desktop 531/531, SDK 163/163, Core 표적 49+88과 30개 package 타입 검사,
실제 Desktop/공개 SDK snapshot 조회 및 capability 거부를 확인했다. 정확한 tuple과
연속 수용/정리 범위는 위 기록을 따르며 전체 backend 지원이 완료됐다는 뜻은 아니다.

### Stage 2c: 안전한 Agent 실행 설정 조회

기존 Agent list/get은 호환 shape를 유지한다. 별도 `agents.describeExecution` 읽기를
기존 `agents.read`·Workspace invocation·현재 등록 어댑터/Node binding에 연결한다.
설정 상태·어댑터 등록과 Node 관측만 제공하고 config/cwd/환경/키/prompt/역할을
읽어 반환하지 않는다. readiness는 unknown, 실제 권한은 dispatch 때 다시 검사한다.
adapter routing을 Host 로컬 실행이라고 단정하거나 Gateway/OCE의 실제 연결로
표시하지 않는다. API 지원 snapshot에도 정확한 method를 추가한다.

구현 전 조사에서 Agent Node 실행 경로가 미래 heartbeat를 최근으로 취급하는
중복 판정을 발견했다. 기존 Stage 2a의 엄격한 helper를 재사용하고 명령 생성 전
거부하는 회귀 시험을 추가한다. 별도 임시 Workspace의 실행하지 않는 Agent를
Desktop에서 조회·일시중지·Node binding/철회하며 No-AI A/B Workspace는 Agent 0개로
유지한다. 실제 Provider 호출이나 사용자 데이터/설치본 변경은 하지 않는다.
최종 Desktop 532/532, SDK 166/166, Core 관련 9파일 85/85와 30개 package typecheck,
source Electron의 실제 최소 정보/권한·scope·Node binding/철회 및 기존 No-AI 전체
연속 수용을 통과했다. 정확한 tuple과 실패/수정 이력은 위 수용 기록을 따른다.

### Stage 3a: Host 내부 모델 전송과 Secret 결속 기반

Direct API 전체를 한 번에 공개하지 않고, 우선 기존 Secret 저장소와 binding을
재사용하는 내부 primitive를 구현한다. 고정된 Host endpoint/model로 Responses
호환 텍스트 요청 한 번만 수행한다. Plugin/renderer에 키를 반환하거나 현재
차단된 secrets.resolve를 켜지 않는다. 공개 SDK/RPC/capability/UI 등록은 없다.

- Host가 명시한 HTTPS endpoint만 사용한다. 로컬 시험/모델의 HTTP는 명시 opt-in한
  숫자 loopback에 한하며 localhost도 127.0.0.1로 고정한다. redirect·자동 재시도·
  다른 backend fallback·tool/session·background·provider storage는 사용하지 않는다.
- 입력/응답 바이트, 출력 토큰, 전체 대기 시간과 인스턴스별 동시 요청을 제한한다.
  취소/timeout을 무시하는 키 조회·전송/정리 작업은 완료될 때까지 슬롯을 유지한다.
  크기×동시성의 요청/응답 버퍼 합계는 8MiB 이내다. 이는 heap/OS/전역·분산 자원
  제한이나 제공자의 작업·과금 중단 증명이 아니다.
- 기존 암호화 Secret과 Plugin instance binding의 예약 목적 경로를 확인한다.
  Workspace/Plugin/connection/binding/사용할 버전을 같은 SQL 스냅샷에서 검사하고,
  비동기 키 조회 뒤 삭제·재결속·latest rotation·버전 철회를 다시 확인한다.
  latest는 current만, 명시적 버전 pin은 사용 가능한 previous도 허용한다.
- 응답은 텍스트/거절, 기술적 completed/incomplete, 검증된 보고 토큰만 투영한다.
  오류/annotation/provider 식별자와 reasoning 원문은 전달하지 않는다. usage 미제공은
  unknown이며 가격을 추정하지 않는다. 정확한 키 echo는 거부하나, 승인된 악성
  제공자가 키를 변형·유출하는 위협이나 JS 메모리 소거를 해결한 것은 아니다.

Stage 3a 당시에는 **공개 handle broker 완료가 아니었다**. connection UUID는 예약 목적
식별자였고 durable endpoint/model 연결 레코드나 grant가 없었다. binding만으로는 실행
권한이 아니다. 후속 Stage 3b에서 Host 소유의 영속 연결/Plugin grant, 인증된
invocation/활성화·capability 재검사, 새 model lane의 기록/idempotency/재시작 및
결과 전달 시 철회를 묶은 뒤 공개 SDK/UI를 연결한다. 현재 limit는 인스턴스별이므로
공개 호출마다 새 인스턴스를 만들어 quota를 우회하지 않게 수명주기를 설계한다.
마지막 검증과 외부 전송 자체가 원자적인 것도 아니다. 실제 키/유료 호출, 설치본
교체나 production 보호 인증 없이 가짜 키·격리 DB·로컬 HTTP mock으로 먼저 검증한다.

최종 13파일 192/192, Desktop 532/532, SDK 166/166과 타입/서버 빌드 및 기존
source Desktop 연속 수용/정리 exit 0을 통과했다. 범위·정확한 tuple과 재현 명령은
[Stage 3a 검증 기록](../reviews/MODEL-TRANSPORT-FOUNDATION-ACCEPTANCE-2026-10-25.md)을 따른다.

### Stage 3b: 영속 모델 연결·공개 broker

- Host-only API가 Workspace별 연결과 Plugin grant를 관리한다. 연결의 endpoint,
  model, Secret 참조, limit는 불변이며 변경할 때 새 연결을 만든다. 비활성화는
  grant를 철회한다. 재승인은 revision을 올려 과거 결과 권한을 되살리지 않는다.
- 공개 SDK `runtime.models.list/submit/get/cancel`은 개별 capability와 인증된
  invocation Workspace를 요구한다. 현재 package/활성화/dependency/grant/binding/
  Secret 및 실제 사용 버전을 전송·결과 전달·실행 중 다시 확인한다. Plugin은
  endpoint/model/키/tools를 override할 수 없고 raw 키 RPC도 켜지 않는다.
- additive DB migration으로 connection/grant/run을 추가한다. 기존 Agent/Node/Task
  레코드를 전환하지 않는다. Workspace·Plugin requestKey/input hash를 HTTP 전에
  기록하며 같은 입력의 중복 요청은 기존 Run을 반환한다. 원문 입력은 메모리에만
  있고 재시작 후 자동 재전송하지 않는다. 결과는 bounded text/refusal만 저장한다.
  Secret 암호화와 달리 결과 데이터 전체가 암호화됐다고 주장하지 않는다.
- 실행·lease·취소와 실제 로컬 전송 정리를 구분한다. upstream 처리·과금 종료는
  unknown이며 자동 HTTP 재시도나 backend fallback은 없다. 보고 토큰은 철회 후에도
  기록하되 미측정 값·가격은 unknown이다. 공통 `model_request` 기록에는 원문 입력/
  결과 없이 기술 정보만 제공하며 모델 이름은 provider report가 아닌 Host 설정이다.
- 실제 source Desktop의 별도 Agent 0개 Workspace에서 가짜 암호화 키와 loopback
  HTTP mock만 쓴다. No-AI A/B의 backend 미설정 계약은 보존한다. 신규 Host 설정
  폼·실제 API/실키·설치본·물리 두 PC·OCE·보호 실행 인증은 이 단계에 포함하지 않는다.
- 롤백은 연결 비활성화/grant 철회로 신규 호출을 막는다. additive 테이블을 수동
  삭제하거나 기존 사용자 데이터를 down migration하지 않는다. 구 Host의 새 API
  미지원은 명시적 unsupported이며 SDK 버전만으로 실행 가능성을 추정하지 않는다.

이 순서는 OCE를 마지막에 붙일 때까지 모든 UI 작업을 중지한다는 뜻이 아니다.
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

## 8. Stage 0 검증 이력·남은 결정

아래 시험은 Stage 0 당시의 고정값/범위다. 이후 Stage 1의 Core Job 보정, SDK
optional type, 최종 528/157/36 시험과 source Electron 결과는 위 No-AI 수용 기록을
따른다. Stage 0의 “미실행” 문장을 현재 Stage 1 상태로 해석하지 않는다.

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
- Source `027294f`에서 Desktop `npm test`: **512/512**, 실패/skip 0.
  문서·Core gitlink·support matrix를 함께 커밋한 뒤 실행했다. 이후 후속 변경은
  이 결과 기록뿐이다. 변경 문서 12개 로컬 링크 108개와 `git diff --check`도 통과했다.
- 이전 D2의 source Electron/512 Desktop 시험은 그 고정 tuple의 이력이다.
  이번에 전체 Core/빌드/실제 Electron/의존성 감사/서명본 시험을 새로 실행한 것으로
  표시하지 않는다. 첫 No-AI reference의 전체 Desktop 시험도 아직 하지 않았다.
- 고객 실데이터, 유료 API, OCE 실 클러스터·관리 mutation, 원격 파일 전송 기술,
  production 보호 지원 모드는 관련 단계에서 사용자의 선택/승인을 확인한다.
  그 전까지 mock/명시 unsupported로 두고 별도 제품 결정을 임의 확정하지 않는다.
