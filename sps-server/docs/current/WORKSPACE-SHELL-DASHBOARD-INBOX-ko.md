# SPS Workspace Shell, Dashboard, Inbox 설계

상태: Phase 2 구현 및 설치 후보 검증 완료
최종 갱신: 2026-07-31

## 목적

SPS는 특정 업무 방식이나 조직 구조를 Core에 고정하지 않는다. 대신 어떤 플러그인도 공통으로 사용할 수 있는 작업 표면을 Core가 제공하고, 각 플러그인은 자신의 업무 의미와 데이터를 그 표면에 기여한다.

이 문서는 SPS Workspace의 세 가지 공통 표면을 정의한다.

- **Workspace Shell**: Workspace 진입점, 주요 탐색 구조, Shell 선택과 복구 경로
- **Dashboard**: Core 상태와 플러그인 현황을 한 화면에서 보는 그리드
- **Inbox**: 여러 플러그인의 보고와 알림을 사용자별로 수신하고 처리하는 공통 수신함

Dashboard와 Inbox는 Paperclip에서 검증된 **레이아웃, 목록, 검색, 키보드 조작, 반응형 UX primitive**를 재사용할 수 있다. 그러나 Paperclip의 Task, Agent, Approval, Room 도메인 의미와 데이터 계약은 재사용하지 않는다. SPS의 Dashboard와 Inbox는 어떤 업무 플러그인에도 종속되지 않는 중립 표면이다.

## 확정 원칙

1. Core는 Workspace Shell 선택과 Neutral fallback을 소유한다.
2. Core는 Dashboard 그리드, 위젯 생명주기, 위젯 오류 격리를 소유한다.
3. Core는 Inbox envelope, 사용자별 read/archive 상태, action dispatch와 감사 흔적을 소유한다.
4. Core의 복구 메뉴는 고정이며, 플러그인이 숨기거나 대체할 수 없다.
5. Plugin은 업무 의미, 업무 데이터, 업무 행동, 업무별 권한 판단을 소유한다.
6. Shell은 Host가 Workspace별로 명시적으로 선택한다. 자동 선택이나 플러그인 활성화에 따른 자동 전환은 금지한다.
7. Shell Provider가 비활성화, 제거, 호환 불가 또는 로드 실패 상태가 되면 즉시 Neutral Core Shell로 돌아간다.
8. Dashboard와 Inbox에 항목이 보인다는 사실만으로 권한이 부여되지는 않는다. 실행 시점마다 플러그인과 Core 계약을 다시 검증한다.

## 용어

### Workspace

한 팀 또는 회사 안에서 독립적으로 운영되는 작업 단위다. Shell 선택, Dashboard 배치, Inbox 사용자 상태는 Workspace 범위로 분리된다.

### Neutral Core Shell

SPS가 항상 제공하는 안전한 기본 Shell이다. 다음 상황에서 사용한다.

- Workspace에 Shell Provider가 선택되지 않은 경우
- 선택된 Provider가 비활성화, 제거 또는 호환 불가 상태인 경우
- Provider 렌더링 또는 초기화가 실패한 경우
- Safe mode 또는 복구 경로로 진입한 경우

Neutral Core Shell은 Dashboard, Inbox, 활성 플러그인 작업 페이지, Host 설정과 계정 메뉴를 제공한다. 복구와 관리에 필요한 경로는 항상 남긴다.

### Workspace Shell Provider

Workspace의 기본 진입점과 탐색 구성을 제안하는 플러그인 역할이다. Provider는 UI 구성을 제안할 뿐 다른 플러그인의 데이터나 권한을 소유하지 않는다.

### Dashboard Widget

플러그인이 Dashboard 그리드에 기여하는 독립 UI 단위다. 위젯 하나의 오류는 다른 위젯, Dashboard 전체, 복구 메뉴를 막지 않는다.

### Inbox Item

플러그인이 발행하는 업무 중립적 알림 또는 보고의 요약 envelope다. 원본 업무 기록은 해당 플러그인이 소유한다.

## Core와 Plugin의 경계

| 영역 | Core가 소유 | Plugin이 소유 |
| --- | --- | --- |
| Shell | Provider 선택, Workspace별 저장, Neutral fallback, 충돌 방지, 복구 경로 | 기본 진입 제안, 탐색 그룹과 항목 제안, Dashboard 기본 preset |
| Dashboard | 그리드, 배치 저장, 위젯 생명주기, 로딩/오류 격리, 반응형 레이아웃 | 위젯 내용, 업무 상태 해석, 조회와 이동 행동 |
| Inbox | envelope 저장, 사용자별 read/archive, 정렬/검색/필터 primitive, action dispatch와 감사 | 보고 생성 기준, 업무 의미, 원본 데이터, action의 업무 권한 판단 |
| Navigation | 공통 Sidebar, Dashboard, Inbox, Host 복구 및 관리 경로 | 플러그인 작업 페이지와 탐색 제안 |
| 데이터 | Workspace 표면 상태와 공통 envelope | 업무 문서, Task, Agent, Approval, Room 등 각 플러그인 고유 데이터 |
| 실패 처리 | 플러그인 격리, fallback, 진단 | 오류 설명, 재시도 또는 복구 행동의 업무 의미 |

## Native Capability 계약

다음 capability는 SPS Core가 제공하는 표준 계약이다.

- `ui.workspaceShell.provide`
- `ui.dashboard.contribute`
- `inbox.items.publish`
- `inbox.items.update`
- `inbox.actions.register`

플러그인은 manifest에서 필요한 capability와 선언을 함께 제출한다. 설치 또는 활성화 이후에도 Core는 실제 호출 시점에 capability, 활성 상태, Workspace 문맥을 검증한다.

