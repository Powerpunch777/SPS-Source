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

## 내구 전송과 실제 Lead 답변: 최종 후속 기록

실제 앱 runtime은 Source `c8c6b46f977afac12299d0c9dd33b02bb257f312`, Core
`3abf1f50b9cf69e23397e9b2cc1a0d1a01a2365d`, 공개 SDK
`0111d291a99c032760a391693aa879bb099b5034`, Builder
`b874181c86a6f96fa0ae2922739df172905fb860`이다. 시험한 Builder 변경을 그대로
커밋했다. 이후 증거 문서와 reference/external 시험 범위를 구분한 로그 문구 보정은
새 제품 runtime 시험을 뜻하지 않는다. SDK는 source pin이며 새 버전/태그를 배포하지 않았다.

Core의 추가 migration `0178_elite_banshee`는 Workspace/Plugin/requestId receipt를
Plugin KV와 별도로 보관한다. 세션 close/delete 후에도 중복 방지 tombstone을 남기며,
Workspace 삭제 생명주기에서는 함께 제거한다. 기존 unkeyed send는 유지한다.
Core 표적 세션/receipt/context 검사 3파일 89/89, 30개 workspace 타입검사와 내부 SDK
build를 통과했다. 공개 SDK 전체 191/191, Builder `npm run check` 87/87과 SDK
validate/test를 통과했다. 대화는 turn/index/bounded page에 저장하고 현재 snapshot을
키우지 않는다. 결과 누락/실패/불명확/취소·종료 대기를 구분하며 내부 CTO intake는
사용자 전송을 거부한다. 이는 공유 Lead 기억이나 전체 v15 업무 실행 완료가 아니다.

Source exact runtime의 전체 Desktop 직접 검사: 2,236 total / 2,233 pass /
3 Windows 8.3 관련 skip / 0 fail. Windows helper까지 Node 24.22.1을 쓰도록 PATH도
고정했다. 앞선 명시 Node24 실행은 nested helper가 system Node26.4를 선택해 종료
오류를 낸 시도가 있었으므로 Node24 회귀라고 단정하지 않는다. tuple/doc staging 중의
중간 baseline 실패도 최종 성공과 구분한다.

GitHub Verify SPS runs `41377634089`, `41377639902`의 같은 Source HEAD에서
Core Linux 9개 shard와 전체 타입검사/build가 실제 실행되어 성공했다. 예전의
결제 차단 상태를 현재 CI 상태로 재사용하지 않는다. Desktop/Node 설치·패키징 job의
전체 완료 여부는 별도로 확인하며 위 성공이 대신하지 않는다. Core optional review bot은
`COMMITPERCLIP_KEY` 미설정으로 실패했으며 독립 리뷰가 수행됐다는 뜻이 아니다.

사용자가 현재 기본 Codex CLI 계정 사용을 승인한 뒤, 별도 임시 Agent/지침/작업 폴더에서
짧고 비밀 없는 대화만 시험했다. 설치본·로그인·사용자 DEV를 교체하지 않았고 코드 생성/
실행을 요청하지 않았다. 기존 CLI adapter의 임시 managed home과 기본 인증 연결을
재사용했으며 사용자 인증 파일을 공개 레포로 복사하지 않았다.

최종 source 앱 시험은 실제 UI 전송 → Core run → CLI/provider 성공 → 저장된 답변 →
assistant 전용 말풍선 → Main/Host 재시작 후 같은 turn/run/session/답변 유지를 통과했다.
같은 요청 ID/내용 재확인 뒤 실제 Agent run은 1개다. 짧은 CLI 전체 출력의 item은
assistant/reasoning만 있었고 시험 작업 폴더는 비어 있었다. 새 default no-AI 시험은 실제
계정을 쓰지 않으며 live 모드는 명시 opt-in으로 분리했다. reference checklist의 no-AI
문구는 external live operator를 포함하지 않도록 정정했다.

최종 통합 시험 exit 0, Main 5/5 exit 0, 출력 10개 종료/실패 0, 정확한 임시 데이터
정리 완료. 부모가 실제 답변과 재시작 후의 두 캡처를 확인했다. 캡처·raw 로그와
계정/컴퓨터 식별자는 공개 Builder 레포/증거에 포함하지 않는다. 이는 전체 자식 OS 보호,
패키징/서명/업데이트·실기기/Stable 증거가 아니다.

