# SPS Core와 플러그인 기준 구현 계획

최종 갱신: 2026-07-30

## 목표

SPS는 특정 AI 회사 구조나 개발 방식이 아니라, 여러 방식의 AI 작업 환경을 플러그인으로 구성할 수 있는 Windows Desktop-first 플랫폼이다. Core는 기술 기반을 제공하고, Room, Task, 역할, 메모리, 승인 절차와 프로젝트 방식은 플러그인이 정의한다.

기존 Paperclip의 데이터와 호환 경로는 마이그레이션을 위해 남을 수 있다. 그러나 새 SPS 기본 화면과 공개 SDK는 Paperclip의 Company, Issue, Agent, Room, Task 모델을 전제로 삼지 않는다.

## 확정된 제품 경계

| 구분 | Core | 플러그인 |
| --- | --- | --- |
| 작업 방식 | 정의하지 않음 | Room, Task, 역할, 보고, 승인, 메모리 |
| 컴퓨터 | Host, Member, Node, Tailscale, Desktop 수명주기 | 특정 작업에 어떤 Node와 Runtime을 쓸지 결정 |
| AI 실행 | Runtime 발견, Node 상태, 실행 기록과 기술적 경계 | Agent/Worker/봇의 의미와 실행 규칙 |
| 파일 | Host가 선택한 Workspace Source, 암호화된 Node route | Source를 프로젝트나 작업 범위에 연결하는 규칙 |
| 플러그인 | 서명, 호환성, stage, 활성화, 비활성화, 삭제, 로그 | 고유 데이터, UI, 도구, 자동화, 정책 |
| 보안 | Secret handle, Node credential 격리, 위험한 기술 동작의 확인 기반 | 승인 주체와 업무상 승인 기준 |

`Host`는 물리적인 SPS 서버 컴퓨터를 뜻한다. 직무나 조직상 소유권을 뜻하지 않는다. 플러그인은 필요하면 Lead, Worker, Reviewer 같은 역할을 독립적으로 만든다.

## 기본 Workspace

새 Workspace에는 **Plugin Discovery & Builder**만 기본 활성화된다.
Workspace는 처음에 Assistant 없이 시작하며, 사용자가 기존 CLI, 로컬 AI,
API Connector 중 하나를 골라 Initial Assistant를 등록한 뒤에 Discovery
대화를 시작할 수 있다.

Discovery Assistant는 검색, 추천, 초안 작성만 한다. 플러그인의 설치, 활성화, 업데이트, 비활성화, 삭제는 항상 `설정 > 플러그인`에서 사용자가 명시적으로 수행한다.

## Host, Member, Node, Runtime

- Host 하나는 여러 Workspace를 가질 수 있다.
- Member는 Workspace에 참가한 SPS 계정이다.
- Node는 Member가 사용하는 Desktop 컴퓨터다. Member 하나가 여러 Node를 가질 수 있다.
- Runtime은 Node 소유자가 SPS에 공개하기로 선택한 CLI, 로컬 모델, API 또는 Connector다.
- API 키, 로그인 토큰, CLI 홈 폴더, 로컬 경로는 해당 Node 밖으로 나가지 않는다.
- Host는 Node를 확인하거나 철회할 수 있다. Member를 제거하면 Node, Runtime 공개, 관련 grant는 즉시 철회되지만 과거 작업 기록은 보존한다.

첫 출시 대상은 Windows 10/11 x64이며 팀 연결에는 Tailscale을 사용한다. 일반 브라우저 직접 접근은 제품 사용 경로가 아니며, Desktop이 local Host를 열고 보호한다.

## Workspace Source

Workspace Source는 Host가 고른 로컬 폴더를 나타내는 **이름 있는 불투명 핸들**이다.

1. Host가 Desktop에서 로컬 폴더를 선택한다.
2. Core는 Source ID, 표시 이름, 상태만 관리한다. Host의 실제 로컬 경로는 Host Desktop에만 저장된다.
3. Host가 팀 공유를 필요로 할 때만 Tailscale Windows share route를 연결한다.
4. Node grant에는 대상 Node의 공개키로 암호화한 접근 credential만 저장한다. Core는 이 credential을 복호화하지 못한다.
5. 플러그인은 Source ID만 참조하고, 프로젝트 또는 작업별 세부 범위는 자체 규칙으로 정한다.

따라서 Guest/Member는 자기 컴퓨터의 폴더를 Workspace Source로 지정하거나 Host의 경로를 바꾸지 못한다. Host Vault를 옮겼을 때 Source 핸들이 먼저 복원되어도, 새 Host가 명시적으로 로컬 폴더를 선택하기 전에는 경로가 없는 상태로 남는다.

## 플러그인 표준

공개 SDK는 Extension Profile을 사용한다.

- Profile `1.0`: 기존 Paperclip 호환 플러그인을 위한 이전 계약
- Profile `2.0`: SPS의 작업 방식 중립 계약

새 플러그인의 기본 계약은 Profile `2.0`이며, Desktop은 기존 번들을 위해 두 Profile을 병행 지원한다. Profile `2.0`의 public primitive vocabulary는 다음과 같다.

