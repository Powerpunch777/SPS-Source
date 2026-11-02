# Builder 선행 기반 진행 기록

2026-11-02. [승인된 실행 계획](BUILDER-PREREQUISITES-EXECUTION-PLAN-2026-11-02.md)의 후속이다.
전체 Core, Lead 실제 AI 또는 Stable 완료 기록이 아니다. 장기목표는 active다.

## A. 현재 경계와 재사용 위치

| 영역 | 기존 위치 | 확인/남은 작업 |
| --- | --- | --- |
| 독립 Native 설정 | Desktop `src/core-settings-controller.mjs`, preload, `renderer/core-settings.*` | 별도 창/partition과 sender/frame 검사, Host 없이 표시. 전체 시스템 관리 기능은 아님 |
| 트레이·단축키·복구 | Desktop `main.mjs`, `core-recovery-store.mjs` | 기존 진입과 시작 차단·명시적 재시작 재사용. 파일 오류는 fail-closed |
| Native Plugin 검토 | Desktop `showRegistryWindow`, Registry controller/renderer | 기존 Sources 창 재사용. 플러그인 UI나 Workspace를 먼저 띄울 필요 없음 |
| Workspace 진입 | Core `SpsWorkspaceLayout.tsx`, `SpsEmptyWorkspace.tsx`, workspace-surfaces API | 빈 진입/선택형 Primary 기반 재사용. Plugin route에는 호환 Core Layout이 붙었던 공백 |
| Plugin 화면 | Core `PluginPage.tsx`, `PluginSlotMount`, 전역 Company/Breadcrumb/LiveUpdates | 실제 page contribution/권한은 유지하면서 화면 프레임만 분리 |
| Agent 세션 | Core Workspace Plugin Host, 공개 SDK `agents.sessions` | ensure/create/list/sendMessage/getRun/cancel 기반. 세션 identity는 전송 중복 방지가 아님 |
| Builder | 별도 v15/v9 레포의 `lead-sessions` 연결·snapshot | 세 Lead 세션 준비/재확인 기반. 실제 send·분할 메시지·공유 기억은 미완료 |

새 실행 서버·DB·워크플로 엔진을 먼저 추가하지 않는다. Native LAN 구현과 Native 시스템
설정은 다른 범위다. Core가 Lead/CTO/Worker 역할이나 업무 성공을 판단하지 않는다.

## B. 독립 관리 경로의 첫 보완

Core Settings에 기존 Native `Plugin sources & review` 창을 여는 동작을 추가했다.
Host 본인만 사용할 수 있고 인자 없는 고정 IPC만 허용한다. 현재 trusted Settings의
sender/mainFrame/URL을 확인하고 권한 확인과 비동기 창 열기 뒤에 재검사한다.
지원 callback 누락·권한 거부·틀린 frame·임의 인자는 실패한다.
이 동작은 Workspace를 선택/생성하거나 Host 시작·플러그인 설치를 하지 않는다.
소스 창의 실제 관리 작업은 기존 별도 Registry 권한·검토 절차를 따른다.

복구 파일의 초과 크기와 junction 대상 바이트 보존 검사를 보탰다.
안전하지 않은 파일은 읽기에서 Plugin 시작을 차단하고 저장에서 거부한다.
이를 고치려고 사용자 파일·링크 대상을 자동 삭제하거나 권한을 낮추지 않는다.

## 자동 검사 및 앱 관찰

현재 작업 중인 소스에서 실행한 검사이며, 최종 integration tuple의 재검증은 아래에
별도로 기록한다. 예전 설치본 또는 다른 리비전의 출시 자격으로 사용하지 않는다.

- Node 24.22.1 Native 관련 8 test 파일: 100/100, 실패/스킵 0.
- Desktop 전체 직접 `node --test --test-reporter=spec test/*.test.mjs`:
  2,222 total / 2,219 pass / 3 skip / 0 fail. 3 skip은 환경의 Windows 8.3 alias 미지원 검사다.
