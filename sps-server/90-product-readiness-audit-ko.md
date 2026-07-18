# 맞춤형 Agent Workplane 제품 준비도 감사

Updated: 2026-07-17

## 감사 범위

이 문서는 `02-final-operating-model-ko.md`와
`87-customizable-agent-workplane-product-architecture-ko.md`를 기준으로 현재
SPS Core와 Workplane 플러그인의 제품 경계를 확인한 기록이다.

원칙은 하나다. Core는 중립적인 협업·실행 기반을 제공하고, 사용자별 개발 방식은
플러그인과 Workspace Profile이 정의한다. 따라서 Core는 게임, 설계 저장소, 구현
저장소, 특정 직책 이름을 해석하지 않는다.

## 확인된 제품 계약

| 계약 | 현재 구현 | 검증 |
| --- | --- | --- |
| Lead만 Worker Task 생성·배정·검토·기술 완료 | Workplane capability와 Core Task 권한 경계 | Plugin 권한 테스트, Core ownership 테스트 |
| Worker는 배정 Task만 실행 | Task 생성·재배정·재위임·완료를 거부 | Plugin 권한/Task 도구 테스트 |
| 결과는 원래 Lead Room으로 귀환 | `originatingRoomId`, `owningAgentId`와 final/blocker 보고 계약 | Worker 보고·wake·복구 테스트 |
| 사용자 조직도와 Task 권한 분리 | `reportsTo`가 아닌 `kind`, `roleId`, `assignableRoleIds` 사용 | Organization 정책 테스트 |
| Room 장기 대화 복구 | Room Work State, checkpoint, native compact 관측, durable job ledger | Room durability/compact/job-ledger 테스트 |
| 메모리 접근 경계 | Lead/Hybrid `read_write`, Worker `read` 기본값 및 Agent별 변경 | Organization 정책·memory 도구 테스트 |
| Workspace와 저장소 방식의 개방성 | Project Workspace Profile이 임의 이름, 폴더, 저장소 링크를 저장 | 브라우저 Workspace Profile E2E |
| 여러 사람의 협업 | Owner/Admin 설정, Operator 협업, Viewer 읽기 권한 | Core plugin authz·membership 테스트 |
| 모델·CLI·API 선택 분리 | Workplane 정책은 Organization, 실제 모델/계정/도구는 Agent Configuration | Browser Organization 설정 확인 |

## Plugin-first Workspace Profile

Core에 추가한 범용 확장점은 `project.workspaces.write`다. Workplane 플러그인은 이를
사용해 Project별 Workspace Profile을 저장한다.

- Profile은 Project scope Plugin Entity에 저장한다.
- 사용자는 Workspace 이름, 로컬 폴더, 저장소 URL을 임의로 추가한다.
- Project 기본 Workspace와 Agent별 Workspace를 별도로 지정한다.
- Room을 열 때 해당 Agent의 Workspace가 먼저 선택된다.
- Task를 만들 때 선택된 Workspace 구성이 Task 계약에 스냅샷으로 남는다.
- Profile이 없는 기존 Project는 기존 Workspace 선택 동작을 그대로 유지한다.

이 구조에서는 게임 팀이 `Design`과 `Implementation`을 쓰더라도 단지 하나의
프리셋일 뿐이다. 웹 팀은 `Product`, `Frontend`, `Backend`, 연구 팀은 `Sources`,
`Experiments`, `Reports`처럼 전혀 다른 구성을 사용할 수 있다.

## Organization 정책의 명시성 보강

초기 Legacy migration은 Lead/Worker 유형과 위임 범위만 저장했고, 메모리와 검토
정책은 런타임 기본값으로 보완하고 있었다. 동작에는 문제가 없었지만, 사용자에게
보이는 조직 정책으로는 불완전했다.

현재 migration은 아래 다섯 필드를 모두 명시 저장한다.

```text
roleId
kind
assignableRoleIds
memoryAccess
reviewMode
```

기존에 일부 필드만 가진 Agent는 다시 이관 대상으로 잡아 완전한 일반 정책으로
보완한다. 완전한 수동 정책을 가진 Agent는 그대로 유지한다.

실제 Organization 화면에서 재이관 후 확인한 결과:

- Lead 4명: `read_write`, `automatic`
- Worker 5명: `read`, `automatic`
- 모든 Agent가 `kind`, `roleId`, `assignableRoleIds`, `memoryAccess`, `reviewMode`를 보유

## 실행 검증

### Plugin

`sps-room-chat`의 `npm run check`를 통과했다.

- Worker 권한과 Task 소유·보고·wake
- Task 상태 전이와 자동 재시도 비활성화
- Room Work State, native compact, checkpoint, durable job ledger
- attachment staging, UTF-8 보호, Workspace binding/link
- Organization 정책, template migration, action 권한

### Core

이미 설치된 로컬 Vitest로 다음 범위를 실행해 통과했다.

```text
plugin-submit-report
plugin-routes-authz
plugin-agent-session-context
issue-agent-mutation-ownership-routes
heartbeat-process-recovery
invite-accept-existing-member
resource-memberships-routes
```

결과: 4개 테스트 파일 실행, 109개 통과. 현재 설정으로 제외된 3개 파일의
114개 케이스는 실행 대상에서 제외된 것이며 실패가 아니다.

### Browser E2E

별도 Workplane 테스트 Project에서 다음을 실제 브라우저로 확인했다.

1. 임의 Workspace 두 개를 추가했다.
2. Project 기본 Workspace와 Designer/Code Worker 전용 Workspace를 지정했다.
3. 새로고침 뒤에도 설정이 유지됐다.
4. 각 Agent Room이 지정된 Workspace를 선택했다.
5. Organization 화면에서 Legacy policy를 재이관했다.
6. 이관 버튼이 사라졌고 브라우저 console error는 없었다.

사용자의 학교 게임 Project와 실제 산출물은 이 검증에서 수정하지 않았다.

## 남은 운영 조건

제품 계약과 구현은 준비됐지만, Agent의 외부 CLI 로그인은 제품 코드와 별개의 운영
상태다. 이전에 관찰한 `손영하-CTO`의 revoked refresh token은 정상적인 브라우저
계정 복구 과정에서 해소되었으며, 이력은 `92-full-stack-product-audit-ko.md`에
기록했다. 앞으로도 특정 Agent가 실행되지 않으면 Workplane 정책을 바꾸기 전에 먼저
그 Agent가 선택한 `CODEX_HOME` 또는 전문 API 연결의 로그인 상태를 확인한다.

또한 실제 두 번째 사람의 로그인으로 모든 UI를 공동 조작하는 수동 수락 테스트는
아직 수행하지 않았다. Core의 멤버십·권한 테스트는 통과했으며, 친구를 초대한 뒤에는
Operator 계정으로 Project/Room/Task 열람과 Company 설정 차단을 한 번 확인하면
된다.

## 다음 제품 작업

1. 초대된 Operator 계정으로 멀티 사용자 브라우저 수락 테스트를 수행한다.
2. Project 단위 Admin/Contributor 역할이 필요해지는 시점에 Company 역할 위에
   Project Membership 정책을 추가한다.
3. Workspace Profile, Task 계약 템플릿, 외부 도구 묶음을 각각 독립 플러그인으로
   배포 가능한 preset package 형식으로 정리한다.
4. 외부 접속 배포 전 TLS, 백업, audit log 보존, 비밀 회전과 restore drill을 추가한다.
5. 협업 배포를 열 때 `93-collaboration-deployment-readiness-ko.md`의
   authenticated/private Tailnet preflight와 두 사용자 브라우저 수락 테스트를 수행한다.