실패 기록: 첫 live fixture의 폐기된 promptTemplate 설정은 422로 거부돼 지원되는
managed AGENTS.md 계약으로 고쳤다. 다음 시도는 뒤로 간 창의 자동 관찰에 의존해
최종 상태를 확인하지 못하고 timeout됐다. 이후 같은 run만 명시 조회하도록 보완했다.
중간 성공 시도에서 넓은 transcript 문자열 검사가 사용자 질문 속 token도 맞출 수 있음을
부모 캡처 검수로 찾았다. assistant 전용 정확한 값과 명시적 UI 새로고침을 요구한 최종
재실행/캡처만 화면 성공 증거로 삼는다. 이전 시도를 처음부터 통과한 것으로 바꾸지 않는다.

남음: 실제 CLI 취소와 종료 확인의 앱 시험, Native 전체 Plugin 관리/중단 확인창 수락,
공유 Lead 기억과 v15 Graph/CTO/Dev/QA/Runner/납품, OS 보호/Preview 및 출시 자격.
사용자 DEV는 기존 프로세스로 보존했다. 새 backend/migration/capability는 그 DEV의
재시작·검토 전 자동 반영/승인됐다고 주장하지 않는다. 장기목표와 full v15는 아직 미완료다.

## 실제 Windows CI 실패 후속

위 두 CI run의 Linux 검사는 성공했지만 Windows Desktop job은 pinned historical schema
시험의 `20 !== 19`에서 실패했다. 새 receipt migration이 추가된 뒤 시험이 옛 개수를
상수로 기대한 것이 원인이다. 뒤의 installer-input artifact 부재는 이 선행 job이 설치본
생성 전 끝난 데 따른 후속 실패다. 이를 결제 차단이나 전체 CI 성공으로 기록하지 않는다.

historical prefix의 SQL/journal pin은 그대로 유지했다. 현재 journal의 검증된 추가 파일명
목록과 실제 pending 목록을 정확히 비교하고, 적용된 history 개수와 새 receipt table도
확인하도록 바꿨다. 단순히 예상 숫자를 20으로 늘리거나 검사를 제거하지 않았다. 잘못된/
중복 suffix 이름 거부 회귀를 추가했다. 관련 10/10 검사를 통과했다.

별도 임시 PostgreSQL에서 실제 `node scripts/smoke-historical-core-migration.mjs` exit 0:
기존 157개 + 현재 20개 migration, 양 Workspace와 인증/Plugin 상태의 12개 fixture 행,
JavaScript 백업/빈 DB 복원/같은 최신 schema로 업그레이드/재적용 무변경/정확한 정리를
확인했다. 역사적 앱 실행·사용자 설치 DB·서명/물리 기기 qualification은 아니다.
Hosted Windows의 전체 후속 게이트는 수정 커밋으로 다시 실행되어야 한다.

독립 실제 앱 시험과 더불어 reference/external 관측 문구 보정의 관련 Desktop 검사도
32/32 통과했다. 현재 사용자 DEV 창은 트레이 상태에서 다시 표시했으며 같은 Main
프로세스를 유지했다. Native/Core backend 재시작이나 새 권한 자동 승인은 하지 않았다.

이 CI 보정 후 Node24/PATH24의 Desktop 전체 직접 검사도 다시 통과했다:
2,237 total / 2,234 pass / 3 Windows 8.3 skip / 0 fail. 앞선 2,236개 검사의
결과를 새 테스트 개수로 바꿔 쓰지 않고 별도 실행으로 기록한다.

## 실제 CLI 중단 후속

Source `a69f68cb515478b1cf22f0719fe4f5adbd784630`, Core/SDK는 위 최종 tuple과 같고,
Builder operator는 시험한 변경 그대로 커밋한 `9fdb553c9d8d296391cd789153c34ae3c4703f57`이다.
Builder Worker/UI/manifest bytes는 b874181과 같다. 별도 live-cancel opt-in으로 앞선 실제
답변·assistant 말풍선·중복 없음·재시작 유지를 다시 확인한 뒤 짧은 메시지 하나를 더 보냈다.
실제 Core run이 running이고 관리 CLI PID가 살아 있음을 확인한 후 Builder UI 중단 버튼을
눌렀다. 같은 turn/run이 cancelled/termination confirmed가 되고 관찰한 PID가 종료됐다.
재시작 뒤에도 취소 상태가 유지됐고 해당 Agent run은 명시 요청한 2개뿐이었다.

