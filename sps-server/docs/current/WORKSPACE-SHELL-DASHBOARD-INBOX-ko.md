# SPS Workspace Shell, Dashboard, Inbox 설계

상태: 2026-10-25 목표 정렬; 전체 목표 구현 미완료
최종 갱신: 2026-10-25

## 목적

SPS Core는 특정 업무 방식, 조직 구조 또는 공통 Workspace UI를 강제하지 않는다.
Shell, Dashboard, Inbox는 이미 존재하는 API와 데이터를 위한 선택적 호환 표면이며,
각 플러그인은 공통 화면에 기여하지 않고도 독립적인 UI나 headless 기능을 제공할
수 있다. 이 문서는 2026-10-25 목표를 정의하며 현행 구현 완료를 뜻하지 않는다.

이 문서는 세 가지 기존 호환 표면을 정의한다.

- **Workspace Shell**: Workspace 진입점, 주요 탐색 구조, Shell 선택과 복구 경로
- **Dashboard**: Core 상태와 플러그인 현황을 한 화면에서 보는 그리드
- **Inbox**: 여러 플러그인의 보고와 알림을 사용자별로 수신하고 처리하는 공통 수신함

Dashboard와 Inbox를 사용하는 경우 Paperclip에서 검증된 **레이아웃, 목록, 검색,
키보드 조작, 반응형 UX primitive**를 재사용할 수 있다. 그러나 Paperclip의 Task,
Agent, Approval, Room 도메인 의미와 데이터 계약은 재사용하지 않는다.

현행 동작과 미구현 간극은 [Core/Plugin 현행 감사](../reviews/CORE_PLUGIN_ARCH_GAP_AUDIT.md),
단계 및 검증 게이트는 [이전 계획](../reviews/CORE_PLUGIN_ARCH_MIGRATION_PLAN.md)을
따른다.

## 확정 원칙

1. Primary, Agent, Extension이 모두 0개인 Workspace는 유효하다.
2. Core는 공통 Workspace Shell, Dashboard 또는 Inbox UI 사용을 강제하지 않는다.
3. Plugin UI 밖 Native 관리/복구 경로가 독립적으로 동작해야 한다. 기존 공통 UI를
   제거하기 전에 Plugin 코드 미로딩 및 UI 실패 상황에서 이를 검증해야 한다.
4. Primary는 기본 진입 Shell의 선택적 지정이며 Workspace마다 0개 또는 최대 1개다.
   이는 권한 등급이 아니다.
5. Extension은 여러 개 활성화할 수 있고 UI 제공 여부, 전용 창, 전체 화면,
   headless 동작을 제한하지 않는다.
6. 기존 Shell/Dashboard/Inbox API와 데이터는 선택적 호환 경로로 유지한다. 새 목표를
   이유로 삭제하거나 강제 마이그레이션하지 않는다.
7. Plugin은 업무 의미, 데이터, 행동과 업무별 권한 판단을 소유한다. UI 분류는
   capability 권한을 바꾸지 않는다.
8. 공통 표면을 사용하는 경우에도 표시 여부만으로 권한을 부여하지 않고 실행 때
   Plugin 및 Core 계약을 다시 검증한다.

## 용어

### Workspace

한 팀 또는 회사 안에서 독립적으로 운영되는 작업 단위다. 기존 Shell 선택,
Dashboard 배치, Inbox 사용자 상태는 해당 호환 표면을 사용하는 경우 Workspace
범위로 분리된다.

### Neutral Core Shell

현행 D2 소스 단계에서 SPS baseline의 Workspace 루트는 선택된 사용 가능한 Shell이
없으면 별도의 빈 진입 화면을 표시한다. 공통 Sidebar/Breadcrumb, Dashboard/Inbox,
Agent 목록을 그 진입 화면에 넣지 않으며 Agent/위젯/Plugin UI 모듈도 조회·로드하지
않는다. 플러그인 관리 링크는 사용자가 명시적으로 여는 선택 경로다. 선택/Workspace
조회 실패는 빈 성공으로 취급하지 않고 일반 오류와 수동 재시도로 구분한다.

기존에 선택된 Shell의 기본 경로 및 기본 번들 정책은 유지한다. 해당 Plugin 페이지와
명시적 `/dashboard`, `/inbox`, Agent/설정 deep link는 아직 기존 공통 Shell을
사용한다. 전체 화면 Plugin 표현/Primary-Extension manifest 전환은 미구현이며,
이번 단계가 모든 Plugin 페이지의 공통 메뉴를 제거한 것은 아니다.

기존 호환 UI에서 선택하거나 fallback으로 사용할 수 있는 Core Shell이다. 제품 전체의
필수 시작 화면은 아니다. 해당 Shell을 사용하는 경우 다음 상황에서 적합하다.

