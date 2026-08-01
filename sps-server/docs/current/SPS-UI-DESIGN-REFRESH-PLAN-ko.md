# SPS Desktop UI 디자인 개선 계획

상태: 계획 확정 전 검토본
최종 갱신: 2026-08-01
구현 상태: 미착수

## 1. 목적

Workflow Plugin과 Extension Plugin을 화면에서 분리하기 전에 SPS Desktop의
기본 시각 언어와 작업 공간 구조를 먼저 정돈한다.

이번 개선의 목표는 SPS를 Codex나 Cursor의 복제품으로 만드는 것이 아니다.
두 제품에서 검증된 작업 집중 구조를 참고해 다음을 달성한다.

- 현재 작업이 가장 먼저 보이는 화면
- 둥근 모서리와 얕은 경계로 구분되는 안정적인 작업 패널
- 영어와 한국어가 모두 자연스러운 타이포그래피
- Core와 Plugin이 같은 제품처럼 보이는 공통 디자인 계약
- 빈 화면, 실행 중, 완료, 오류, 위험 작업이 즉시 구분되는 상태 표현
- 좁은 창에서도 겹치거나 잘리지 않는 Desktop 우선 반응형 레이아웃

## 2. 이번 단계의 경계

이번 단계는 시각 체계와 화면 표현을 개선한다. 다음 동작과 데이터 계약은
바꾸지 않는다.

- Workspace, Host, Member, Node, Source의 Core 계약
- Workspace Shell capability와 Neutral fallback
- Plugin 설치, 활성화, Preview, Review 생명주기
- Workflow Plugin과 Extension Plugin 분류 로직
- Dashboard, Inbox, Room의 업무 데이터 의미

즉 UI 개선을 먼저 마친 뒤, 그 디자인 시스템 위에서 Workflow/Extension 분류를
구현한다.

## 3. 현재 상태 감사

2026-08-01 설치본 `0.4.105`, 1264x775 창에서 다음 화면을 직접 확인했다.

- Neutral Workspace Dashboard
- Inbox 빈 상태
- Host settings Overview
- Plugins 관리
- Plugin Builder

### 확인된 장점

- `InterVariable`과 색상·반경 토큰이 Core에 이미 존재한다.
- Sidebar 축소, 설정용 보조 Sidebar, 독립 스크롤의 기반이 있다.
- 공통 Card, Button, Input과 focus-visible 상태가 있다.
- 화면이 기능적으로 절제되어 있고 과도한 장식이 없다.

### 개선이 필요한 부분

1. **앱 프레임이 평평하다.** Sidebar, 보조 Sidebar, 본문이 경계선으로만 나뉘어
   작업 창이라기보다 웹 관리 페이지처럼 보인다.
2. **반경이 일관되지 않다.** Core는 8px 중심이지만 Plugin UI는 5~14px와
   고정 색상을 개별 선언한다.
3. **타이포그래피 위계가 약하다.** 12~20px 범위가 반복되지만 제목, 설명,
   상태, 메타데이터의 역할이 화면마다 다르게 표현된다.
4. **빈 상태가 지나치게 넓다.** Dashboard와 Inbox에서 다음 행동보다 빈 공간이
   더 강하게 보인다.
5. **설정 카드의 무게가 모두 같다.** 운영 설정과 플랫폼 설정, 위험 작업이
   시각적으로 충분히 구분되지 않는다.
6. **Plugin Builder가 문서처럼 보인다.** 설명과 실제 작업 상태의 우선순위가
   뒤집혀 있다.
7. **Room이 Core와 다른 제품처럼 보일 위험이 있다.** Room Workplane은
   별도 CSS, `system-ui`, 고정 색상과 별도 반경을 사용한다.
8. **위험 행동의 계층이 약하다.** Use, Settings, Uninstall이 같은 행과 비슷한
   버튼 무게로 표시된다.

## 4. 참고 제품에서 가져올 것

### Codex에서 참고할 원칙

- 왼쪽 탐색, 중앙 작업, 선택적 오른쪽 컨텍스트의 명확한 3영역 구조
- 중앙 채팅 또는 현재 작업이 화면의 주인공이 되는 구성
- 각 영역의 독립 스크롤과 접기·크기 조절
- 입력창과 작업 결과를 하나의 안정적인 둥근 surface로 표현
- 변경 파일, 실행 과정, 검토 결과를 중앙 작업을 방해하지 않는 보조 패널에 배치

### Cursor에서 참고할 원칙

- 여러 Workspace와 Agent 상태를 빠르게 훑는 높은 정보 밀도
- Agent, 계획, 변경, 검토를 Sidebar와 분할 화면에서 이어 보는 흐름
- 작은 아이콘, 상태, 메타데이터의 정밀한 정렬
- 작업 결과와 diff, Preview를 대화와 가까운 곳에서 검증하는 구조

### 그대로 가져오지 않을 것

- Codex 또는 Cursor의 로고, 고유 색상, 아이콘과 정확한 화면 복제
- Cursor 마케팅 사이트의 크림색·세리프·주황색 체계를 SPS 전체에 적용
- 모든 내용을 카드로 감싸는 Dashboard형 구성
- 큰 그림자, 장식용 그라디언트, 유리 효과, 낮은 대비
- 좁은 글자 간격이나 작은 글씨로 정보 밀도를 억지로 높이는 방식