- `smoke-core-settings-desktop.mjs` fresh 및 `--corrupt-recovery`:
  실제 별도 Electron 창, 비로그인 관리 거부, Workspace bridge 없음, 폰트/두 폭·정상 종료 통과.
- source `smoke-workspace-surfaces-desktop.mjs --native-management`:
  mock Identity와 시험용 준비 Host에서 플러그인 시작 차단·Agent 0 상태로 Sources 창을 열고 닫음.
  그 시점에 Host/Workspace는 시작되지 않았고, 이후 명시적 Workspace 열기/Native 관리가 동작.
  별도 Main 프로세스 재실행에서도 반복 통과. Main 3/3 exit 0, 출력 6개 종료·실패 0,
  정확한 임시 데이터 정리 확인. LAN은 off. 실제 Google·기기 승인·두 PC·전체 자손 종료 증거는 아님.

처음 추가한 Main wiring 검사 1개는 테스트의 arrow-body 추출 오류로 실패한 뒤 고쳤다.
첫 Native 앱 시도는 제목의 entity 표현 차이로 target 대기 실패했다. 같은 시험의 후속
두 시도는 Sources 창에서 돌아올 때 Settings focus 재조회 중 비활성 버튼을 눌러 실패했다.
한 시도는 종료도 강제 fallback을 사용해 자격이 없었다. 정상 결과로 덮어쓰지 않는다.
소스 창은 canonical file URL로 찾고, 명시적 창 닫기/복귀 후 실제 readiness를 기다린다.
그 뒤 동일 시나리오의 2회 프로세스 실행과 자연 종료·정리가 통과했다.

부모는 시험 캡처에서 Core Settings의 Sources 버튼 및 별도 Sources 화면을 직접 확인했다.
임시 캡처는 로컬 무시 파일이며 공개 자산에 포함하지 않는다. 사용자 DEV Main 프로세스와
로그인·설치본·Vault·외부 프로젝트는 시험에 사용하거나 재시작하지 않았다.

## 완료로 보지 않는 부분

- B 전체: Native Workspace별 Plugin 활성화/개별 중단/초기화 등 전체 관리·복구는 아직 남았다.
- C 전체: 여러 창·전용 Plugin 창·헤드리스와 모든 오류 경로는 별도다. 현 작업은 기존 창의 page 프레임 분리다.
- D/E/F: 내구성 있는 send 접수/응답 유실 확인·취소/재시작·분할 대화 저장·실제 Lead AI 검증은 남았다.
- G: OS 파일/Vault/자식 보호와 공통 Preview 자격은 미완료다. API 검사/renderer sandbox만으로 대체하지 않는다.
- SDK 릴리스, 패키징/서명/업데이트/실기기, Production/Identity/권한 자동 승인 또는 merge/tag/release는 수행하지 않았다.

## 최종 통합 증거

- Source runtime `93f6330f365e6e5a8c360e10955dea2c1b2fca3e`, Core runtime
  `71b649ebcc1bef0248873d3f5ec699b11d2c12da`, Host SDK documentation pin
  `18e06800d1c1e75003b7dd12936ebfcab2ef1f7f`.
- Builder acceptance `ba28d43f473df82d82ebab09c972f18f44947cb5`, unchanged runtime
  `87ff7a25a4f393b08cce4f4c54fef80747b4ba01`, dependency SDK `bfd81c...`.
  18e0680은 SDK 문서 후속이며 런타임/API가 바뀐 버전 또는 새 릴리스가 아니다.
- Core UI 마지막 7파일 69/69, `pnpm --filter @paperclipai/ui typecheck` 및 production build 통과.
- Source runtime HEAD에서 Desktop 전체 직접 검사 재실행: 2,222 total / 2,219 pass /
  3 Windows 8.3 관련 skip / 0 fail. runtime 테스트와 설치본 자격을 구분한다.