- Workspace에 Shell Provider가 선택되지 않은 경우
- 선택된 Provider가 비활성화, 제거 또는 호환 불가 상태인 경우
- Provider 렌더링 또는 초기화가 실패한 경우
- Safe mode 또는 복구 경로로 진입한 경우

기존 Neutral Core Shell은 Dashboard, Inbox, 활성 플러그인 작업 페이지 및 관리
링크를 제공할 수 있다. 보안과 복구를 이 화면의 존속에 의존해서는 안 된다.

### Workspace Shell Provider

Workspace별로 최대 하나 선택할 수 있는 Primary 지정이다. 기본 진입 UI를 제공할
수 있으나, 이 지정만으로 다른 플러그인의 데이터나 권한을 소유하지 않는다.
Primary로 선택되지 않은 Extension도 동등한 UI 및 일반 SDK capability 자유를 가진다.

### Dashboard Widget

플러그인이 Dashboard 그리드에 기여하는 독립 UI 단위다. 위젯 하나의 오류는 다른 위젯, Dashboard 전체, 복구 메뉴를 막지 않는다.

### Inbox Item

플러그인이 발행하는 업무 중립적 알림 또는 보고의 요약 envelope다. 원본 업무 기록은 해당 플러그인이 소유한다.

## Core와 Plugin의 경계

| 영역 | Core가 소유 | Plugin이 소유 |
| --- | --- | --- |
| Shell | 기존 Provider API와 Workspace 저장값의 호환 | Primary로 선택된 Plugin의 기본 진입 UI; Primary 미선택도 허용 |
| Dashboard | 기존 그리드/위젯 호환 계약 (사용하는 경우) | 위젯 내용, 업무 상태 해석, 조회와 이동 행동 |
| Inbox | 기존 envelope/read/archive/action 계약 (사용하는 경우) | 보고 생성 기준, 업무 의미, 원본 데이터, action의 업무 권한 판단 |
| Navigation | 독립 Native 관리/복구 경로; 기존 공통 내비게이션은 선택 사항 | Plugin 자체 작업 UI, 창, 탐색 및 제안 |
| 데이터 | Workspace 표면 상태와 공통 envelope | 업무 문서, Task, Agent, Approval, Room 등 각 플러그인 고유 데이터 |
| 실패 처리 | 플러그인 격리, fallback, 진단 | 오류 설명, 재시도 또는 복구 행동의 업무 의미 |

## Native Capability 계약

다음 capability는 SPS Core가 제공하는 표준 계약이다.

- `ui.workspaceShell.provide`
- `ui.dashboard.contribute`
- `inbox.items.publish`
- `inbox.items.update`
- `inbox.actions.register`

플러그인은 manifest에서 필요한 capability와 선언을 함께 제출한다. 기존 표면 API는
호환을 위해 유지한다. 설치 또는 활성화 이후에도 Core는 실제 호출 시점에
capability, 활성 상태, Workspace 문맥을 검증한다. 이 계약을 사용하지 않아도
Plugin의 일반 UI나 기능은 유효하다.

`ui.workspaceShell.provide`를 가진 플러그인이 활성화되어도 Primary로 자동 선택하지
않는다. 기존 API를 사용하는 경우 Workspace별 명시 선택을 유지한다. 신규 목표의
선택 상태는 없을 수도 있으며, 이 API가 모든 Plugin UI를 제한하지 않는다.

## Workspace Shell 설계

### 선택과 fallback

- Workspace마다 Primary는 0개 또는 최대 하나다.
- Primary 선택은 기본 진입 화면만 지정하며 다른 Plugin의 UI를 제한하지 않는다.
- Primary 미선택은 정상 상태다. 자동 설치, 활성화, 자동 전환은 하지 않는다.
- Provider의 활성화, 비활성화, 설치, 업데이트, 제거는 선택 상태를 자동 변경하지 않는다.
- 기존 Shell 계약에서 선택된 Provider를 사용할 수 없으면 해당 호환 화면은 Neutral
  Core Shell로 fallback할 수 있다. 이것은 독립 Native 복구의 대체물이 아니다.
- 같은 Host라도 Workspace마다 다른 Provider를 선택할 수 있다.

### Provider가 제안할 수 있는 것

- 기본 진입 경로
- Dashboard와 Inbox의 탐색 노출 방식
- 플러그인 작업 페이지의 그룹, 순서, 표시 이름
- Dashboard 위젯의 기본 배치 preset
- 빈 Workspace에서 보일 시작 행동

### Provider가 할 수 없는 것

아래는 목표 계약이지 현재 renderer 권한 분리가 구현되었다는 증거가 아니다.
현행 Plugin UI는 Core renderer와 같은 JavaScript world에 로드되며, 별도
보안 검증은 [현행 감사](../reviews/CORE_PLUGIN_ARCH_GAP_AUDIT.md)를 따른다.