통합 source 앱 exit 0, Main 6/6 exit 0, 출력 12개 종료/실패 0, 정확한 임시 정리 완료.
시험 작업 폴더는 계속 비어 있었고 설치/로그인/사용자 DEV를 변경하지 않았다. operator
커밋에서 Builder check 87/87과 typecheck/build/SDK validate/test도 다시 통과했다.
이는 전체 자식 OS 격리·하드웨어 기기 증명·패키징/서명/물리 증거가 아니다. 취소 기록은
재시작한 실제 transcript에서 검사했고 캡처의 아래 viewport 밖 부분까지 모두 동시에
보였다고 주장하지 않는다. SDK/일반 Core에 Builder의 업무 역할을 넣지 않았다.

따라서 앞선 기록의 실제 CLI 중단 미검증 항목은 이 후속으로 해소됐다. 전체 Native 관리,
공유 Lead 기억/Graph authoring/CTO/Dev/QA/Runner/납품·OS 보호/Preview·출시 조건과
현재 DEV의 재시작/새 권한 검토는 여전히 별도다. 사용자에게 DEV 변경 여부를 질문했고
응답 전에는 기존 Main/데이터를 그대로 유지한다.

## LAN 보류 재확인 및 기존 Preview 차단 경로

사용자가 Native 보류를 재확인했다. Tailscale 대체 자체 LAN 개발은 재개하지 않는다.
독립 Core 설정창과 혼동한 표현을 고쳤고, 개별 Plugin 관리 UI의 추가 확장도 진행하지
않는다. 이번 후속은 이미 있는 개발 실행의 미지원 보호 경로와 CI 오류 진단을 점검했다.

Runtime `9c3230116dd80e8fdda401f8cfb5353406f2c375`, Core/SDK는 직전 pin과 같다.
기존 Preview의 separate data/Job/renderer sandbox는 OS containment가 아님을 확인했다.
Main의 gates/apply/rollback/UIreload/Workerrestart 5곳에서 실행 모드 미지정/보호 모드는
실행 전에 거부한다. 기존 로컬 코드는 UI에서 매번 위험을 확인한 trusted-local로만
선택하며 저장된 신뢰나 package 제공 모드를 재사용하지 않는다. 추가 capability나
임의 API/Host 경로는 없다. 이것은 로컬 신뢰 선택이지 악성 OS 사용자로부터의 보호가 아니다.

부모 Node24/PATH24 집중33/33, Desktop 전체2244total/2241pass/3skip/0fail, 실제 source
Electron Preview 시험 exit0. 다섯 메서드의 미지정/보호 모드 10개 요청이 Preview를
시작하지 않는 것을 확인하고 고정된 신뢰 SDK fixture만 explicit trusted-local로 실행했다.
실제 UI 경고의 확인/취소는 renderer harness이며 앱 시험이 모든 확인창을 실제 클릭했다는
주장은 하지 않는다. 실제 Google/CLI 계정·고객 코드 실행 없이 격리 mock Identity로
Preview 재기동/오류/종료와 임시 PG/데이터 정리를 확인했다. DEV Main48300은 유지했다.

별도 push CI41380873481은 구형 복구 확인창 component 시험에서 실패했고, 안전하게
넘겨진 modalStep/interactive 진단을 바깥 test가 버리고 있었다. 4252247은 허용된
enum/boolean만 보존하고 raw 로그/경로/비밀값을 숨긴다. 원래 deadline/성공/정리 조건은
바꾸지 않았다. 같은 조건의 부모 Node24 실제 probe4/4는 통과했으나 hosted 실패의
근본 원인이 해결됐다고 단정하지 않는다. 같은 HEAD PR41380878666의 결과와 구분한다.

상세 근거는 [실행 진입 검증](../reviews/DEVELOPER-EXECUTION-ADMISSION-2026-11-02.md),
현재 A–G 전체 판정은 [완료 감사](BUILDER-PREREQUISITES-COMPLETION-AUDIT-2026-11-02.md)다.
그 외 실행 경로의 보호 검증과 독립 관리 잔여 범위 때문에 장기목표 전체는 미완료다.

## 최신 범위 재확인 및 Core 복원 회귀

사용자가 Preview도 진행하지 않기로 했음을 재확인했다. 위 Preview 구현·시험은 앞선
작업의 사실 기록이며 현재 요구나 완료 조건으로 삼지 않는다. Preview 개발·추가 시험과
자체 Native LAN은 보류한다. Tailscale과 현재 사용자 DEV는 보존한다. 독립 Settings는
LAN이 아니다. 현재는 Core의 기존 복구와 공개 SDK·실제 Lead 연결에 집중한다.

