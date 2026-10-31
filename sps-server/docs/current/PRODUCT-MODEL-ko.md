# SPS 제품 모델

최종 갱신: 2026-11-01

이 문서의 현재 범위는 [Core 완성 정책](CORE-COMPLETION-POLICY-ko.md)을 따른다.
제품 모델 설명은 구현·검증 완료 선언이 아니다.

SPS는 개인·팀·기업별로 필요한 프로그램을 Plugin으로 구성하는 범용 워크스테이션
기반이다. AI는 필수가 아니며 일반 UI·데이터·고정 규칙 자동화도 제품 범위다.
현재 지원 클라이언트는 Windows Desktop이고 기업 배포의 운영·격리 검증은 별도다.
처음부터 특정 회사 조직도, Task 보드, Room, Agent, 역할, 메모리 방식을 강제하지 않는다.

Core는 비공개, Plugin SDK는 공개를 유지한다. 초기 실증은 게임 개발 워크스테이션,
사업 방향은 고객별 Plugin 제작·납품과 공통 기술 재사용이다. 자체 제작·검토·승인한
Plugin을 운영하며 공개 Marketplace나 외부 개발자의 자유로운 게시·판매·커뮤니티
유통은 제공하지 않는다. 내부 Registry와 패키지 검증·승인·관리는 유지한다.

## 시작점

1. 사용자는 SPS Desktop에서 Host를 만들거나 기존 Host에 참여한다.
2. 새 Workspace는 중립 상태로 시작한다.
   Agent 없는 상태도 유효하며, 선택된 사용 가능한 Shell이 없으면 독립 빈 화면을
   제공한다. 특정 Plugin이나 Builder의 활성화를 Core가 필수로 요구하지 않는다.
3. 필요한 승인 Plugin의 실제 설치, 활성화, 업데이트, 비활성화·제거는 Host가
   **설정 > 플러그인**에서 패키지와 권한을 검토하고 명시적으로 결정한다.
4. AI가 필요한 경우에만 기존 권한 계약에 따라 모델 API·승인된 CLI·외부 Agent
   세션 중 필요한 경로를 사용한다. AI 없이도 일반 Plugin을 운영·관리할 수 있어야 한다.

공개 탐색·추천과 Marketplace Assistant는 제품의 정상 시작 경로에서 철회됐다.
내부 Registry·패키지 검증은 공개 Marketplace와 구분하며, Plugin이나 대화가
Host의 설치·활성화 승인 및 실행 권한 검사를 대신하지 않는다.

## 제품의 두 층

### SPS Core

Core는 Desktop, Host/Member/Node 연결, Workspace Source, 선택적 AI Runtime,
실행 기록, Artifact, 데이터·설정·권한, 보안 저장소, 백업, 업데이트, 진단,
내부 Registry와 플러그인 수명주기처럼 여러 작업 방식에서 공통으로 필요한
기술 기반을 제공한다. 업무 흐름·조직·역할·대화 정책은 강제하지 않는다.

AI 실행은 모델 API·승인된 CLI·외부 Agent 세션 중 필요한 경로만 선택한다.
OCE는 선택적인 별도 Agent 관리·배포 Connector이며 모델 공급자나 Core 필수 요소가
아니다. 기존 실행 API를 재사용하고 신규 Port는 실제 간극이 있을 때만 추가한다.
보호 미지원은 명시적으로 거부하며 기존 Workspace scope를 OS 격리로 표시하지 않는다.

### Plugin

Plugin은 실제 작업 방식을 정의한다. 예를 들어 게임 제작 Workplane은 Room, Task,
Lead/Worker, 리뷰, 장기기억을 만들 수 있고, 웹 개발 Plugin은 전혀 다른 화면과
규칙을 만들 수 있다. 이런 업무 의미는 Core의 기본 규칙이 아니다.

2026-11-01 사용자 승인으로 `Plugin Builder`는 별도 공개 저장소
[`Powerpunch777/SPS-MY-PluginBuilder`](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)와
작업 폴더에서 v15 설계에 따라 병행 개발한다. 고정된 공개 SDK를 사용하며 비공개
Core 소스·사용자 데이터·자격증명을 복사하지 않는다. Builder 신규 기능은 Core
완성 목표·선행조건에 포함하지 않고, Core 필수 검증이나 미해결 실패를 대체하지 않는다.
Builder 없이도 Core와 기존 SDK만으로 승인 Plugin을 설치·실행·관리할 수 있어야 한다.

## 용어

| 용어 | 의미 |
| --- | --- |
| Host | Workspace와 공유 Source를 관리하는 기술적 기준 컴퓨터 |
| Member | Host에 참여해 허용된 도구와 Node를 사용할 수 있는 사용자 |
| Node | 특정 컴퓨터의 CLI, 로컬 AI, 연결 도구를 SPS에 제공하는 실행 지점 |
| Workspace Source | Host가 선택한 프로젝트 폴더에 대한 보호된 접근 경로 |
| Plugin | SPS 위에 실제 업무 흐름과 UI를 추가하는 독립 패키지 |

Host와 Member는 기술 연결 역할일 뿐 회사의 상하 관계를 뜻하지 않는다. 어떤
사람이나 AI가 어떤 일을 할지는 선택한 Plugin이 결정한다.

## 지원 범위

- 첫 번째 지원 대상은 Windows 10/11 x64와 Tailscale 기반의 Host/Member 연결이다.
- SPS는 Desktop-first 제품이다. 일반 브라우저는 Workspace 사용 경로가 아니다.
- 공식 Registry와 개인 Local Development Registry를 모두 지원하는 방향이다.
- 커뮤니티 판매, 결제, 공개 업로드 Marketplace는 제공하지 않는다.

Source `9e903d3`의 Windows·legacy recovery·물리 Runner 검증은 아직 미통과다.
진행 중인 CI나 Builder 개발 결과를 Core 완료 근거로 계산하지 않는다. 현재 근거와
남은 필수 항목은 [최종 검증 기록](CORE-FINAL-VALIDATION-2026-10-30.md)을 따른다.

세부 제품 계약은 [PRODUCT-ARCHITECTURE-ko.md](PRODUCT-ARCHITECTURE-ko.md)를
따른다.

다중 백엔드 전환의 재사용/권한/원격 파일/첫 구현 범위는
[MULTI-BACKEND-WORKSTATION-PLAN-ko.md](MULTI-BACKEND-WORKSTATION-PLAN-ko.md)를 따른다.
