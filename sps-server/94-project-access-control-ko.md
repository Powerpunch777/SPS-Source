# 94. Project 접근 제어

## 목적

제품형 Workplane은 한 Company 안에서도 Project마다 참여 범위가 다를 수 있다. 이 기능은 Room과 Task의 작업 흐름을 바꾸지 않고, 누가 어떤 Project를 열고 협업할 수 있는지를 Core에서 제한한다.

## 데이터와 기본값

- `project_memberships`는 개인의 참여/즐겨찾기 상태다. 접근 권한으로 사용하지 않는다.
- `projects.access_mode`는 Project 접근 방식을 저장한다.
- `project_access_grants`는 사람 또는 Agent의 명시적 역할을 저장한다.
- 모든 기존 Project와 새 Project의 기본값은 `company`다. 기존 소규모 팀의 동작을 바꾸지 않는다.

## 접근 모드

| 모드 | 대상 | 사용 시점 |
| --- | --- | --- |
| `company` | 활성 Company 구성원 | 같은 팀이 모든 Project를 함께 쓰는 기본 환경 |
| `restricted` | 명시 grant를 받은 사람/Agent | 외부 협업, 고객 Project, 민감한 작업공간 |

`restricted` Project에서도 Company `Owner`와 `Admin`은 항상 접근한다. 실수로 모든 grant를 제거해도 관리자가 복구할 수 있어야 하기 때문이다.

## 역할

| 역할 | 할 수 있는 일 |
| --- | --- |
| `Viewer` | Project, Room, Task 읽기 |
| `Collaborator` | 읽기, 댓글, 배정된 Task 작업 |
| `Manager` | Collaborator 권한과 Project 설정 변경, 새 Task 생성/배정 |

Agent도 같은 역할을 받을 수 있다. Project의 Lead Agent는 제한 Project에서 자동으로 `Manager` 범위로 평가된다. Worker는 자신에게 배정된 활성 Task가 있을 때만 그 Task 협업 범위로 평가된다. 따라서 Worker가 다른 Project나 다른 Task를 탐색하는 권한을 얻지 않는다.

## 설정 절차

1. Project를 열고 `Configuration` 탭으로 간다.
2. `Project access`에서 기본 `Company` 또는 `Restricted`를 고른다.
3. `Restricted`를 고를 때 필요한 사람과 Agent를 먼저 추가하고 역할을 지정한다.
4. `Save access`를 누른다.
5. 별도 브라우저 프로필의 Operator 계정으로 허용/거절 동작을 확인한다.

이 패널은 Company Owner/Admin만 볼 수 있다. Project 자체의 접근 정책을 수정할 수 있는 권한은 관리자가 소유해야 한다.

## Workplane과의 관계

Project 접근 제어는 Core의 보안 경계다. Workplane plugin은 Lead가 Worker에게 Task를 배정하고, Worker가 원래 Lead Room에 결과를 보고하는 운영 흐름을 담당한다. 둘은 다음처럼 나뉜다.

- Core: 로그인, Company 역할, Project 접근, Task/Issue API 권한
- Workplane plugin: Room, Lead/Worker 위임 규칙, 보고 경로, memory checkpoint

따라서 프로젝트별 설계/구현 레포 경로나 게임·웹·앱별 제작 방식은 이 ACL에 고정하지 않는다. 그런 작업 방식은 plugin 또는 프로젝트 설정으로 확장한다.

## 검증과 배포

로컬에서는 기본 `company` 모드가 가장 안전한 호환성 선택이다. 친구나 외부 사용자를 받기 전에는 인증된 Tailnet 또는 HTTPS 배포를 사용하고, `93-collaboration-deployment-readiness-ko.md`의 2인 브라우저 수락 테스트를 실행한다.

현재 Windows 로컬에서는 실제 API와 UI 렌더링을 확인했다. grant 판정의 데이터베이스 회귀 테스트는 embedded PostgreSQL을 지원하는 Linux CI에서 반드시 다시 실행한다.