- Core API 권한이나 Core 기능을 직접 변경하기
- 신뢰된 Native 관리/복구 진입을 가로채거나 권한 검사를 우회하기
- 다른 플러그인의 capability 우회 또는 데이터 직접 변경
- Core DOM을 직접 수정하거나 전역 CSS로 Core를 덮어쓰기
- Core 경로를 같은 이름으로 가로채기

### Native 독립 복구 선행 조건

Core 관리/복구는 Plugin UI 밖의 Native system UI에서 접근할 수 있어야 하며,
Plugin 코드를 로드하지 않고 동작해야 한다. 후보는 tray, 시스템 단축키, 독립
설정창이다. 이 조건은 목표이자 기존 공통 Shell UI 제거의 선행 조건이며, 현재
완료된 기능으로 간주하지 않는다. Core/Host 시작 실패, Workspace 창 부재,
Plugin UI hang/crash에서도 진입·진단·복구가 가능한지 검증해야 한다.

Dashboard와 Inbox는 Native 복구 기능이 아니며, Plugin이 해당 항목을 UI에서
제공하지 않아도 된다. 기존 Shell을 사용하는 동안 API/data 호환은 유지한다.

## Optional Dashboard Compatibility Surface

### Core 책임

Dashboard surface를 제공하는 경우 Core는 다음 기술 계약을 책임진다.

- 반응형 그리드와 위젯 크기 규칙
- Workspace 및 사용자 범위의 배치 저장
- 위젯 등록, 로드, 갱신, 제거 생명주기
- 위젯 단위 loading, empty, error 상태
- 위젯 단위 오류 경계와 장애 격리
- Server, Desktop, Node, Runtime, Source, Plugin 상태 중 Core가 직접 관찰 가능한 주의 항목

기존 Dashboard의 Core 상태 표시는 선택적으로 유지할 수 있다. 독립 복구 접근을
Dashboard의 고정 영역에 의존시키지 않는다.

### Plugin 위젯 책임

플러그인 위젯은 자신의 업무 정보를 표현한다. 예시는 다음과 같다.

- Team Workplane: 진행 중인 작업, 보고 대기, Worker 상태
- Game Development: 빌드 결과, 에셋 검수, 플레이테스트 상태
- Web Development: 배포 상태, 테스트 실패, 검토 대기 변경
- Memory Provider: 저장소 상태, 요약 또는 compact 필요 신호

각 위젯 선언은 최소한 안정적인 widget ID, 표시 이름, 지원 크기, 기본 순서, 빈 상태와 오류 상태 표현을 포함해야 한다. 위젯의 데이터 형식과 업무 해석은 해당 플러그인의 책임이다.

### 사용자 배치

- Shell Provider는 최초 사용 시 적용할 기본 preset만 제안한다.
- 이후 배치, 순서, 크기, 접힘 상태는 Workspace와 사용자 범위로 보존한다.
- Provider 업데이트는 사용자가 조정한 배치를 덮어쓰지 않는다.
- 위젯이 제거되면 해당 자리만 정리하고 나머지 배치는 보존한다.

## Optional Inbox Compatibility Surface

### Core Inbox envelope

기존 Inbox 계약을 사용하는 경우 Core는 다음 공통 정보를 저장하고 처리한다.

- item ID와 source plugin ID
- Workspace와 대상 사용자 범위
- category와 severity
- title과 짧은 summary
- 생성 및 갱신 시각
- 사용자별 unread, read, archived 상태
- 선택적 Core 또는 Plugin navigation target
- 등록된 plugin action ID 목록
- 플러그인 전용 opaque reference

Inbox는 원본 업무 문서를 복제하는 저장소가 아니다. 원본은 플러그인 데이터 저장소에 두고, Inbox에는 사용자가 판단할 수 있는 요약과 참조만 둔다.

### action dispatch

Inbox action은 `열기`, `재시도`, `검토`, `확인`처럼 플러그인이 정의한 업무 행동이다. 사용자가 action을 실행하면 Core는 다음 순서로 처리한다.

1. 항목의 source plugin이 현재 활성 상태인지 확인한다.
2. action이 manifest와 해당 Item에 등록되어 있는지 확인한다.
3. 현재 사용자와 Workspace 문맥을 플러그인 Worker에 전달한다.
4. 플러그인이 자신의 업무 권한과 상태를 다시 판단한다.
5. 위험한 Core 동작이 필요하면 별도 Core capability와 안전 정책을 적용한다.
6. 결과를 기록하고 Item의 상태를 갱신한다.

버튼이 표시된다는 사실은 실행 권한을 뜻하지 않는다. 모든 action은 실행 시점에 다시 검증된다.

### 보존과 삭제

