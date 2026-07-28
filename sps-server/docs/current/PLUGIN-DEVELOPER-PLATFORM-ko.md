# SPS Plugin Developer Platform

공개 SDK의 단일 원본은 [`Powerpunch777/sps-plugin-sdk`](https://github.com/Powerpunch777/sps-plugin-sdk)다.
SPS Desktop도 이 SDK의 고정된 revision을 사용하며, 별도 내부 복제본을 제품 계약으로 취급하지 않는다.

SPS Core는 플러그인 제작자가 반복 인프라를 새로 만들지 않도록 Plugin Developer Platform을 제공한다.

## Core SDK

| 제공물 | 플러그인에서 사용하는 목적 |
| --- | --- |
| Manifest schema | 이름, 버전, 의존성, 설정, UI, tool, job, Connector 선언 |
| Data scopes | Company, Agent, Thread, Run, Artifact, Store 범위 상태 저장 |
| UI SDK | 메뉴, 설정 탭, panel, modal, 공통 디자인 token |
| Agent Tool SDK | AI가 호출할 typed tool 등록과 결과 전달 |
| Event and Job SDK | event 구독, durable job, 재시작 복구, 상태 보고 |
| Artifact API | 첨부, 생성 파일, 실행 로그, 결과물 연결 |
| Backend and Node API | Agent 실행기, Node, Runner 상태와 command 기록 |
| Connector SDK | MCP, OAuth, HTTP API, CLI 연결 |
| Catalog API | Marketplace 검색과 package metadata 조회 |
| Test Kit | mock Company/Agent/Node, lifecycle, UI, tool 회귀 검사 |
| Authoring CLI | init, validate, test, pack, inspect, local publish |

## 제작 흐름

```text
plugin init
  -> manifest와 최소 worker/UI 생성
  -> Core SDK 기능 추가
  -> local test와 lifecycle 검사
  -> package 생성
  -> Catalog/Registry release 등록
  -> Settings > Plugins에서 설치·활성화
```

`Plugin Discovery & Builder`는 이 흐름을 Agent 대화로 도울 수 있지만, SDK와 CLI는 사람 개발자가 단독으로도 사용 가능해야 한다.

## 기술 선언과 사람 권한

Manifest의 capability 선언은 플러그인이 사용할 수 있는 기술 인터페이스를 설명한다. 예를 들어 UI 등록, job 실행, Catalog 읽기, Connector 사용 여부를 선언한다.

사람이 그 기능을 사용할 수 있는지는 Core가 정하지 않는다. Access Control 같은 정책 플러그인과 실제 업무 플러그인이 결정한다.

## 호환성

현재 SDK와 일부 패키지는 Paperclip manifest·runtime 호환 필드를 포함한다. 이 필드는 이행을 위한 compatibility bridge다. 새 SPS SDK의 공개 계약은 Paperclip 이름이나 특정 Workplane을 요구하지 않아야 한다.