`ui.workspaceShell.provide`를 가진 플러그인이 활성화되어도 Shell은 자동으로 바뀌지 않는다. Host가 해당 Workspace에서 명시적으로 선택해야 한다.

## Workspace Shell 설계

### 선택과 fallback

- Workspace마다 활성 Shell Provider는 최대 하나다.
- Host만 `Settings > Workspace appearance`에서 Provider를 선택하거나 Neutral Shell로 되돌릴 수 있다.
- Provider의 활성화, 비활성화, 설치, 업데이트, 제거는 선택 상태를 자동 변경하지 않는다.
- 선택된 Provider가 사용할 수 없으면 Core는 선택값을 안전하게 해석해 Neutral Core Shell을 표시한다.
- 같은 Host라도 Workspace마다 다른 Provider를 선택할 수 있다.

### Provider가 제안할 수 있는 것

- 기본 진입 경로
- Dashboard와 Inbox의 탐색 노출 방식
- 플러그인 작업 페이지의 그룹, 순서, 표시 이름
- Dashboard 위젯의 기본 배치 preset
- 빈 Workspace에서 보일 시작 행동

### Provider가 할 수 없는 것

- Core API나 Core 기능을 비활성화하거나 숨기기
- Host 설정, Plugins, Safe mode, Diagnostics, Update, Export/Import 경로 제거
- 다른 플러그인의 capability 우회 또는 데이터 직접 변경
- Core DOM을 직접 수정하거나 전역 CSS로 Core를 덮어쓰기
- Core 경로를 같은 이름으로 가로채기

### 고정 복구 메뉴

다음 경로는 Shell Provider와 무관하게 항상 접근 가능해야 한다.

- Dashboard
- Inbox
- Plugins
- Host settings
- Safe mode
- Diagnostics
- Update
- Export/Import

Shell Provider가 탐색에서 Dashboard나 Inbox를 덜 드러나게 제안할 수는 있어도, 복구 경로 자체를 제거할 수는 없다.

## Dashboard 설계

### Core 책임

Core Dashboard는 다음을 책임진다.

- 반응형 그리드와 위젯 크기 규칙
- Workspace 및 사용자 범위의 배치 저장
- 위젯 등록, 로드, 갱신, 제거 생명주기
- 위젯 단위 loading, empty, error 상태
- 위젯 단위 오류 경계와 장애 격리
- Server, Desktop, Node, Runtime, Source, Plugin 상태 중 Core가 직접 관찰 가능한 주의 항목

Core가 직접 감지한 복구 필요 상태는 Shell Provider가 숨길 수 없는 고정 Attention 영역에 표시한다.

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

## Inbox 설계

### Core Inbox envelope

Core는 모든 Inbox Item에 대해 다음 공통 정보를 저장하고 처리한다.

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

## 구현 순서

1. Shell Provider, Dashboard Widget, Inbox envelope의 public schema와 capability를 정의한다.
2. Neutral Core Shell과 고정 복구 메뉴를 구현한다.
3. Dashboard 그리드, contribution loader, 오류 격리, 사용자 배치 저장을 구현한다.
4. Inbox 저장소, API, read/archive, action dispatch와 감사 기록을 구현한다.
5. Workspace별 Shell 선택 UI와 fallback을 구현한다.
6. Plugin Discovery & Builder에서 위 계약을 사용하는 reference plugin을 검증한다.
7. SPS Team Workplane에 reference Dashboard Widget과 Inbox publisher를 추가한다.
8. 플러그인 충돌, 비활성화, 제거, rollback, Member 접근, Safe mode를 Desktop E2E로 검증한다.

## 완료 기준

- 플러그인이 없는 Workspace에서도 Neutral Core Shell이 정상 동작한다.
- Host는 Workspace별로 활성 Shell Provider 하나를 명시적으로 선택할 수 있다.
- Shell 선택은 다른 Workspace에 영향을 주지 않는다.
- Provider의 설치, 활성화, 업데이트, 제거가 Shell을 자동 전환하지 않는다.
- 선택된 Provider가 실패하거나 사라지면 Neutral Core Shell로 안전하게 돌아간다.
- 여러 플러그인의 Dashboard Widget과 Inbox Item이 동시에 표시된다.
- 하나의 플러그인 UI 또는 Worker가 실패해도 Dashboard, Inbox, 복구 메뉴는 계속 동작한다.
- Dashboard와 Inbox는 Paperclip UX primitive를 활용하되 Task, Agent, Approval 도메인 계약에 의존하지 않는다.
- Inbox action은 source plugin, manifest, Workspace 문맥, 플러그인 업무 권한을 실행 시점에 다시 검증한다.
- Desktop E2E에서 Host와 Member가 자신의 접근 범위에 맞는 contribution만 보며, Safe mode와 복구 경로에 항상 접근할 수 있다.

## 현재 구현 상태

2026-07-31 기준 Phase 2 구현과 설치 후보 검증을 완료했다.

- Core `5290109b0a3dbf7659e4c072e8c13a46b414a2f7`
- SPS Desktop `0.4.95`
- 공개 SDK `@sonparkserver/plugin-sdk` `0.4.0`
- Plugin Discovery & Builder `0.3.3`
- SPS Team Workplane `0.3.91`

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

Member, Tailscale, Node 철회와 업데이트 후 복구를 포함한 실제 두 컴퓨터 검증은
Phase 8의 통합 출시 Gate에서 다시 수행한다. Phase 2의 회사 경계와 접근 제어는
서버·Desktop 회귀 테스트로 고정했다.