- read/archive 상태는 사용자별로 분리한다.
- 플러그인의 원본 기록 보존 규칙은 플러그인이 소유한다.
- 플러그인이 비활성화되어도 기존 Inbox 요약은 출처를 표시한 채 읽을 수 있다.
- 플러그인이 완전히 제거될 때 Inbox 요약 삭제 여부는 Host가 선택한다.
- Member가 제거되면 그 사용자의 개인 상태와 연결 정보는 정리하되, 감사에 필요한 공통 요약의 보존은 플러그인 정책에 따른다.

## Paperclip UX 재사용 범위

SPS는 다음 구현 자산을 재사용한다.

- 정보 밀도가 높은 대시보드 레이아웃
- 목록 가상화와 스크롤 처리
- 검색, 필터, 정렬 상호작용
- 키보드 이동과 선택 패턴
- 데스크톱과 좁은 화면의 반응형 전환
- 로딩, 빈 상태, 오류 상태 표현

다음은 재사용하지 않는다.

- Task, Agent, Approval, Room을 Inbox 또는 Dashboard의 기본 데이터 모델로 가정하는 코드
- Paperclip 조직 구조를 전제로 한 권한 판단
- Task 상태를 모든 플러그인의 공통 상태로 해석하는 로직
- Agent 할당, 승인, 작업 완료를 Core Inbox action으로 고정하는 로직

## Target Implementation Gates

1. Native 독립 복구 접근을 구현하고 Plugin/Core 실패 시나리오로 먼저 검증한다.
2. 격리 보안 PoC에서 UI/Worker/Vault/파일 경계와 한계를 확인한다.
3. 0 Primary/0 Agent/0 Extension 상태를 지원하고 Core UI를 선택 사항으로 전환한다.
4. 기존 Shell/Dashboard/Inbox API와 데이터를 보존하면서 Primary/Extension 계약을 additive하게 연결한다.
5. Workspace 실행/Job 제어, 창, data lifecycle, Preview를 별도 승인된 단계로 검증한다.
6. 기존 dated candidate 테스트를 목표 적합성 증거와 혼동하지 않고 새 회귀/E2E를 추가한다.

## Target Acceptance Criteria

- Primary/Agent/Extension이 모두 0인 Workspace가 정상 동작한다.
- 공통 Shell, Dashboard, Inbox 없이도 Workspace를 사용할 수 있다.
- Primary는 선택 사항이고 최대 하나이며, Extension UI는 전용 UI/창 포함 제한되지 않는다.
- Plugin/Core UI 실패 및 Workspace 창 부재 때도 Native 복구가 동작하며 Plugin 코드는 로드되지 않는다.
- 기존 Shell/Dashboard/Inbox API와 data가 호환 경로로 남고 불필요한 강제 migration이 없다.
- Workspace Job scope는 보존하되 OS 종료와 완성된 pause/stop/replay 방지를 별도로 입증한다.

## Historical Candidate Evidence (2026-07-31)

아래 결과는 2026-07-31에 기록된 특정 설치 후보의 당시 범위 증거다. 2026-10-25
목표 또는 현재 Core 적합성의 증거가 아니며, 새 목표를 구현 완료로 표시하지 않는다.

- Core `5290109b0a3dbf7659e4c072e8c13a46b414a2f7`
- SPS Desktop `0.4.95`
- 공개 SDK `@sonparkserver/plugin-sdk` `0.4.0`
- Plugin Discovery & Builder `0.3.3`
- SPS Team Workplane `0.3.92`

검증 결과는 다음과 같다.

- manifest와 capability 검증 23개 통과
- Workspace Shell, Dashboard, Inbox 서버 계약 6개 통과
- Neutral Shell, Appearance, Inbox, 회사 경로 UI 회귀 10개 통과
- SPS Desktop 전체 회귀 190개 통과
- Windows 설치 후보 패키징과 Owner Host runtime 검증 통과
- 격리된 실제 패키지에서 로그인, Host 생성, Neutral Shell, Discovery Shell 선택,
  Team Workplane 동적 설치와 Worker 실행, Dashboard와 Inbox 표시, Provider
  비활성화 후 Neutral fallback을 순서대로 통과
- 테스트 종료 후 설치 후보의 Node와 PostgreSQL 잔여 프로세스 0개 확인

당시 실제 두 컴퓨터 검증은 Member, Tailscale, Node 철회와 업데이트 후 복구를
포함해 수행되지 않았다. 당시 Phase 2 회귀 결과는 해당 후보에서 검사한 회사 경계와
접근 제어만 증명한다. 이 과거 테스트는 Native 독립 복구, 0 Primary/Agent/Extension,
공통 UI 비필수, Extension UI 자유 또는 Workspace 실행 격리의 증거가 아니다.
2026-10-25 현재 근거와 미실행 검증은 [현행 감사](../reviews/CORE_PLUGIN_ARCH_GAP_AUDIT.md)를
참조한다.
