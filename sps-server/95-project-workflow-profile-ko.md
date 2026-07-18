# 95. 프로젝트 작업 방식 프로필

## 목적

Workplane의 Core는 사용자, Company, Project, 접근 제어, Agent 실행과 Task 데이터를 제공한다. 프로젝트가 설계 레포와 구현 레포를 나누는지, 단일 레포를 쓰는지, 연구·배포·데이터 작업을 어떻게 나누는지는 Core에 고정하지 않는다.

이 문서는 Room Chat Workplane plugin의 Project별 작업 방식 설정을 정의한다. 게임, 웹, 앱, 연구, 운영 자동화 모두 같은 기본 Lead/Worker 루프를 쓰면서 다른 Workspace와 Task type을 가질 수 있다.

## 고정되는 것과 바뀌는 것

| 계층 | 고정 책임 | Project별로 바뀌는 책임 |
| --- | --- | --- |
| Core | 로그인, Company 역할, Project ACL, Agent/Task API, 실행 런타임 | 없음 |
| Workplane plugin | Agent Room, Lead가 Worker에게 Task를 배정하는 규칙, 원래 Lead Room 보고, checkpoint | 역할 정책, review mode, memory access |
| Project Workflow Profile | 없음 | Workspace, Room 기본 Workspace, Task type별 Workspace 라우팅 |
| Repository | 실제 설계/구현/에셋/문서 | 파일 구조, 빌드, 테스트, Git 규칙 |

## Workspace Profile

Project의 `Workplane > Workspace & task routing`에서 다음을 관리한다.

1. 실제 로컬 폴더나 Git repository를 Project Workspace로 등록한다.
2. 각 Agent Room의 기본 Workspace를 지정할 수 있다.
3. Task type마다 기본 Workspace를 지정할 수 있다.
4. Lead는 특정 Task를 만들 때 이 기본값 대신 다른 Project Workspace를 명시적으로 선택할 수 있다.

Room 기본 Workspace는 긴 대화에서 Agent가 참고할 장소다. Task Workspace는 실제 유한 작업의 파일 경계다. 둘은 독립적이며 Task가 Room 기본 경로를 몰래 덮어쓰지 않는다.

## Task type은 사용자 정의다

이전 호환성을 위해 `design`, `documentation`, `implementation`, `qa`, `art`, `voice`가 처음에는 보인다. 이는 권장 예시일 뿐, 고정된 제품 분류가 아니다.

- 원하는 type을 추가하거나 제거할 수 있다.
- type key는 `research`, `api-contract`, `release`, `data_migration`처럼 소문자 영문·숫자·`-`·`_`만 사용한다.
- 표시 이름은 자유롭게 쓴다.
- Lead의 `paperclip.create_task` 도구는 Project Profile에 등록된 key를 그대로 사용한다.
- 사용자 정의 type은 지정된 Workspace로 라우팅된다.

예시:

| Project | Task type | 기본 Workspace |
| --- | --- | --- |
| 게임 | `level-design` | Obsidian 설계 레포 |
| 게임 | `unity-gameplay` | Unity 구현 레포 |
| 웹 서비스 | `api-contract` | 백엔드 레포 |
| 웹 서비스 | `release` | 운영/배포 레포 |
| 연구 | `literature-review` | 연구 노트 레포 |

기존 `design`과 `documentation` Task는 파일 경로가 없는 문서 작업도 허용한다. 다른 type은 충돌 확인을 위해 영향을 받는 파일 경로를 Task 계약에 선언해야 한다.

## Lead/Worker 흐름은 바뀌지 않는다

Project Workflow Profile은 경로 선택만 바꾼다. 역할 권한은 Organization Workplane policy가 계속 담당한다.

1. 사용자가 Lead Room에서 목표를 논의한다.
2. Lead가 현재 Project의 Task type과 Workspace를 보고 유한 Task를 만든다.
3. Lead가 허용된 Worker에게 배정한다.
4. Worker는 Task Room에서 실행하고 결과 또는 blocker를 남긴다.
5. 결과는 Task를 만든 원래 Lead Room에 보고된다.
6. Lead가 기술적으로 검토하여 완료 또는 재작업을 판단한다. 제품/사용자 승인은 별도다.

Worker에게는 Task type을 새로 만들거나 다른 Worker에게 일을 재배정하는 권한이 없다. 이 경계는 Project의 작업 방식이 달라도 유지된다.

## 제품 확장 원칙

새로운 도메인 기능은 먼저 plugin 설정이나 Project Profile로 만든다. 다음 경우에만 Core 변경을 검토한다.

- 모든 plugin이 같은 보안 경계나 데이터 무결성을 필요로 할 때
- Project ACL, 사용자 권한, 실행 런타임처럼 plugin이 우회하면 안 되는 기능일 때
- 공개 API와 다중 사용자 제품 계약으로 제공해야 할 때

따라서 게임용 Unity/Blender 연결, 웹 배포 흐름, 연구 노트 연결, 전문 이미지·음성 API는 개별 plugin 또는 adapter로 확장한다. Core의 Lead/Worker 권한과 Room/Task 보고 경로를 도메인별 코드에 복제하지 않는다.

## 검증

현재 다음을 확인했다.

- 기존 기본 Task type 라우팅이 계속 동작한다.
- `research` 같은 사용자 정의 type을 Project Profile UI에서 추가하고 Workspace에 저장한 뒤 새로고침 후에도 유지된다.
- 사용자 정의 type이 Lead `create_task` 호출에서 해당 Workspace를 선택한다.
- 전체 Room Chat plugin 빌드와 회귀 검사가 통과한다.
