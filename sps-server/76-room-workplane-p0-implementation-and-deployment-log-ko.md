# Room Workplane P0 구현 및 배포 기록

## 문서 지위

이 문서는 `75-optimal-work-environment-blueprint-ko.md`의 P0 설계를 실제
SPS 플러그인에 적용한 결과를 기록한다. 설계 원칙은 문서 75가 우선이며,
이 문서는 구현 완료 범위와 남은 한계를 명확히 한다.

## 배포 상태

- 대상: 로컬 SPS `http://127.0.0.1:3100/CMP`
- 플러그인: `local.room-chat`
- 버전: `0.3.0`
- 상태: `ready`, health `healthy`
- SPS Core 수정: 없음

플러그인 manifest에 Project Workspace 읽기 권한이 추가되어, 기존 플러그인을
공식 lifecycle으로 제거 후 같은 플러그인 ID로 다시 설치했다. Room 상태, 댓글,
Task, Agent 설정은 SPS 데이터에 남으며, Core fork를 만들지 않았다.

## 이번에 완료한 P0

### 1. Room과 Workspace

- 새 프로젝트에서 고용된 Agent마다 이름이 같은 장기 Room을 하나 만든다.
- Room은 로컬 절대 경로가 아니라 SPS의 `Project Workspace ID`를 저장한다.
- 실행 시점에 ID로 현재 Workspace 경로를 해석하므로, 경로를 변경하거나 다른
  프로젝트를 열어도 Room의 소속이 섞이지 않는다.
- Designer/문서 성격 Task는 설계 Workspace를, 구현/QA 성격 Task는 구현
  Workspace를 기본 후보로 선택해 Task 계약에 기록한다.

### 2. 장기 대화와 비동기 Job

- Room 메시지, Compact, Task Owner feedback은 모두 즉시 접수되는 durable Job으로
  기록된다. 따라서 30초 RPC 제한 때문에 UI 요청이 실패한 것처럼 보이지 않는다.
- Job 상태는 `queued`, `working`, `completed`, `failed`, `interrupted`로 남는다.
- SPS 또는 PC가 작업 중 다시 시작되면 실행 중이던 Job은 영구 `Working`으로
  남지 않고 `interrupted`로 정리된다. 사용자는 Room에서 다시 보낼 수 있다.
- 메시지와 Codex Session ID는 실행 전에 저장한다. Room 대화, compact handoff,
  공개 가능한 진행 요약은 Room state와 SPS 댓글에 남는다.

### 3. Room UI

- 기존 polling 기반 Web Component 대신 SPS 공식 React UI SDK 기반 화면으로
  교체했다.
- 왼쪽은 현재 프로젝트 Room 목록, 가운데는 Markdown 대화와 고정 입력창,
  오른쪽은 해당 Agent가 만든 Task, Workspace 변경사항, Session 상태다.
- 가운데 대화는 Task chat과 같은 Markdown 렌더링 및 Working/진행 요약 흐름을
  사용한다. 전체 모델의 비공개 사고 과정은 표시하지 않고, 실행기가 제공한
  공개 가능한 진행 요약만 표시한다.
- Task 목록은 Room이 아닌 유한 Task만 보여 주는 전용 화면을 사용한다.

### 4. Room과 Task의 분리

- 새 Agent Room은 plugin operation origin과 `plugin_operation` visibility로
  생성된다.
- Room은 역할별 장기 대화이고, Task는 CTO/Designer가 직접 만들고 Worker에게
  맡기는 유한 작업이다.
- 현재 upstream Core의 Project-filter Issue 조회는 `plugin_operation`도 포함하는
  동작이 있어, SPS 기본 Project Task 목록에는 구형/혼재 Room이 보일 수 있다.
  이는 Core를 고치지 않고 플러그인 전용 Task 화면을 운영 기준으로 삼아 피했다.

## 검증 결과

`sps-room-chat`에서 다음을 통과했다.

- Codex app-server client의 start/turn/native compact protocol
- Agent Room 생성, Agent identity, Task 충돌 방지, Owner feedback 계약
- compact 전에 handoff 저장
- 실행 실패 전 사용자 메시지와 Session ID 저장
- 공개 진행 요약 저장
- Workspace ID 바인딩 및 절대 경로 미저장
- durable Job ledger와 완료 이벤트
- manifest 권한과 안전성 검사
- React UI bundle 생성

배포 후 브라우저에서 프로젝트 Room 화면을 열어 Room 목록, 중앙 대화, 오른쪽
Task/Changes/Session 패널과 Workspace 바인딩을 확인했다.

## 아직 남은 P1/P2

### Upstream 또는 어댑터가 필요한 부분

- 현재 Room 실행기는 임시 호환 계층인 direct Codex app-server runtime이다.
  `RoomRuntime` 인터페이스 뒤에 두었고, SPS 공식 Agent Session API가
  프로젝트/Workspace/Issue context 주입과 결과 재연결을 제공하면 교체한다.
- 프로세스 재시작 후 실행 중 Job을 자동 재개하지는 않는다. `interrupted`로
  보존하고 사용자가 재실행하는 P0 정책이다.
- SPS 기본 Project Task 목록에서 plugin operation Room을 완전히 제외하려면
  upstream Issue filter 동작 개선이 필요하다.
- Task 계약의 Project Workspace ID와 SPS runtime Execution Workspace ID는
  서로 다른 개념이다. Worker 별 worktree/Execution Workspace의 자동 매핑은
  실제 Worker adapter를 연결하는 P2에서 구성한다.
- CLI 토큰 기반 자동 compact, 로컬 Code/QA Worker의 실운영 adapter, Art/Voice API
  adapter, Work Product inspector는 후속 단계다.

## 운영 원칙

1. 사용자와 Designer Room에서 설계한다.
2. 사용자가 구현을 지시한 뒤 CTO Room이 Task를 만든다.
3. CTO는 다른 Task의 파일/Workspace 계약을 확인하고 Worker에게 할당한다.
4. Worker는 완료 또는 blocker를 Task에 남긴다.
5. 사용자가 검토한 뒤에만 Task를 `done`으로 닫는다.
6. 역할별 공통 규칙은 SPS Agent Instructions의 `AGENTS.md`에서 관리한다.
   설계와 구현 산출물은 각 Git/Obsidian 레포에 둔다.

## 다음 점검

- 프로젝트 생성 시 모든 고용 Agent Room과 Workspace 바인딩이 기대대로 생기는지
  실제 새 프로젝트로 확인한다.
- CTO가 설계 Workspace를 참조해 구현 Task를 만들고 Code Worker가 구현 Workspace에서
  종료하는 흐름을 adapter 연결 후 검증한다.
- SPS 업데이트 전에는 manifest 호환성, Room/Task 생성, Worker 할당 smoke test를
  실행한다.