완료된 PR run41380878666(Source db9dd6e)은 전체 성공이 아니다. Windows의 역사 schema
upgrade는 성공했지만 다음 Main restore 시험에 남은 `177 !== 176` 고정 개수 검사가
실패했다. Core Linux server1/3은 watchdog 첫 사례의 5초 timeout으로 실패했고,
installer recovery는 앞 단계 실패로 생성되지 않은 입력 artifact를 찾다 실패했다.
다른 8개 Core shard와 전체 Linux typecheck/build 성공을 이 실패들의 대체 증거로 쓰지 않는다.

Main restore 검사는 검증된 역사 journal prefix와 현재 suffix에서 실제 파일 목록을
구해 Core `inspectMigrations`의 available/applied 목록과 정확히 비교하도록 고쳤다.
현재 receipt table도 확인한다. 별도 in-place migration 시험도 기존 history prefix와
현재 SQL 내용 해시 집합을 대조하며 고정 176과 결과 숫자를 제거했다. DB migration이나
사용자 DB는 변경하지 않았다.

Node24/PATH24 관련 4개 파일의 집중 검사17/17, Main restore script 문법 검사를 통과했다.
실제 `node scripts/smoke-owner-vault-transfer-desktop.mjs --historical-core-backup`은 exit0:
핀 고정157개 schema 백업 → 빈 시험 Host 실제 Main 복원 → 현재177개 이력·두 Workspace
project 및 첨부파일 → Main 재시작 후 동일 이력·데이터 유지 → 관리 출력/임시 데이터 정리.
mock Identity와 source Electron 시험이며 설치본/실제 Google/물리 두 PC/서명·전체 자손
OS Job 자격을 뜻하지 않는다. 실제 사용자 DEV PID48300은 재시작하지 않았다.

같은 로컬 변경의 `SPS_DESKTOP_E2E_SOURCE=1 node scripts/smoke-historical-managed-vault-desktop.mjs`
도 exit0이었다. 과거157개 schema와 v11 상태를 같은 시험 프로필에서 현재177개/v13으로
실제 Main이 올렸고, 재시작 뒤 데이터·DPAPI 계정 저장값·서명 키 보존과 정리를 확인했다.
이는 source 시험이며 설치본/정상 사용자 프로필/서명/실기기 자격이 아니다.
관련 변경은 로컬 `18e6bb87538daa7ed52b1c2306f8d7dc54f75957`에 커밋했고 아직 push하지 않았다.

## 사용자 요청으로 중단 및 범위 확정

사용자가 목표를 잠시 멈추고 할 일과 하지 않을 일을 먼저 정리하도록 요청했다.
목표는 paused이며, 이후 동의는 문서 정리 승인이지 구현 재개가 아니다.
[현재 작업 범위](CURRENT-WORK-SCOPE-2026-11-02.md)를 현행 요약으로 사용한다.
자체 LAN과 Preview 개발·추가 시험은 보류한다. 독립 설정·복구의 Core 필수 범위는
보류 대상과 구분해 잔여로 유지한다. 앞선 관리 UI 추가 확장 중단 표현으로 이 필수
범위를 제외하지 않는다. 이번 문서 정리 중 코드·시험·빌드·DEV·설치본·push는 변경하지 않는다.

하위 에이전트의 별도 Linux 진단 실행은 중단됐고 남은 세션은 없다는 보고를 받았다.
초기화 출력이 없었으므로 임시 DB 정리 완료까지 입증된 것은 아니다. 후속 재개 시
그 시험의 소유권/종료 근거를 확인하며 임의 인수·삭제하지 않는다.

사용자가 Marketplace도 보류라고 추가 확정했다. 유통만 후속이라는 뜻으로 축소하지
않고 관련 개발·추가 시험을 보류한다. Builder 업무·기능·UI는 별도
SPS-MY-PluginBuilder 레포의 v15/UI v9와 최신 UI 적용 기준을 따르며 Core 문서에서
다시 설계하지 않는다. 최신 보류 결정은 이전 설계의 관련 작업보다 우선한다.
장기목표는 계속 paused이며 이번 반영은 문서 정리뿐이다.

## 첫 목표를 Builder 완성으로 변경

사용자가 후속으로 첫 목표를 Builder 완성으로 바꾸고 필요한 안전 기반부터 진행하도록
지시했다. [Builder 우선 계획](BUILDER-FIRST-IMPLEMENTATION-PLAN-2026-11-02.md)을
현재 실행 범위로 적용한다. Marketplace·Preview·자체 LAN 보류는 유지한다.
목표 도구는 기존 미완료 목표를 수정·교체할 수 없어 새 등록을 거부했다. 이전 목표를
허위 완료 처리하지 않았고 앱에서 해제가 필요하다고 알렸다. 실제 작업 목표와 도구의
paused 표시는 구분한다.

