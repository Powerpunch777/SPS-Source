# SPS 제품 모델

갱신: 2026-11-02. [설계 기준](DESIGN-BASELINE-2026-11-02.md)과 사용자 원문을 따른다.
구현·검증 완료 선언이 아니다.

SPS는 사용자별 작업 방식을 Plugin으로 구성하는 범용 워크스테이션 기술 플랫폼이다.
AI 없이도 사용할 수 있으며 특정 회사·프로젝트·Task·Room·조직·메모리를 강제하지 않는다.
Core는 비공개, SDK는 공개를 유지한다.

## 사용자 흐름의 목표

1. 로컬 단독 Host/Workspace를 사용할 수 있다. 원격 Member/Node는 선택적 확장이다.
2. 최초 Workspace는 Agent0/Primary0/Extension0도 정상이다.
3. 필요한 Plugin을 Core 관리에서 검토해 설치하고 Workspace별로 활성화한다.
4. Primary는 기본 진입 UI 선택이며0~1개다. 여러 Extension도 자체 전체 화면·창·헤드리스 동작이 가능하다.
5. 일반 작업 화면은 선택한 Plugin이 구성한다. Core 메뉴·Dashboard·Inbox를 강제로 붙이지 않는다.
6. Core 관리는 트레이·전역 단축키·독립 Settings에서 항상 가능해야 한다.

현재 Google 우선 로그인·일반 단일 Workspace 창과 Source/grant 경로가 위 목표 전부를
충족한다는 뜻은 아니다. 기존 인증·데이터·계정은 문서 정리만으로 변경하지 않는다.

## 구성

| 구성 | 소유 책임 |
| --- | --- |
| Core | 인증·Workspace·Node·Run/Job/Event/Storage·Artifact·보안·설치/업데이트·진단/복구 |
| SDK | 선택형 공개 기술 계약·호환성·개발 도구 |
| Plugin | 실제 업무·프로젝트·화면·역할·협업·기억·도메인 결과 판단 |
| Primary | Workspace 기본 진입 화면의 선택적 지정, 권한 등급 아님 |
| Extension | 기본 진입으로 지정되지 않은 활성 Plugin, UI/기능 수준을 제한하지 않음 |
| Builder | 선택형 공개 범용 제작 Plugin. 외부 IDE/다른 Builder로도 제작 가능 |
| Preview | Builder에 종속되지 않는 공통 격리 개발·테스트 기반 |

개인 외주용 Solution Builder, 게임 제작 Workplane, 웹/앱 제작은 적용 사례다.
별도 Builder의 v15 Lead3·CTO 단일 세션·독립 Dev/QA·GitHub Runner는 해당 워크플로에만 속한다.
서비스 이용자를 개인 외주 제작자만으로 제한하거나 그것을 Core 규칙으로 삼지 않는다.
공개 Marketplace·검사/배지는 별도 후속 설계 범위이고 현재 구현으로 간주하지 않는다.
저작권·판매·수익 배분·Builder/Preview 구체 라이선스는 별도 결정한다.

## 경계와 현재 상태

Host 패키지와 Workspace 데이터/설정/실행을 분리한다. 파일 최대 범위와 작업 폴더는 다르다.
Core Vault·타 Workspace·관리자 권한은 Plugin UI 자유와 무관하게 보호한다.
설정한 파일 범위와 Vault 보호는 OS 실행 경로에 실제 적용해야 하며 현재 동일 사용자
Worker/API 경로 검사만으로 완성되지 않았다. [완료 판정](CORE-COMPLETION-POLICY-ko.md)을 따른다.
지원 OS·전송과 정확한 후보는 [후보 문서](CURRENT-CANDIDATE.md), 검증은 별도 기록으로 판정한다.
