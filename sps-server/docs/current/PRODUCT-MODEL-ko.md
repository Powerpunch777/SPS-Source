# SPS Product Model

최종 갱신: 2026-07-28

## 한 문장

SPS는 Agent, 실행기, 플러그인을 조합해 개인과 팀이 자기만의 AI 작업환경을 만드는 Desktop-first 플랫폼이다.

## 새 Company의 시작

```text
SPS Desktop 로그인
  -> 서버 만들기 또는 서버 참여
  -> 새 서버라면 빈 Company 생성
  -> Agent 한 명 연결 및 실행 확인 (필수)
  -> Plugin Discovery & Builder 활성화
  -> Company Workspace 열기
```

새 Company에는 Project, 역할 조직, Room/Task, 권한 정책, Memory 전략이 기본 생성되지 않는다. 처음에는 Company 컨테이너, 연결한 Agent 한 명, `Plugin Discovery & Builder`, `Settings > Plugins`만 준비된다.

첫 Agent는 특정 모델이나 제공자를 강제하지 않는다. Codex CLI, Agy CLI, 로컬 AI, API Backend 등 연결 가능한 실행기를 사용할 수 있다.

## Core와 플러그인의 경계

SPS Core는 플러그인을 만들고 실행하고 유지하기 위한 공통 기반이다.

| Core가 제공하는 것 | 플러그인이 정하는 것 |
| --- | --- |
| Desktop/Host, backup, update | 사람 역할과 접근 정책 |
| 로그인 identity와 device identity | Room, Task, Lead/Worker 같은 업무 모델 |
| Company, Agent, Backend, Node, Runner registry | Project 화면, 상태, 보고·검토 흐름 |
| Thread, Run, Artifact, event, Store primitive | 게임·앱·웹·플러그인 개발 분야 |
| extension runtime, SDK, diagnostics | Memory 수집·검색·요약·승인 전략 |
| `Settings > Plugins`, Catalog, lifecycle 기록 | Connector와 외부 도구의 업무 규칙 |

Core는 사람 권한을 보유하지 않는다. 다만 플러그인 manifest에 선언되지 않은 데이터 API, UI surface, job, Connector, 파일·Node API에는 접근할 수 없도록 기술적으로 격리한다. 이 격리 계약은 사람의 업무 권한 정책과 다르다.

## Plugin Discovery & Builder

첫 Company에 활성화되는 기본 플러그인이다. 연결한 첫 Agent에게 다음 기능을 제공한다.

- 사용자 목표와 Company 상태를 대화로 이해
- Catalog에서 플러그인과 Development Pack 검색·비교·추천
- 없는 기능의 플러그인 설계, source workspace, manifest, UI, tool, test 초안 작성
- 생성물 검사, 패키지 준비, 문서 초안 작성

Agent는 대화 맥락에 따라 검색·제작·플러그인 lifecycle 도구를 사용할지 판단한다. 추천 항목을 선택하는 UI는 설치, 활성화, 업데이트 같은 side effect를 자동으로 호출하지 않는다.

## Settings > Plugins와 Catalog

Marketplace는 별도 플러그인이 아니라 Core의 `Settings > Plugins` 안에 있는 Catalog 탐색 영역이다. 이 화면에서 활성 플러그인, Catalog source, 패키지 설명·제작자·버전·호환성·라이선스·manifest, 설치·활성화·비활성화·업데이트·롤백·제거 기록을 확인한다.

초기에는 신뢰한 source와 공식 source만 제공한다. 공개 커뮤니티 판매, 결제, 세금, 환불, 평점은 출시 범위가 아니다.

## 협업과 선택형 확장

협업이 필요해지면 다음 플러그인을 필요한 조합으로 추가한다.

| 확장 | 책임 |
| --- | --- |
| Access Control | 사람 역할, 사용자 -> Agent/Project 접근, Node 운영 정책 |
| Team Workplane | Room, Task, Lead/Worker, 보고·검토 흐름 |
| Memory Provider | 기억 수집, 검색, 요약, 승인 후보 |
| Connector | MCP, OAuth, HTTP API, CLI, 외부 도구 연결 |
| Development Pack | 게임·앱·웹별 Agent 템플릿, 도구, 문서, 작업 방식 |

SPS 기본 Access Control 플러그인은 Viewer(읽기), Operator(허용된 Agent와 자신의 외부 도구), Admin(대부분의 팀 운영 설정), Owner(Host project source·플러그인·소유권 이전·삭제 포함 전체 관리)를 제공하는 것을 목표로 한다. 다른 Access 플러그인은 다른 역할 모델을 제공할 수 있다.

## 제품 상태와 제외 범위

| 범위 | 상태 |
| --- | --- |
| Desktop Host, Agent registry, Node/Runner, 실행 기록 | 구현·검증 진행 중 |
| 플러그인 manifest, 상태, worker, UI slot, Registry 검사 | 구현되어 있으나 SPS SDK로 정리 중 |
| Plugin Discovery & Builder 기본 경험 | 목표 |
| Access Control, Workplane, Memory Provider | 목표 또는 선택형 확장 |
| 공개 커뮤니티 Marketplace와 판매·정산 | 제품 방향만 정의, 출시 범위 아님 |

SPS Core는 특정 AI 제공자, 특정 모델, 특정 회사 조직, 특정 개발 분야, 자동 플러그인 설치를 강제하지 않는다.
