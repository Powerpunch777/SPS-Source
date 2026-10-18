# SPS 플러그인 플랫폼 구현 계획

최종 갱신: 2026-08-02
기준 후보: historical snapshot SPS Desktop `0.4.104` (see `CURRENT-CANDIDATE.md` for the current candidate)
상태: 1~8단계의 계약·패키징·자동 검증과 두 컴퓨터 물리 E2E 기준 통과. 공개 릴리스 게이트는 별도.

## 목표

SPS Core는 게임, 앱, 웹, 플러그인 개발처럼 서로 다른 작업 방식을 강제하지
않는다. Core는 Desktop, Host/Member/Node, Runtime, Workspace Source, plugin
lifecycle, 보안과 실행 기록을 제공하고, Room·Task·역할·메모리·승인·보고는
플러그인이 정의한다.

Marketplace Assistant는 접근 가능한 AI adapter로 검색·비교·추천·제작 brief를
돕는다. 설치나 lifecycle 변경은 수행하지 않는다. Plugin Builder는 외부 plugin
프로젝트를 build·validate·test·preview·pack하고, 실제 설치는 Host가 설정 화면에서
수동으로 한다.

## 1~8단계와 현재 상태

### 1단계: 공개 Runtime SDK와 계약

Profile 2.0, scoped primitive, typed tool, UI bridge, worker context, lifecycle,
Source/Runtime/Run/Artifact 계약을 고정한다.

상태: 완료. SDK `146/146`, Profile 2.0 및 1.0 호환 검증 통과.

### 2단계: Workspace Shell·Dashboard·Inbox 기반

Core shell과 범용 contribution 계약을 제공하되 Paperclip의 Room/Task 의미를
Core에 다시 넣지 않는다. plugin이 필요하면 widget, inbox item, navigation을
기여한다.

상태: packaged Workspace와 baseline navigation 검증 통과. 업무 의미를 가진 화면은
플러그인 범위로 남긴다.

### 3단계: Developer Mode·Local Registry

외부 plugin 프로젝트의 build·validate·test·pack, source/output hash, stage,
Preview와 Last Known Good를 제공한다.

상태: packaged plugin Preview와 package 검증 통과.

### 4단계: 격리 Plugin Preview

production DB, secret, Source path와 분리된 Preview Host/Workspace에서 결과를
확인하고 종료 시 임시 리소스를 정리한다.

상태: packaged Plugin Preview 및 cleanup 통과.

### 5단계: Diagnostics·Test Kit

manifest, capability, worker/run/job/connector 상태와 fixture를 안전한 진단
계약으로 제공한다.

상태: SDK와 Desktop 회귀에 포함되어 통과.

### 6단계: Workspace Job·Plugin Dependency

grant, Node/Runtime 선택, 중복 실행 방지, 취소·retry·blocked·재시작 복구를
Core가 기록하고 dependency 상태를 검증한다.

상태: packaged Host plugin lifecycle 검증 통과.

### 7단계: Marketplace Assistant·Plugin Builder

Core Marketplace는 검증된 catalog를 키워드·카테고리·호환성·검증 상태로 검색한다.
Assistant는 자연어 검색과 추천을 호출하되 plugin 상태를 변경하지 않는다. Builder는
제작과 Preview까지만 담당한다.

상태: 검색/추천, Builder, package 및 Host 수동 lifecycle 경계 검증 통과.

### 8단계: Reference Plugin과 실제 두 컴퓨터 E2E

Host Source를 Host가 선택하고, 승인된 laptop Node가 grant를 통해 CLI를 실행하며,
Host가 route를 철회하면 재실행이 거부되는지 확인한다. 양쪽 재시작 뒤에도 상태를
복구해야 한다.

상태: 완료. run `e0286388-cf8d-4acb-9890-40d8fce1edab`에서 laptop Agy CLI가 Host Source를 `Z:\\`로 사용하고 `SPS_WORKSPACE_PATH=Z:\\`를 통해 Host 파일 marker를 쓰고 읽었다. Source 회수 후 run `e5bec7a5-9324-4479-aea2-834d4dca5730`는 활성 transport route 없음으로 거부되었고 원본 해시는 유지되었다. 양쪽 재시작 후 Node·버전·플러그인·회수 상태가 복구되었다.

## 현재 증거

### 후속 Builder 작업 구조 결정 (2026-10-18)

- Builder Workspace의 AI 구성은 Lead 정확히 1명과 선택적인 Worker 0명 이상이다.
- 사용자는 제작 시작 전에 Lead를 등록하거나 선택하고 필요할 때 Worker를 추가한다.
- Lead는 사용자 대화, 작업 분배, Worker 결과 검토와 통합 보고를 담당한다.
- Worker 없이 Lead만으로 제작을 진행할 수 있다. 작업 분할 방식은 Lead가 판단한다.
- 역할과 위임 규칙은 Builder 플러그인의 책임이다. Core는 공통 실행 기반을 제공한다.
- 구현 예정: Lead 선택 및 대화 화면, Worker 추가·관리, 위임 실행·결과 반환,
  기존 제작 기록·검증·Preview 연결. 아래 historical 검증은 이 후속 흐름의
  구현 완료를 의미하지 않는다.

- Historical snapshot (`0.4.104`): Desktop 테스트 `261/261` 통과, exit 0
- desktop-node 테스트 `39/39` 통과
- 공개 Plugin SDK 테스트 `146/146` 통과
- Historical snapshot (`0.4.104`): 패키징 완료 및 Host/main, Member/laptop 설치 완료
- Installer SHA256 `B58E7EAE15884D4E9B052ED3A15A9B43B340CB83DCAE1EE0D1A71261C974C2C1`, size `255265752`
- 양쪽 app.asar SHA256 `2ECC983D650BBBB51798762A1A4AAFB6B8096AE5073C251CD33FB7C66E34EFEC`
- packaged bootstrap, Workspace, Plugin Preview, Host plugin lifecycle 통과
- 물리 Host Source → laptop Agy CLI 편집, revoke denial, restart recovery 통과

## 완료 판정

자동 테스트와 패키징뿐 아니라 8단계의 실제 Source 실행·철회·재시작 결과도
관찰 기록되었다. 따라서 1~8단계의 제품 구현은 완료로 표시한다. 남은 항목은
베타 사용성 점검과 공개 릴리스 서명·배포 게이트이며, 세부 절차는
[`CORE-DESKTOP-E2E-AUDIT.md`](CORE-DESKTOP-E2E-AUDIT.md)와
[`BETA-ACCEPTANCE-RUNBOOK-ko.md`](BETA-ACCEPTANCE-RUNBOOK-ko.md)에 따른다.
