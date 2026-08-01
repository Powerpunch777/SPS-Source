# SPS Core와 플러그인 기준 구현 계획

최종 갱신: 2026-08-01
기준 후보: SPS Desktop `0.4.104`, SPS Core `8339edd1ee6cb479a757c303039e123b5e0680cf`,
Plugin SDK `0.11.0` (`f24d9b236a8bdaee9441f37694b7e4298aa7e6c2`)

## 목적

SPS Core는 특정 회사 조직이나 Paperclip의 업무 방식을 강제하지 않는 Windows
Desktop-first 기반이다. Host, Member, Node, Runtime, Workspace Source, plugin
lifecycle, 보안 경계와 기록을 제공한다. Room, Task, Lead/Worker, 승인, 보고,
장기기억과 프로젝트 방식은 플러그인이 정의한다.

## 경계

| 영역 | Core | 플러그인 |
| --- | --- | --- |
| 작업 방식 | 정의하지 않음 | Room, Task, 역할, 보고, 승인, 메모리 |
| 컴퓨터 | Host, Member, Node, Tailscale, Desktop 수명주기 | 어떤 Node와 Runtime을 쓸지 결정 |
| AI 실행 | Runtime 발견, Node 상태, run 기록, 기술적 grant | Agent/Worker 의미와 작업 규칙 |
| 파일 | Host가 고른 Source와 암호화 route | Source를 프로젝트/작업 범위에 연결 |
| 플러그인 | 서명, 호환성, stage, Host lifecycle, 로그 | 데이터, UI, 도구, 자동화, 업무 정책 |
| 보안 | secret handle, Node credential 격리, 위험 기술 동작 확인 | 업무상 승인 주체와 승인 기준 |

Host는 물리적인 SPS 서버 컴퓨터다. 조직의 상사 역할을 뜻하지 않는다. 플러그인은
필요에 따라 Lead, Worker, Reviewer 같은 업무 역할을 자체적으로 만든다.

## 기본 Workspace

기본 Core는 Room, Task, Project, Inbox, 역할 또는 메모리 정책을 자동으로 만들지
않는다. Marketplace와 Marketplace Assistant는 검색·상세 조회·추천만 담당한다.
Plugin Builder는 제작, 검사, Preview, package까지만 담당한다. 두 기능 모두
설치·활성화·업데이트·비활성화·삭제를 실행하지 않으며, Host가 `설정 > 플러그인`에서
수동으로 lifecycle을 결정한다.

## Host, Member, Node, Runtime

- Host 하나는 여러 Workspace를 가질 수 있다.
- Member는 Workspace에 참가한 SPS 계정이고, 한 Member는 여러 Node를 가질 수 있다.
- Node는 Member 컴퓨터의 Desktop 실행 단위다.
- Runtime은 Node 소유자가 공개하기로 선택한 CLI, 로컬 AI, API 또는 Connector다.
- API 키, CLI home, 로컬 경로와 자격증명은 Node 밖으로 전송하지 않는다.
- Host는 Node와 grant를 승인·철회한다. Member 제거 시 관련 Node, Runtime 공개,
  Source/execution grant를 철회하되 과거 기록은 보존한다.

첫 출시 플랫폼은 Windows 10/11 x64이며 팀 연결은 Tailscale을 사용한다. 일반
브라우저는 제품 사용 경로가 아니며 Host Workspace는 Desktop bridge로 보호한다.

## Workspace Source

Source는 Host가 고른 로컬 폴더를 나타내는 불투명한 이름 있는 핸들이다.

1. Host만 Desktop 폴더 선택으로 Source를 만든다.
2. Core는 Source ID, 이름, 상태를 관리하고 실제 경로는 Host Desktop에만 둔다.
3. Host가 필요할 때만 승인된 Member Node에 transport route를 만든다.
4. Node grant에는 대상 Node 공개키로 암호화된 접근 자격증명만 저장한다.
5. 플러그인은 Source ID를 사용하며 세부 폴더 정책은 플러그인이 결정한다.

Member는 Host 경로나 자기 컴퓨터 폴더를 임의로 Source로 지정할 수 없다. Host Vault를
복원했더라도 새 Host가 로컬 폴더를 다시 선택하기 전에는 Source를 사용할 수 없다.

## 표준 플러그인 계약

- Profile `1.0`: 기존 Paperclip 호환 번들용
- Profile `2.0`: SPS의 작업 방식 중립 계약이며 신규 개발의 기본값

주요 primitive는 `workspace.sources.metadata`, `workspace.sources.route`,
`runtimes.list`, `runtimes.dispatch`, `runs.observe`, `artifacts.write`,
`secrets.use`다. 선언만으로 권한이 부여되지 않으며 Core가 manifest, 호환성,
활성 상태, Node 준비 상태와 실행 grant를 매번 검증한다.

## 현재 구현 상태

통과한 범위:

- Profile 2.0 SDK와 1.0/2.0 Desktop 호환성
- Source, Runtime, execution grant, Run, Artifact 계약과 Host 보안 경계
- Marketplace 검색/상세 및 Builder의 build·validate·test·pack·Preview 흐름
- packaged bootstrap, Workspace, Plugin Preview, Host plugin lifecycle
- Desktop `261/261` (exit 0), desktop-node `39/39`, 공개 Plugin SDK `146/146`
- `0.4.104` 패키징 및 Host/main과 Member/laptop 설치
- Installer SHA256 `B58E7EAE15884D4E9B052ED3A15A9B43B340CB83DCAE1EE0D1A71261C974C2C1`, size `255265752`
- 양쪽 app.asar SHA256 `2ECC983D650BBBB51798762A1A4AAFB6B8096AE5073C251CD33FB7C66E34EFEC`
- 브라우저 직접 접근 차단과 Desktop-only Host 기술 API

아직 완료로 표시하지 않는 범위:

- Host Source → laptop Agy CLI 물리 실행 E2E: run `e0286388-cf8d-4acb-9890-40d8fce1edab`
- Source 철회 후 거부(run `e5bec7a5-9324-4479-aea2-834d4dca5730`), 원본 해시 불변, 양쪽 재시작 후 복구
- 모든 visible control의 직접 조작 감사와 공개 릴리스 서명/배포 게이트

## 1~8단계 완료 판정

1. 공개 SDK와 계약 고정: 자동 검증 통과.
2. Workspace Shell·Dashboard·Inbox 기반: packaged Workspace 검증 통과. 업무 의미는 플러그인에 둔다.
3. Developer Mode·Local Registry: build/validate/test/pack·Preview 검증 통과.
4. Plugin Preview 격리: production과 분리된 Preview와 cleanup 검증 통과.
5. Diagnostics·Test Kit: SDK와 Desktop 회귀에 포함되어 통과.
6. Job·Dependency lifecycle: packaged Host plugin lifecycle 검증 통과.
7. Marketplace Assistant·Builder: 검색/추천과 제작·Preview 계약 검증 통과. lifecycle은 수동 Host 경계로 유지.
8. 두 컴퓨터 reference E2E: **완료**. Host Source를 `Z:\\`로 마운트하고
   `SPS_WORKSPACE_PATH=Z:\\`를 사용한 실제 파일 편집, 철회 후 거부, 재시작 후 복구를 확인했다.

따라서 현재 제품은 “Core와 플러그인 플랫폼의 자동·패키징·물리 E2E 기준 통과”
상태다. 남은 항목은 베타 사용성 점검과 공개 릴리스 서명·배포 게이트다.
