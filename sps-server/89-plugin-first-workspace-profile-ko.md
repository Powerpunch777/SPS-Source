# 플러그인 우선 Workspace Profile

## 결론

SPS 코어는 특정 개발 방법론을 강제하지 않는다. 코어는 Project, Agent, Task, 권한, 그리고 이름이 자유로운 Project Workspace만 제공한다.

각 조직이 실제로 사용하는 방식은 Workplane 플러그인의 Project별 `Workspace Profile`로 정의한다. 따라서 한 프로젝트는 하나의 저장소만 사용할 수 있고, 다른 프로젝트는 설계/구현 저장소를 나누거나, 연구 폴더와 공유 참조 폴더를 함께 사용할 수 있다.

## 책임 경계

| 계층 | 책임 | 하지 않는 일 |
| --- | --- | --- |
| SPS Core | Project, Workspace CRUD, Agent, Task, 권한, Agent Session | `Design`, `Implementation`, 게임, 웹, 앱 같은 제품별 개념을 고정하지 않음 |
| Plugin SDK | 플러그인이 공식 권한 경로로 Workspace를 읽고 쓰는 중립 API | 플러그인별 라우팅 정책을 판단하지 않음 |
| Workplane Plugin | Workspace Profile, 역할별 기본 Workspace, Lead-to-Worker Task 흐름, Room UI | 코어 데이터베이스나 내부 HTTP 우회에 의존하지 않음 |
| Organization Template | 게임 개발, 웹 제품, 연구팀 등 초기 역할/규칙 프리셋 | Project의 폴더 이름이나 저장소 개수를 강제하지 않음 |

## Workspace Profile 데이터

Profile은 Workplane 플러그인이 Project 범위의 자체 저장소에 보관한다.

```json
{
  "version": 1,
  "configured": true,
  "defaultWorkspaceId": "workspace-id",
  "agentWorkspaceIds": {
    "designer-agent-id": "research-workspace-id",
    "code-worker-agent-id": "build-workspace-id"
  },
  "taskWorkspaceIds": {}
}
```

- Workspace 이름은 사용자 자유 입력이다. `Research`, `Client app`, `Shared wiki`, `Assets`처럼 원하는 이름을 쓴다.
- Agent 기본 위치는 Project마다 다르다. 같은 Code Worker라도 프로젝트 A와 B에서 다른 폴더를 사용할 수 있다.
- Task가 명시적으로 Workspace를 고르면, 설정된 Profile보다 우선한다.
- Profile이 아직 저장되지 않은 기존 Project는 이전 Workspace 선택 규칙을 유지한다. 마이그레이션 때문에 기존 Room이 갑자기 다른 위치로 이동하지 않는다.

## 실행 흐름

1. Owner/Admin이 Project의 Workplane 탭에서 로컬 폴더 또는 저장소를 Workspace로 등록한다.
2. Owner/Admin이 Project 기본 Workspace와 Agent별 기본 Workspace를 저장한다.
3. Room을 열 때 Profile이 먼저 해석되어 오른쪽 Session의 Workspace에 표시된다.
4. Lead가 Worker Task를 만들면, 명시한 Workspace가 있으면 그것을 사용하고, 없으면 Worker의 Project별 기본 Workspace를 사용한다.
5. 실행 시작 시 Workspace Profile은 Room의 도구 컨텍스트에 포함된다. 장기 실행 중에 플러그인 호출 컨텍스트가 사라져도 Task 생성 도구가 안정적으로 같은 라우팅 결정을 사용한다.

## 권한과 협업

- 현재 첫 제품 버전에서는 `agents:configure` 권한을 가진 Owner/Admin만 Profile과 Workspace를 변경한다.
- 다른 멤버는 현재 구성을 읽고 Room과 Task를 정상적으로 사용한다.
- Worker는 Workspace Profile을 수정하거나 Task를 새로 만들 수 없다. Lead만 Task 생성/배정/검토/완료 흐름을 가진다.
- 이후 SPS Core에 Project별 관리 권한이 추가되면, Workplane의 변경 권한만 Project Admin으로 좁히면 된다. Profile 형식과 Room/Task 흐름은 바뀌지 않는다.

## 검증 기록

2026-07-17, 별도 Project `Workplane Workspace Profile E2E 20260717`에서 실제 브라우저 검증을 했다.

- 빈 Project에서 Profile이 없는 상태와 기존 fallback 표시 확인
- `Research and references`, `Build output`이라는 임의 이름의 Workspace 두 개 등록
- Project 기본값을 `Build output`으로 저장
- Designer를 `Research and references`, Code Worker를 `Build output`으로 각각 매핑
- 페이지 새로고침 뒤 매핑 지속 확인
- Designer Room의 Session Workspace가 `Research and references`로 즉시 표시됨
- Code Worker Room의 Session Workspace가 `Build output`으로 즉시 표시됨

## 확장 원칙

새로운 사용 방식은 코어 UI를 포크해서 추가하지 않는다. Workplane Plugin 또는 별도 플러그인이 Profile 스키마와 화면을 추가한다.

예시:

- 소규모 웹팀: `Monorepo` 하나만 등록하고 모든 Agent를 같은 Workspace로 연결
- 게임팀: `Design`, `Unity`, `Art source`, `Shared references`를 별개로 등록
- 연구팀: `Experiments`, `Dataset`, `Paper notes`를 등록하고 문서 Agent와 구현 Agent를 다르게 매핑
- 외부 협업팀: 로컬 폴더 없이 Git 저장소 URL만 참조 Workspace로 등록

이 원칙 덕분에 Workplane은 사용자의 개발 환경에 맞춰 열려 있으면서도, 코어 업데이트를 계속 받을 수 있다.