- `workspace.sources.metadata`
- `workspace.sources.route`
- `runtimes.list`
- `runtimes.dispatch`
- `runs.observe`
- `artifacts.write`
- `secrets.use`

플러그인은 필요한 primitive를 선언하지만, 선언 자체가 권한을 부여하지는 않는다. Core는 설치 전 정적 manifest, 호환성, capability를 검증하고, 실제 Source route나 Runtime 실행은 활성 상태와 해당 Node의 기술적 준비 상태를 다시 확인한다.

## 현재 구현 상태

완료:

- Core 기본 화면에서 Paperclip의 Tasks, Projects, Inbox, Agents, Experimental 기본 메뉴를 숨김
- Extension Profile `2.0` SDK와 `1.0`/`2.0` Desktop 호환성
- Profile `2.0` primitive와 실제 Core capability의 정적 일치 검증
- Workspace Source DB 모델, Host 전용 API, 선택적 transport route, Node별 암호화 grant
- Desktop의 Host 로컬 폴더 매핑과 Core Source 핸들 동기화
- 플러그인 주체, Node, Runtime, Source를 연결하는 workflow-neutral execution grant
- grant 기반 `workspace.sources.route`, Runtime dispatch, run event 관찰, plugin 격리 artifact 기록
- 기본 Plugin Discovery & Builder 번들, 공식 Catalog의 읽기 전용 검색/초안 도구
- 역할과 보고선을 만들지 않는 초기 Assistant 등록 화면과 Discovery 소유 대화/기록
- 기존 Agent 대시보드를 노출하지 않고 Runtime 구성만 제공하는 Core Assistant 상세 화면
- 새 Workspace에 사용 가능한 Assistant가 없을 때 초기 Assistant 등록을 먼저 요구하는 Core 경로
- 실제 Google 계정 두 개를 사용한 Host 생성, Member 참가, Node 승인, 재시작 복구
- 플러그인 stage, 서명, 호환성, 활성화/비활성화/삭제와 release baseline 검증
- 최신 Windows `win-unpacked` 후보의 실제 Electron 로그인 화면과 번들 Owner Host 런타임 스모크
- Baseline 모드에서 remote legacy instance-admin이 직접 Plugin 또는 legacy access-admin API를 호출해도 통과하지 못하도록, 공통 Core 기술 관리 경계를 물리적 Host 증명으로 통일
- 원격 세션·Board API Key·내부 권한 서비스가 이전 `instance_admin` DB 행을 다시 권한으로 쓰지 않도록 Baseline에서 일괄 무효화하고, Electron의 loopback 2단계 증명은 Host 기술 API에만 전달
- Owner Host 런타임의 일반 파일과 `node_modules`를 독립 패키지 리소스로 검증하고, 배포 메타데이터 생성 전에 완전성 검사를 실행

진행 중:

- 실제 앱에서 Team 초대 생성/복사/취소, Member 제거, Source 선택/공유와 generic plugin run을 연속 조작하는 최종 E2E
- Host Vault 백업/복구, 설치본 교체와 자동 업데이트의 최종 배포 후보 검증
- 모든 Core 화면의 empty/loading/failure 상태와 가시 버튼 목록에 대한 최종 직접 조작 감사

## 현재 자동 검증 기준

- SPS Desktop Node: `33/33`
- SPS Desktop: `184/184`
- 공개 Plugin SDK 전체: `62/62`
- Core Extension Profile 스키마: `20/20`
- Core Plugin SDK Host 계약: `18/18`
- Plugin Discovery & Builder: 빌드, manifest 검증, 대화 및 초안 도구 테스트 통과
- Core UI: TypeScript 검사와 Workspace switcher, 초기 Assistant, Runtime 상세, Host 전용 Nodes를 포함한 집중 회귀 `40/40` 통과
- Windows 배포 후보: `0.4.83` 설치본, Owner Host 런타임 스모크, 격리된 Electron 로그인 스모크 통과
- Core 기술 경계: Authorization, Company access, Team invite, Node, Workspace Source, Plugin database/route authorization, baseline built-in 차단, legacy instance-admin 무효화를 포함한 서버 회귀 `182/182` 통과

자동 검증은 계약 회귀를 막는 기준이다. 일부 역사적 Core 테스트는 전역 환경값을 공유하므로 한 프로세스 병렬 전체 실행 대신 독립 경계 묶음으로 순차 실행한다. 이 자동 검증은 실제 Electron 앱에서 Host와 Member가 같은 흐름을 통과했다는 증거를 대신하지 않으며, 아래 직접 E2E가 끝나기 전에는 베타 Core 완료로 표시하지 않는다.

수동 E2E 실행 순서는 [`BETA-ACCEPTANCE-RUNBOOK-ko.md`](./BETA-ACCEPTANCE-RUNBOOK-ko.md)에 유지한다.

## 완료 기준

베타 기준 Core는 새 Workspace에서 특정 업무 모델을 강요하지 않고, Host가 Windows Desktop에서 서버를 만들거나 참가하고, Runtime과 Source를 안전하게 공개하며, 공식/로컬 개발 플러그인을 독립적으로 관리할 수 있어야 한다. 이후 게임, 웹, 앱, 팀 작업, 메모리 제공자는 모두 선택 플러그인으로 제공한다.