Core d7d5a5a에 일반 단일 키 조건부 저장 내부 기반과 실제 PostgreSQL 경쟁 검사6개를
추가했다. 처음 JSON null 실패를 수정한 뒤 최종6/6와 server 타입 검사가 통과했다.
공개 SDK/Builder에 아직 연결하지 않았으며, 권한 회수·다중 키·실제 앱 검증으로 확대하지
않는다. Builder93991dc는 v15 전체 목표와 보류 항목을 문서로 정리했다. 사용자 DEV와
설치본·계정·실제 데이터는 변경하지 않았다.

사용자가 이전 목표를 해제했다고 응답한 뒤 `get_goal`에서 목표가 없음을 확인했다.
새 Builder 완성 목표를 등록한 결과 active가 반환됐다. 위 도구 제한/paused 표시는
이전 시점의 기록이며 현재는 해소됐다. Marketplace·Preview·자체 LAN 보류, 필요한
안전 기반 우선, v15/UI v9 준수와 Core 업무 중립을 새 목표에도 명시했다.

## 조건부 상태 저장과 Builder 수용 증거

Core 조건부 저장과 격리된 Builder 검사의 범위 및 한계는
[별도 증거 기록](BUILDER-CONDITIONAL-STATE-EVIDENCE-2026-11-02.md)에 남겼다.
Core/internal SDK 109/109, 공개 SDK 선택 검사 63/63, Builder 89/89 및 실제 source
Desktop/Owner Host 수용 시험 exit 0이다. 공개 SDK 수치는 전체 suite를 뜻하지 않고,
source 앱 증거도 AI 실행·설치본·실기기·출시 자격이 아니다. Builder 전체 목표는 계속 미완료다.

## Workspace 도구 호출과 명세 데이터 검증

Core `32a3f9f`, 공개 SDK `316c56f`, Builder `7f04887`의 후속 범위·명령·한계는
[도구 호출 경계 기록](BUILDER-TOOL-INVOCATION-EVIDENCE-2026-11-02.md)에 남겼다.
Core 집중185/185(새 Express17개, 실제 자식 프로세스 사례 포함), 타입 검사, 공개 SDK
선택44/44가 통과했다. Builder는 순수 명세 검증을 추가하고 새 격리 빌드122/122 및
CLI 검사를 통과했다. Builder의 실제 Lead 역할과 Graph 작성 도구는 아직 미연결이며
전체 목표는 active·미완료다. 보류 범위와 기존 DEV·설치본·계정·데이터 보존은 유지한다.

후속 Builder `f4cb7a3`의 Lead 전용 Solution 조회 도구와 실제 source 앱 시험도
[같은 기록의 후속 절](BUILDER-TOOL-INVOCATION-EVIDENCE-2026-11-02.md)에 남겼다.
실제 앱에서 선언 등록·사용자 사칭403을 확인했고 기존 UI/재시작 시험은 유지됐다.
추가 Worker JSONL 검사를 포함한 새 격리 빌드130/130이 통과했다. 실제 AI의 도구 호출이나
Graph 작성 완료는 아니며, 보류 기능·사용자 DEV 자동 교체 없이 다음 작성 연결로 진행한다.

## Lead 설계 초안 저장과 화면 표시

Builder `0feab9a`는 실제 사용자 입력 ID 조회와 Lead 전용 설계 초안 작성/조회 도구,
불변 초안 저장, 읽기 전용 Graph·문서·질문 표시를 추가했다.
[별도 근거](BUILDER-DESIGN-DRAFT-EVIDENCE-2026-11-02.md)에 명령·해시·한계를 기록했다.
격리 빌드 전체159/159, 타입/SDK CLI와 실제 source 앱 시험이 통과했다. 실제 앱의 초안은
DTO 표시 fixture이며 실제 AI 호출·Host 초안 저장의 증거가 아니다. 현재 Lead 변경 시
기존 초안은 보존하지만 자동 인계하지 않으며, 전체 Builder 목표는 active·미완료다.

## 실제 Lead 도구 실행과 재시작 후 초안 보존

