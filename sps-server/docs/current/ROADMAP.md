# SPS 구현 로드맵

최종 갱신: 2026-07-30

현재 제품 정의는 [PRODUCT-ARCHITECTURE-ko.md](PRODUCT-ARCHITECTURE-ko.md)이며, 자세한 구현
순서는 [CORE-WORKSPACE-PLUGIN-BASELINE-PLAN-ko.md](CORE-WORKSPACE-PLUGIN-BASELINE-PLAN-ko.md)를 따른다.
이 로드맵은 특정 AI 회사 구조를 Core 기능으로 만들지 않는다는 원칙 아래 진행된다.

플러그인 제작 기반의 세부 구현 순서와 완료 Gate는
[PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md](PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md)를 따른다.

## 0단계: 기존 제품을 기준 구조에 맞추기 — 완료

- Company 중심 기본 UI를 Workspace 용어로 바꾸되, 기존 저장소는 일시적인
  마이그레이션 호환 계층으로만 유지한다.
- Paperclip Workplane 탐색과 Experimental 화면을 SPS 기본 Core UI에서 제거한다.
- Core 업무 역할 제어를 중립적인 Workspace 멤버십, Host/Node 신뢰,
  플러그인 전용 실행 Grant로 바꾼다.
- 현재 Project Source UI를 Host 소유의 이름 있는 Workspace Source로 바꾼다.

완료 기준: 새 Workspace에는 Discovery & Builder 플러그인, Host/Member 기술 설정만
있고 내장 Room/Task/역할 흐름이 없다.

## 1단계: Host, Member, Node, Source 기본 루프 — 자동 검증 완료, 물리 장치 확인 대기

- SPS 로그인, Host 생성, 초대, Member 참여, Node 승인/철회, 재시작 복구,
  Tailscale 전용 접근을 검증한다.
- Member가 선택한 로컬 Runtime만 공개하고 Credential은 로컬에 유지한다.
- Host가 여러 Workspace Source를 관리하고 플러그인 전용 Source Grant로 Member가
  편집하게 한다.
- Member 제거 시 활성 접근, Node, Runtime 연결, Grant는 즉시 제거하고 과거 기록은
  보존한다.

완료 기준: 패키지된 Host와 Member Desktop이 실제 Host 프로젝트 Source를 사용해
전체 루프를 완료한다.

## 2단계: 안정적인 플러그인 플랫폼 — 엔지니어링 기준 완료

- Extension Profile, Manifest, 호환성, Capability, 데이터 격리, 마이그레이션,
  실행, Connector, UI 계약을 공개한다.
- 플러그인은 Workspace별로 동작한다. 비활성화는 되돌릴 수 있고, 완전 삭제는
  SPS 내부 데이터만 지우며 프로젝트 폴더는 보존한다.
- 공식 Registry와 로컬 개발 패키지만 제공한다.
- Conformance Test, Test Kit, 패키지 검사, 단계적 업데이트, Rollback, Backup,
  Diagnostics를 만든다.

완료 기준: 플러그인 작성자가 SPS Core를 수정하지 않고 외부 폴더에서 개발, 검사,
설치, 활성화, 비활성화, 업데이트, 복구, 삭제를 할 수 있다.

## 3단계: 기본 Discovery & Builder 플러그인 — 완료

- 새 Workspace에서 유일한 기본 활성 플러그인으로 만든다.
- 첫 Assistant에 Host가 선택한 Runtime을 필수로 연결한다.
- Catalog 검색과 플러그인 설계 도구만 제공하고 자동 설치/활성화는 하지 않는다.
- 생명주기 변경은 `설정 > 플러그인`의 명시적 행동으로 연결한다.

완료 기준: 빈 Workspace에서 원하는 작업 방식을 설명하면 숨겨진 Workplane 없이
안전한 추천이나 플러그인 설계를 받을 수 있다.

## 4단계: 베타 준비 — 다음 단계

- Core가 범용 Workspace Shell, Dashboard, Inbox를 제공하고 플러그인이 위젯,
  보고, 행동, 탐색 구성을 제공하는 계약을 구현한다. 상세 기준은
  [WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md](WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md)를 따른다.
- Host와 Member의 패키지된 Desktop 사용성과 안정성을 전체 점검한다.
- 업데이트 호환성, 플러그인 마이그레이션 검토, 백업/복원, 삭제, Node/Source 철회,
  네트워크 중단 후 재시도와 진단을 시험한다. SPS 1차 버전은 오프라인 제품 모드를
  제공하지 않는다.
- Windows/Tailscale 지원 범위, 알려진 제한, 개인정보와 백업 안내, 출시 점검표를
  공개한다.

완료 기준: 소규모 비공개 베타 사용자가 개발자 콘솔 없이 독립 Workspace를 만들고,
안전하게 Host에 참여해 공식/로컬 플러그인을 사용할 수 있다.

## 베타 이후

- 커뮤니티 게시, 제3자 Registry, 신뢰/평판, Marketplace 검토 과정
- Access Control, Team Workplane, Memory Provider, Game, Web, App,
  Plugin Development Pack 같은 선택형 공식 작업 플러그인
- 추가 운영체제와 승인된 네트워크 방식
