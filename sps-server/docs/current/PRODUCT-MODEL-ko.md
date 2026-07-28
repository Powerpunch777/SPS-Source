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

SPS Desktop은 설치본 하나만 제공한다. 로그인 뒤 `서버 만들기`를 선택한 컴퓨터는 Host가 되고,
`서버 참여`를 선택한 컴퓨터는 Member Node로 연결된다. Host와 Member는 다른 설치본이나 다른
업데이트 채널을 사용하지 않는다.

새 Company에는 Project, 역할 조직, Room/Task, 권한 정책, Memory 전략이 기본 생성되지 않는다. 처음에는 Company 컨테이너, 연결한 Agent 한 명, `Plugin Discovery & Builder`, `Settings > Plugins`만 준비된다.

첫 Agent는 특정 모델이나 제공자를 강제하지 않는다. Codex CLI, Agy CLI, 로컬 AI, API Backend 등 연결 가능한 실행기를 사용할 수 있다.

## Host Owner와 하위 역할

서버를 만든 계정은 Core의 유일한 `Host Owner`다. Host Owner는 Host 데이터, device pairing,
Owner Vault, 서버 이전·삭제처럼 플랫폼 자체를 유지하는 기술적 책임을 가진다. 이 책임은 플러그인이
없어도 존재하며, 다른 사용자에게 일반 업무 권한으로 위임되지 않는다.

사람의 업무 역할은 플러그인이 만든다. 기본 Access Control 플러그인은 Host Owner 아래에
Viewer, Operator, Admin 같은 하위 역할을 제공할 수 있고, 다른 플러그인은 다른 역할 모델을
제공할 수 있다. 어떤 플러그인 역할도 Host Owner의 Host 데이터와 서버 소유권을 우회할 수 없다.

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

Owner Host에 기본으로 로드되는 tool provider다. 연결한 Agent에게 다음 기능을 제공한다.

- 사용자 목표와 Company 상태를 대화로 이해
- Catalog에서 플러그인과 Development Pack 검색·비교·추천
- 없는 기능의 플러그인 설계, manifest와 capability, 검증 계획 초안 작성
- 공식 Registry의 검증된 공개 metadata만 읽고, 로컬에 신뢰된 Catalog snapshot만 사용

Discovery의 두 tool은 검색과 설계 초안만 제공한다. 파일 생성, package 설치, 활성화, 업데이트, 제거, Company 변경을 호출하지 않는다. Agent는 대화 맥락에 따라 다른 사용 가능한 도구를 사용할지 판단할 수 있지만, 추천 항목을 선택하는 UI는 설치, 활성화, 업데이트 같은 side effect를 자동으로 호출하지 않는다.

현재 Core의 번들 plugin lifecycle은 Owner Host 단위다. 따라서 Discovery도 같은 Host의 Company에 공통으로 보인다. Company별 기본 활성화·비활성화는 Core가 Company-scoped plugin lifecycle을 제공할 때 구현한다.

## Settings > Plugins와 Catalog

Marketplace는 별도 플러그인이 아니라 Core의 `Settings > Plugins` 안에 있는 Catalog 탐색 영역이다. 이 화면에서 활성 플러그인, Catalog source, 패키지 설명·제작자·버전·호환성·라이선스·manifest, 설치·활성화·비활성화·업데이트·롤백·제거 기록을 확인한다.

첫 출시에서는 SPS가 서명한 공식 Registry와 사용자가 자신의 컴퓨터에서 제작한 local development
package만 사용한다. 제3자 Registry, 공개 커뮤니티 공유, 판매, 결제, 세금, 환불, 평점은 출시 범위가 아니다.

## 협업과 선택형 확장

협업이 필요해지면 다음 플러그인을 필요한 조합으로 추가한다.

| 확장 | 책임 |
| --- | --- |
| Access Control | 사람 역할, 사용자 -> Agent/Project 접근, Node 운영 정책 |
| Team Workplane | Room, Task, Lead/Worker, 보고·검토 흐름 |
| Memory Provider | 기억 수집, 검색, 요약, 승인 후보 |
| Connector | MCP, OAuth, HTTP API, CLI, 외부 도구 연결 |
| Development Pack | 게임·앱·웹별 Agent 템플릿, 도구, 문서, 작업 방식 |

SPS 기본 Access Control 플러그인은 Viewer(읽기), Operator(허용된 Agent와 자신의 외부 도구), Admin(대부분의 팀 운영 설정)을 제공하는 것을 목표로 한다. Host Owner는 이 플러그인의 역할이 아니라 Core의 기술적 서버 소유자다. 다른 Access 플러그인은 다른 하위 역할 모델을 제공할 수 있다.

## 지원 범위와 데이터 위치

첫 출시는 Windows 10/11 x64 Desktop만 공식 지원한다. 서로 다른 컴퓨터의 Host와 Member Node 연결은
Tailscale을 필수 전제로 한다. Host PC는 이전 로그인 상태와 로컬 데이터를 사용해 단독 작업을 계속할
수 있지만, 새 로그인, 초대, 원격 Node 연결에는 네트워크 연결이 필요하다.

Company, 실행 기록, Artifact, Memory index, plugin configuration, project source mapping은 Host PC에
저장한다. SPS Identity는 로그인과 초대·연결 보조를 맡지만 Company 작업 데이터를 보관하는 중앙 저장소가
아니다. Host Owner는 암호화된 수동 backup을 내보내 새 Host 또는 복구 환경에 restore할 수 있다.

## 제품 상태와 제외 범위

| 범위 | 상태 |
| --- | --- |
| Desktop Host, Agent registry, Node/Runner, 실행 기록 | 구현·검증 진행 중 |
| 플러그인 manifest, 상태, worker, UI slot, Registry 검사 | 구현되어 있으나 SPS SDK로 정리 중 |
| Plugin Discovery & Builder 검색·초안 tool provider | 구현·패키지 런타임 smoke 검증 완료 |
| Company별 plugin lifecycle | Core 설계 대기 |
| Access Control, Workplane, Memory Provider | 목표 또는 선택형 확장 |
| 공개 커뮤니티 Marketplace와 판매·정산 | 제품 방향만 정의, 출시 범위 아님 |

SPS Core는 특정 AI 제공자, 특정 모델, 특정 회사 조직, 특정 개발 분야, 자동 플러그인 설치를 강제하지 않는다.