- 동일 tuple의 Builder `npm run test:core-host` exit 0. 실제 page에서 Core 프레임 없음,
  가로·세로 viewport 채움, 세 Lead 세션·명시적 재확인·A/B 분리·원래 Agent 설정·재시작 유지 통과.
  Common fixture의 update/rollback·UI action/event·Job·capability 거부·UI-less Worker·독립 복구도 통과.
  Main 4/4 exit 0, 출력 8개 종료/실패 0, 정확한 임시 정리 완료. 실제 AI는 미실행.
- 부모가 최종 Lead/System 캡처를 확인해 흰 하단 canvas 제거와 기존 검정 UI를 확인했다.
  Worker/UI entry SHA는 이전 runtime과 동일하며 별도 Builder 기록에 명시했다.
- 현재 production 의존성 정책 감사: advisory 3개, Critical/High 0, Moderate 검토 1개
  (minimatch, 2026-11-07까지), Low 2개. 취약점 0건이라는 의미가 아니다.
  push의 기본 브랜치 Dependabot 경고와 현재 후보 production 감사 범위는 다르며
  개발 의존성 전체 감사와 모든 기본 브랜치 경고 해소는 이 실행에서 주장하지 않는다.

동일 최종 runtime tuple의 Native Sources 앱 재검증도 exit 0:
준비된 시험 Host와 별도 프로세스 재실행에서 독립 Sources 열기/닫기·시작 차단·Agent 0·
Main 관리 허용/일반 renderer 관리 거부·LAN off를 확인했다. Main 3/3 exit 0,
출력 6개 종료/실패 0, 정확한 임시 정리 완료. 실제 기기 승인/두 PC 증거는 아니다.
마지막 docs-only 후속은 아래 runtime 식별자를 바꾸거나 새 시험 결과로 승격하지 않는다.

## C. Plugin page 화면 분리 진행

Core baseline/basic 모드에서 실제 선언된 page contribution을 확인한 Plugin alias와
plugin-id 진입은 호환 Layout 없이 표시한다. Primary 선택 여부를 Extension 권한 등급으로
사용하지 않는다. 기존 Core 설정/기본 경로와 legacy Workplane 모드의 동작은 보존한다.
경로를 새 Primary 기본 경로로 덮어쓰지 않고 query/hash와 Workspace 선택 경계를 유지한다.
조회 실패/캐시 재검증 중에는 이전 Plugin을 열지 않고 Loading 또는 명시적 Retry를 표시한다.

부모 검수에서 Layout과 PluginPage가 같은 query를 각자 마운트하며 재조회/언마운트를
반복할 가능성을 확인했다. Layout이 검증한 동일 Workspace 메타데이터를 Outlet context로
전달해 중복 조회를 피한다. 이는 UI 내부 데이터 재사용이며 서버의 실행/권한 검사를 대체하지 않는다.

첫 실제 앱 시험은 Core 프레임 없이 페이지 제목 placeholder만 보여 실패했다.
기존 Layout의 `usePluginSlots`가 담당하던 module loading이 함께 사라진 것이 원인이었다.
기존 module-loader hook을 실제 선택된 PluginPage에서 사용하도록 옮겨 공통 프레임 의존을 없앴다.
그 뒤 source 앱에서 체크리스트·실제 Builder의 저장/세션/재시작과 정상 종료가 통과했다.
하지만 캡처에서 창 아래 빈 Core canvas가 남아 있음을 확인해 viewport 높이와 페이지
내부 높이를 연결했고, Builder 앱 시험에 가로·세로 채움 검사를 추가했다. 최종 재검증은 별도다.

UI focused 회귀는 7파일 69/69, UI 타입검사/production build를 실행했다.
이후 높이 보정의 마지막 build/앱 시험 상태는 최종 통합 증거에 남긴다.
빌드의 기존 CSS highlight 및 외부 PURE annotation/큰 chunk 경고는 오류 없이 숨기거나
해결됐다고 표시하지 않는다. 실제 AI 전송은 계속 비활성이다.

