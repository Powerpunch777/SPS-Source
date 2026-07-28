# SPS Access Control Plugin

> 상태: 목표 구조. Core에 사람 역할을 넣지 않는다.

협업이 필요한 Company는 Access Control 플러그인을 선택해 활성화할 수 있다. 기본 SPS Access Control 플러그인은 다음 역할을 제공한다.

| 역할 | 기본 의미 |
| --- | --- |
| Viewer | 읽기 전용 |
| Operator | 허용된 Agent 사용과 자신의 외부 도구 연결 |
| Admin | 사용자, Agent, Node, 공용 도구 등 대부분의 팀 운영 설정 |
| Owner | 서버 생성자. Host project source, 플러그인, 이전, 삭제를 포함한 전체 관리 |

이 역할 이름과 정책은 SPS 기본 Access 플러그인의 선택일 뿐이다. 다른 Access 플러그인은 다른 역할과 접근 모델을 제공할 수 있다.

## 분리된 세 가지 판단

1. 사용자가 어떤 Agent를 사용할 수 있는가
2. Agent가 어느 Node/Runner에서 실행되는가
3. 어떤 Workplane이 Room, Task, 검토 흐름을 제공하는가

이 셋을 하나의 `role` 필드로 합치지 않는다. Access Control은 첫 번째를, Node 실행 배치 플러그인 또는 Core backend binding은 두 번째를, Workplane은 세 번째를 담당한다.

## 활성화 시점

혼자 쓰는 새 Company에는 사람이 한 명이고 Project도 없으므로 권한 플러그인이 필수는 아니다. 팀원을 초대하거나 공유 Agent·Node·Project 정책이 필요해질 때 활성화한다.