참고 자료:

- OpenAI, Introducing the Codex app:
  https://openai.com/index/introducing-the-codex-app/
- Cursor, New Coding Model and Agent Interface:
  https://cursor.com/changelog/2-0
- Cursor, Meet the new Cursor:
  https://cursor.com/blog/cursor-3

## 5. SPS 디자인 방향

디자인 방향의 작업명은 **SPS Workbench**로 한다.

### 화면 구성

```text
Desktop Window
└─ App background / 8px gutter
   ├─ Primary Sidebar / rounded panel
   ├─ Secondary Sidebar / 필요할 때만 표시
   └─ Main Work Surface / rounded panel
      ├─ compact header
      ├─ content or chat
      └─ optional context panel
```

- 앱 바깥 배경은 아주 옅은 차가운 회색을 사용한다.
- Primary Sidebar와 Main Surface는 10~12px 반경, 1px 경계로 분리한다.
- Secondary Sidebar는 Main Surface 안의 분할 pane처럼 취급한다.
- 좁은 창에서는 바깥 gutter와 반경을 줄이고 Sidebar를 overlay로 전환한다.
- 중앙 작업과 오른쪽 패널은 반드시 독립 스크롤을 유지한다.

### 반경 체계

| 용도 | 반경 |
| --- | --- |
| 앱의 큰 작업 pane | 12px |
| Card, modal, composer | 10px |
| Button, input, compact panel | 8px |
| 작은 control | 6px |
| 상태 badge | pill |

모든 섹션을 둥근 카드로 만들지는 않는다. 큰 pane, 반복 항목, 입력 surface,
modal처럼 실제 경계가 필요한 곳에만 반경을 사용한다.

### 타이포그래피

- Latin UI: `InterVariable`
- Korean fallback: `Pretendard Variable`, `Noto Sans KR`, `Malgun Gothic`
- Windows system fallback: `Segoe UI Variable`, `Segoe UI`
- Code, 경로, ID, 버전: 현재 mono stack을 유지하되 크기와 행간을 통일

권장 역할:

| 역할 | 크기 | 굵기 | 행간 |
| --- | --- | --- | --- |
| Page title | 22px | 650 | 1.25 |
| Section title | 16px | 600 | 1.35 |
| UI body | 14px | 400~500 | 1.5 |
| Control label | 13px | 500~600 | 1.35 |
| Metadata | 12px | 400~500 | 1.4 |

- 글자 간격은 0을 기본으로 하고 대문자 eyebrow에만 소량의 양수 tracking을 쓴다.
- 한글과 영문이 섞인 문장에서 굵기와 baseline이 흔들리지 않도록 실제 설치
  폰트와 fallback을 패키지에서 검증한다.

### 색상과 깊이

- 중립 회색 표면 + SPS blue 한 가지 강조색을 기본으로 한다.
- 성공, 경고, 오류는 semantic token으로만 사용한다.
- 기본 pane과 Card는 그림자 없이 경계와 표면 차이로 구분한다.
- popover, modal, floating composer에만 얕고 넓은 그림자를 사용한다.
- Light theme를 먼저 완성하고 Dark theme는 동일 token 계약으로 맞춘다.

### 상호작용

- hover, focus-visible, active, selected, disabled, loading을 모든 control에 제공한다.
- transition은 색상·경계·opacity 중심으로 120~180ms를 사용한다.
- layout 이동 애니메이션은 최소화하고 `prefers-reduced-motion`을 존중한다.
- 위험 작업은 기본 버튼 행에서 분리하거나 overflow menu와 확인 dialog로 이동한다.

## 6. OpenDesign 활용 계획

OpenDesign은 최종 React 코드를 직접 결정하는 도구가 아니라, 구현 전에 화면을
비교하고 선택하는 고해상도 Prototype 도구로 사용한다.

현재 설치된 OpenDesign의 `Cursor` 디자인 시스템은 참고 자료로 사용할 수 있지만,
마케팅 사이트용 크림색·세리프 규칙은 제외한다. SPS 전용 Design Brief를 먼저
만들고 다음 원칙을 고정한다.

- Desktop product UI
- neutral cool surfaces
- SPS blue accent
- Inter + Korean fallback
- 12px pane / 10px card / 8px control radius
- no decorative gradients
- compact developer-tool density

### OpenDesign 산출물

다음 화면을 동일한 Shell로 묶은 하나의 SPS UI Prototype으로 만든다.

1. Workspace Dashboard: 데이터가 있는 상태와 빈 상태
2. Inbox: 보고가 있는 상태와 빈 상태
3. Host settings Overview
4. Plugins 관리: normal, update available, incompatible, dangerous action
5. Plugin Builder: project, validation, Preview 진입 상태
6. Room: Room 목록, 중앙 채팅, 오른쪽 Tasks/Changes/Files/Work 패널
7. 오류·로딩·권한 없음·오프라인 불가 상태

검토 해상도:

- 1440x900: 일반 Desktop
- 1264x775: 현재 설치 앱 기준
- 1024x720: 최소 지원 Desktop

OpenDesign Prototype 승인 전에는 Core 컴포넌트의 대규모 스타일 변경을 시작하지
않는다. 승인된 Prototype의 token과 구조만 코드로 옮긴다.

## 7. 구현 단계

| 단계 | 작업 | 완료 기준 |
| --- | --- | --- |
| 0 | 현재 화면 감사와 계획 확정 | 이 문서 승인 |
| 1 | OpenDesign SPS Workbench Prototype | 7개 화면, 3개 해상도 검토 |
| 2 | Core design token과 typography 정리 | 반경·간격·색상·폰트의 단일 계약 |
| 3 | App Shell, Sidebar, Header, pane 개선 | 독립 scroll, resize, collapse 회귀 통과 |
| 4 | Dashboard, Inbox, Host settings 개선 | 빈 상태와 다음 행동, 위험도 위계 확인 |
| 5 | Plugins와 Plugin Builder 개선 | 작업 상태와 lifecycle 행동 구분 |
| 6 | Plugin UI token 계약 갱신 | SDK와 번들 Plugin이 Core token 사용 |
| 7 | Room Workplane 개선 | 채팅 중심 3-pane과 composer 검증 |
| 8 | Desktop 패키징과 실제 앱 전수 검증 | 설치 앱 화면·키보드·접근성 회귀 통과 |

## 8. 파일 경계

예상 변경 범위:

- `external/sps-core/ui/src/index.css`
- `external/sps-core/ui/src/components/ui/*`
- `external/sps-core/ui/src/components/Layout.tsx`
- `external/sps-core/ui/src/components/Sidebar*.tsx`
- `external/sps-core/ui/src/pages/SpsCore*.tsx`
- `external/sps-core/ui/src/pages/SpsWorkspaceInbox.tsx`
- Plugin UI SDK의 design token export
- `sps-server/sps-room-chat/src/ui/RoomWorkplane.jsx`
- `sps-server/sps-plugin-discovery/src/ui/DiscoveryPage.jsx`
- `sps-server/sps-memory/src/ui/MemoryTab.jsx`

Desktop의 로그인·업데이트·서버 시작 창도 같은 token 체계로 맞추되, Workspace
화면 안정화 뒤 별도 묶음으로 작업한다.

## 9. 검증 기준

### 시각 검증

- 주요 화면을 1440x900, 1264x775, 1024x720에서 캡처 비교
- Light/Dark theme에서 반경, 경계, 대비와 상태 색상 확인
- 긴 한글 파일명, 경로, Agent 이름, Plugin 이름의 줄바꿈·말줄임 확인
- 데이터 없음, 데이터 많음, 오류, 로딩, 권한 없음 상태 확인

### 사용성 검증

- 주요 행동은 한 화면에 하나만 가장 강하게 보인다.
- Sidebar, 중앙 작업, 오른쪽 패널이 각각 독립 스크롤된다.
- 모든 pane은 마우스와 키보드로 접기·크기 조절이 가능하다.
- 위험 행동은 일반 설정 행동과 시각적으로 분리된다.
- Room에서 대화, Working, 결과, 파일, Task 상태를 화면 이동 없이 확인할 수 있다.

### 접근성 검증

- 본문과 control은 WCAG AA 대비를 만족한다.
- icon-only control은 tooltip과 `aria-label`을 가진다.
- 상태는 색상 외에 텍스트 또는 아이콘으로도 전달한다.
- focus ring을 숨기지 않는다.
- 200% 확대와 keyboard-only 흐름에서 핵심 기능을 사용할 수 있다.

### 회귀 검증

- Core UI 단위 테스트와 typecheck
- Plugin UI bridge 및 token compatibility 테스트
- Desktop 패키지 E2E
- 실제 설치본에서 Dashboard, Inbox, Settings, Plugins, Builder, Room 전수 확인
- OpenDesign 승인 화면과 실제 설치 앱 screenshot diff 검토

## 10. 완료 정의

UI 개선은 다음 조건을 모두 만족해야 완료다.

1. SPS의 Core와 기본 Plugin이 하나의 제품처럼 보인다.
2. 둥근 pane은 작업 영역을 구분하지만 화면을 카드 모음처럼 만들지 않는다.
3. 한글과 영문 타이포그래피가 모든 주요 화면에서 안정적이다.
4. 빈 상태에서도 현재 상태와 다음 행동을 즉시 이해할 수 있다.
5. Dashboard, Inbox, Host settings, Plugins, Builder, Room이 실제 설치 앱에서
   기능 회귀 없이 동작한다.
6. 이후 Workflow/Extension 분류 UI가 같은 디자인 시스템 위에서 추가될 수 있다.

## 11. 이번 계획에서 아직 구현하지 않는 것

- Workflow Plugin과 Extension Plugin 분류 UI
- Primary Workflow 선택 기능
- Marketplace 정보 구조 변경
- Core 또는 Plugin 데이터 계약 변경
- 제품 로고와 브랜드 아이덴티티 전면 교체