Builder `12ba623`과 Source 시험 연산자 `3c1eb21`에서 사용자가 허용한 임시 실계정
시험을 진행했다. 전체160/160, 타입/빌드/SDK CLI와 실제 source 앱 시험이 통과했다.
실제 Codex Lead의 source 읽기·초안 읽기·제안1회·다시 읽기와 실제 Host 저장,
재시작 후 동일 초안·대화, 다른 Workspace 불변을 확인했다.
[별도 기록](BUILDER-LIVE-DESIGN-EVIDENCE-2026-11-02.md)에 실패한 첫 시험, 시험용
MCP 승인 설정, 정확한 해시·한계를 구분했다. Identity는 mock이고 실제 Google OAuth나
설치본/두 PC 검증은 아니다. 일반 도구 승인 UX와 최신 답변 자동 스크롤도 남아 있다.
보류 기능을 되살리거나 전체 Builder 완료로 축소하지 않고 목표는 active로 유지한다.

후속 Builder `dcaecb3`은 최근 답변 자동 이동과 과거 기록 독자의 위치 유지, 직접 이동
버튼을 추가했다. 전체163/163·타입/빌드·SDK CLI 및 no-AI source 앱의 긴 대화 표시
fixture 검사가 통과했다. 실제 AI 저장 시험과는 별도의 UI bytes/근거이며 같은 시험으로
합치지 않는다. 원본 기록은 위 실제 Lead 검증 문서의 후속 절에 덧붙였다.

## Lead 프로젝트 공유 기억과 재개 연결

Builder `53d5c33`에 프로젝트별 구조화 기억과 읽기/갱신 도구, 기존 문서 화면 표시를
추가했다. 전체181/181·타입/빌드·SDK CLI가 통과했다. 실제 main→decisions→main 재개의
3회 실행에서 쓰기1·1·0, 재시작 후 기억과 서로 다른 대화 기록 보존을 확인했다.
세 번째 내부 CTO 수신 채널은 자동 검사만 통과했으며 실제 입력 경로는 아직 미연결이다.

실제 재개에서 발견한 MCP 옵션 배치 문제는 Core `55b5d5b`에서 고쳤고 집중16/16과
어댑터 타입 검사가 통과했다. [전체 근거](BUILDER-SHARED-MEMORY-EVIDENCE-2026-11-02.md)에
실패/성공 시험, 허용 범위·해시·한계를 기록했다. 전체 Core나 Builder 완료로 확대하지 않고
질문 답변→명세/Graph Revision과 CTO intake를 계속 연결한다.

## 질문 답변과 새 설계 Revision

Builder `0ec7b5e`는 실제 질문에 연결된 사용자 답변을 decisions Lead가 해석해 새 초안·
명세·Graph와 함께 저장하는 도구와 화면을 연결했다. 전체202/202·타입/빌드·SDK CLI,
실제 UI/AI 두 실행과 재시작 보존, 후속 UI-only no-AI 앱 검사를 구분해 통과했다.
[정확한 근거와 한계](BUILDER-QUESTION-REVISION-EVIDENCE-2026-11-02.md)를 남겼다.
공유 기억/CTO 전파·승인 명세·실제 제작/QA·납품과 전체 v15는 계속 미완료다.
사용자 DEV는 자동 교체하지 않았고 Core/SDK API나 DB migration은 추가하지 않았다.

## 프로젝트 CTO 등록과 독립 세션

Builder `8e9ee89`의 CTO 역할·키 기반 독립 세션·조회 도구와 조직도 표시를 추가했다.
실제 Lead가 CTO2명을 등록하고 같은 ID 재등록·세션5개·CTO 실행0·재시작 보존을 확인했다.
전체225/225·타입/빌드·SDK CLI와 Source guard48개 거부 사례가 통과했다.
[정확한 근거](BUILDER-PROJECT-CTO-EVIDENCE-2026-11-02.md)에 범위와 한계를 남겼다.
Workstream 배정·CTO 질문 intake·Worker/QA와 전체 v15는 계속 미완료다.

## 내부 설계 기준

사용자 입력에 대한 Lead 해석과 현재 초안의 명세/Graph를 불변 기준으로 연결했다.
전체245/245·타입/빌드·SDK CLI, no-AI 앱 표시, Source operator2/2를 확인했다.
[검증 범위와 동시 권한 변경 한계](BUILDER-DESIGN-BASELINE-EVIDENCE-2026-11-02.md)를
분리해 남겼다. 실제 기준 저장 계정 시험은 아직 실행하지 않았고 이 기록은 실행 승인이
아니다. 기술 선정/Workstream·CTO 업무·Worker/QA·납품과 전체 v15 완료는 남아 있다.
