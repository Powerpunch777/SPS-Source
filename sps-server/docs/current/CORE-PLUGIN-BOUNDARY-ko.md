# SPS Core and Plugin Boundary

## Core는 무엇인가

SPS Core는 플러그인을 만들고 실행하고 유지하기 위한 공통 기반이다. Core는 사용자가 어떤 방식으로 일해야 하는지 결정하지 않는다.

```text
SPS Core
  ├─ Desktop / Host / backup / update
  ├─ signed-in identity and device identity
  ├─ Company container
  ├─ Agent, Backend, Node, Runner registry
  ├─ Thread, Run, Artifact, event, Store primitives
  ├─ extension runtime and SDK
  ├─ Settings > Plugins lifecycle and Catalog
  └─ diagnostics and audit records
```

Core는 다음을 제품 규칙으로 알지 않는다.

- Owner, Admin, Operator, Viewer
- Room, Task, Lead, Worker
- Project의 화면·상태·작업 방식
- 게임, 앱, 웹, 플러그인 개발 분야
- 어떤 Agent를 누가 사용할 수 있는지
- 장기기억의 검색·요약·승인 방식

## 플러그인이 하는 일

플러그인은 사용자에게 보이는 업무 경험과 그 경험의 정책을 가진다.

| 플러그인 종류 | 예시 책임 |
| --- | --- |
| Discovery & Builder | Catalog 검색, 플러그인 추천·설계·제작 |
| Access Control | 사람 역할, Agent 접근, Project 접근, Node 운영 규칙 |
| Workplane | Room, Task, Lead/Worker, 보고·검토 흐름 |
| Memory Provider | 기억 수집, 검색, 요약, 승인 후보 |
| Connector | MCP, OAuth, API, CLI, 외부 도구 연결 |
| Development Pack | 게임·앱·웹별 Agent 템플릿, 도구, 문서, 작업 방식 |

## 권한이 없는 Core

Core는 사람 역할 정책을 보유하지 않는다. 로그인한 사용자와 호출한 플러그인의 identity·scope를 전달하고, 플러그인이 정한 정책을 실행 흐름에 적용할 수 있는 중립적인 호출 통로만 제공한다.

이것은 Core가 플러그인에 무제한 OS 접근을 주는 뜻이 아니다. Core는 플러그인 manifest에 선언되지 않은 데이터 API, UI surface, background job, Connector, 파일·Node API를 제공하지 않는다. 이것은 플러그인 격리를 위한 기술 계약이며, 사람의 업무 권한 정책과는 다른 문제다.

## Marketplace 위치

Marketplace는 독립 플러그인이 아니다. Core의 `Settings > Plugins` 화면 안에서 설치된 플러그인, 연결된 Catalog source, 업데이트, 롤백을 관리한다.

Core는 `marketplace.search`와 같은 읽기 전용 Catalog API를 플러그인에 제공한다. `Plugin Discovery & Builder`는 그 API를 Agent tool로 노출해 대화 중 검색을 수행한다.

## 현재 호환 코드

현재 저장소에는 Paperclip compatibility API와 기존 Team Workplane 구현이 남아 있다. 이는 이행 중인 구현 기반이며 SPS 제품의 영구 Core 모델이 아니다. 새로운 기능은 이 문서의 중립 primitive와 SDK 경계를 향해 추가한다.