Luna high는 Native 경로 읽기/보안 검수, 복구 파일 검사와 Core UI 분리를 분담했다.
부모는 변경을 검수하고 실제 앱에서 module-loading/높이 공백을 찾아 보완했다.
Luna 한도 오류 후 남은 범위를 보존하고 재개 요청을 남겼다. 계정/모델을 바꾸거나
실패 요청을 무한 반복하지 않았다.

사용자 요청으로 DEV 창을 계속 유지하고 앞으로 가져왔다. DEV는 독립 로그인 프로필이며
시험 fixture 계정/데이터를 주입하지 않는다. 화면 HMR과 Main/preload 재시작 필요를 구분한다.

## 후속 구현: Native Workspace 제어와 내구 전송

2026-11-02 후속 작업에서는 독립 Settings에 기존 Core execution-control API의
Workspace 목록/조회/일시정지/중단 요청/재개를 연결했다. Main 전용 Host 증명,
현재 계정·Host·Settings frame, 표시된 revision을 재검사한다. 중단은 Native 확인창의
긍정 응답이 필요하고 불명확한 POST는 자동 재시도하지 않는다. 새 실행 서버는 없다.

실제 source Electron Native 시험은 Agent 0/Plugin 시작 차단/LAN off에서 목록·조회·
일시정지·오래된 revision 거부·다른 Workspace 보존·별도 Main 재시작 후 중지 유지·
재개를 통과했다. Main 3/3 exit 0, 출력 6개 종료/실패 0, 정확한 임시 정리가 통과했다.
시험의 중지 상태는 기존 Core API로 준비했으며 Native 중단 확인창을 수락한 증거는 아니다.
fresh 비로그인 Settings도 관리 거부·layout/font·정상 종료를 통과했다.

첫 후속 앱 시도에는 시험 블록의 `path` 변수 shadowing이 있었다. 이를 고친 뒤
상태 조회의 Main Host 증명 누락으로 `canControl: false`가 된 실제 연결 오류도 찾아
고쳤다. 해당 실패를 마지막 성공으로 대체하거나 처음부터 통과한 것으로 기록하지 않는다.

Core에는 Workspace/Plugin/requestId 별 세션 dispatch receipt를 추가하는 중이다.
이 기록은 Plugin이 쓰는 대화 저장과 분리되며 세션 삭제 후에도 중복 방지 tombstone을
유지한다. scheduler가 접수한 뒤 응답만 잃었으면 같은 receipt에서 run을 복구한다.
접수 여부가 불명확하면 자동 재전송하지 않는다. 이는 at-most-once admission이지
provider exactly-once 실행 또는 새로운 OS 격리 증명이 아니다. 새 table은 추가 migration이며
기존 unkeyed send 계약을 대체하지 않는다. 공개 SDK source pin에도 조회 계약을 추가했다.

Builder는 단일 snapshot 대신 turn별 저장·연결 index·bounded page와 현재 실행 상태를
연결하는 중이다. 세 채널의 원본 대화는 분리하고 내부 Lead intake에는 사용자 전송을
허용하지 않는다. 실제 AI, 공유 기억, CTO/Dev/QA, Graph tool, Runner·납품 인수는 아직
완료로 선언하지 않는다. 사용자가 요청한 full v15 완료의 별도 AC-01~118 실행표는
Builder 레포의 `docs/implementation/BUILDER-V15-COMPLETION-PLAN-2026-11-02.md`에 있다.

이 후속의 정확한 revision/검증 수치와 남은 오류는 커밋 이후 최종 기록으로 보완한다.
사용자 DEV와 설치본은 재시작/교체하지 않았다. 새 Main 기능은 재시작 전까지 기존
DEV 프로세스에 적용됐다고 주장하지 않는다.
