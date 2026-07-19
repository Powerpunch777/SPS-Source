# SPS

**사람과 AI Agent가 같은 프로젝트에서 안전하게 협업하는 제작 워크스페이스.**

SPS(SonParkServer)는 프로젝트, 대화, 작업, 승인, 실행 결과를 한곳에서 관리합니다. 팀은 중앙 Hub에서 함께 계획하고, 각자의 컴퓨터는 필요한 경우에만 안전한 실행 Node로 참여합니다.

- 제품 사이트: [redongames.com](https://redongames.com)
- 협업 Hub: [app.redongames.com](https://app.redongames.com)
- 제품 범위: 게임 제작을 시작점으로 하되, 역할 기반 AI 협업이 필요한 모든 프로젝트

> 현재 SPS는 Hub와 Desktop Node 흐름을 검증한 파일럿 단계입니다. 실제 두 번째 컴퓨터 초대·연결과 서명된 Windows 배포는 출시 전 운영 검증 항목으로 남아 있습니다.

## SPS가 해결하는 일

AI Agent에게 일을 맡길 때 필요한 맥락, 권한, 결과, 책임을 작업 단위로 남깁니다. 단순 채팅이 아니라 프로젝트의 실행 흐름을 관리하는 공간입니다.

| SPS 구성 | 역할 |
| --- | --- |
| **Hub** | 팀의 프로젝트, Room, Task, 멤버십, 권한 및 실행 기록을 보관하는 중앙 협업 서비스입니다. |
| **Agent Room** | Lead 또는 역할별 Agent와 목표·우선순위·방향을 이어서 논의하는 장기 대화 공간입니다. |
| **Task Room** | 목표, 범위, 담당자, 첨부 파일, 결과가 남는 하나의 실제 작업 공간입니다. |
| **Desktop Node** | 사용자의 컴퓨터에서 승인된 Agent 명령과 로컬 AI를 실행하는 안전한 실행 노드입니다. |
| **Memory** | 승인된 기억을 검색하고 새 기억은 후보로 제안합니다. 기억이 작업을 자동 생성하거나 배정하지는 않습니다. |

```text
사용자 → Agent Room → Task Room → 승인된 Desktop Node → 결과와 기록
```

## 서버 구조

SPS는 공개 사이트, 인증된 Hub, 각 사용자의 Desktop Node를 분리합니다. 공개 사이트는 제품 안내만 제공하며, 프로젝트 데이터와 실행 권한은 Hub와 승인된 Node 사이에서만 다뤄집니다.

```mermaid
flowchart TB
  visitor["방문자"] --> site["redongames.com<br/>공개 제품 사이트"]
  member["팀원"] --> hub["app.redongames.com<br/>인증된 SPS Hub"]

  subgraph public["공개 영역"]
    site
  end

  subgraph hubhost["Hub 운영 환경: Docker"]
    tunnel["Cloudflare Tunnel 또는 Caddy<br/>HTTPS 인입"] --> hub
    hub --> core["SPS Core<br/>Room · Task · 권한 · 초대"]
    core --> rooms["SPS Room Chat 플러그인"]
    core --> database[("PostgreSQL<br/>프로젝트 · 기록 · 멤버십")]
  end

  subgraph computerA["각 팀원의 컴퓨터"]
    desktop["SPS Desktop"] --> node["Desktop Node"]
    node --> workspace["승인된 프로젝트 Workspace"]
    node --> runtimes["Codex · Agy · Ollama · LM Studio"]
  end

  hub <-->|"인증된 연결 · 승인된 명령 · 실행 결과"| desktop
```

### 구성 요소별 책임

| 계층 | 포함 요소 | 책임 | 보관하지 않는 것 |
| --- | --- | --- | --- |
| 공개 사이트 | `redongames.com`, `sps-server/website/` | 제품 소개, 문서와 다운로드 진입점 | Hub 쿠키, 프로젝트 데이터, 관리자 화면 |
| 협업 Hub | `app.redongames.com`, `deploy/hub/`, SPS Core, PostgreSQL | 로그인, 초대, 프로젝트, Room, Task, Node 승인, Agent 실행 권한, 결과 기록 | Node의 CLI 로그인, API 키, 로컬 모델, 절대 작업 경로 |
| Desktop Node | `desktop/`, `desktop-node/` | Hub에 연결, 로컬 실행기 확인, 승인된 명령 실행, 결과 회수 | 다른 Node의 자격 증명·작업 폴더 |
| 협업 플러그인 | `sps-room-chat/`, `sps-memory/` | Room UI, Task 협업, 기억 검색과 후보 제안 | 임의 Task 생성·배정, 승인된 기억의 자동 변경 |
| 로컬 보조 서비스 | `memory-sidecar/`, `direct-task-*` | 개발·로컬 Workplane에서의 기억 지원과 명시적 Task 실행 | 공개 Hub 비밀 값, 외부 공개 포트 |

### 작업이 실행되는 순서

1. 사용자가 Agent Room에서 목표를 논의하거나, Lead가 Task Room을 만듭니다.
2. Hub는 프로젝트·멤버십·Agent 정책을 확인하고, 실행 가능한 Node를 결정합니다.
3. Owner/Admin이 승인한 Node와 Agent 조합에만 실행 권한이 있습니다.
4. Node는 자기 컴퓨터의 등록된 Workspace와 로컬 실행기만 사용해 명령을 수행합니다.
5. 표준 출력, 오류, 완료 상태는 Hub의 같은 Task 실행 기록으로 돌아갑니다.

Node는 Hub에 **아웃바운드 연결만** 만들며, Hub가 팀원 컴퓨터의 포트를 열거나 임의의 셸을 직접 실행하지 않습니다.

## 사용자 시작하기

### 팀원으로 참여하기

1. 초대받은 SPS Hub 주소를 엽니다.
2. Google 로그인 후 초대 코드를 입력합니다.
3. 프로젝트와 Agent Room에 들어가 목표를 설명합니다.
4. Lead Agent가 필요한 Task Room을 만들고 적절한 Worker에게 할당합니다.
5. 작업 진행, 첨부 파일, 결과 보고는 해당 Task Room에서 확인합니다.

처음에는 Lead Agent에게 이렇게 요청해 보세요.

> “이 프로젝트의 현재 상태를 정리하고, 우선순위가 높은 작업을 작은 Task로 나눠 제안해줘.”

### 내 컴퓨터를 실행 Node로 연결하기

SPS Desktop은 로컬 서버를 자동으로 열지 않습니다. HTTPS Hub에 연결하는 데스크톱 클라이언트이면서, 허가된 경우에만 이 컴퓨터의 CLI·로컬 AI를 실행하는 Node입니다.

1. SPS Desktop에서 Hub 주소를 저장합니다.
2. 브라우저에서 Google 로그인을 승인합니다.
3. 필요할 때만 이 컴퓨터를 Node로 등록합니다.
4. Owner 또는 Admin이 Node를 승인하고, 실행할 Agent에 권한을 부여합니다.
5. 해당 컴퓨터에 설치·로그인된 Codex CLI, Agy CLI, Ollama 또는 LM Studio가 승인된 Task에만 사용됩니다.

Node 등록만으로는 명령이 실행되지 않습니다. **Node 승인과 Agent별 실행 권한 부여**가 모두 완료되어야 합니다.

## 보안 원칙

- Hub는 사람·프로젝트·Task·권한을 조정하고, Node는 자신의 컴퓨터에서만 실행합니다.
- CLI 로그인 정보, API 키, 로컬 모델, 절대 작업 경로는 Hub로 전송하지 않습니다.
- 새 Node는 Owner/Admin 승인을 받아야 하며, Agent별 권한도 별도로 필요합니다.
- 프로젝트 작업 폴더는 Node에 명시적으로 연결된 경로만 사용할 수 있습니다.
- 공개 제품 사이트와 인증 Hub는 분리되어 있습니다. 공개 사이트는 협업 데이터나 관리 화면에 접근하지 않습니다.

자세한 권한·Node·초대 정책은 [다중 Node 준비 상태](sps-server/109-sps-multi-node-readiness-audit-ko.md)와 [프로젝트 접근 제어](sps-server/94-project-access-control-ko.md)를 참고하세요.

## 자체 운영: Hub 배포

자체 Hub를 운영하려면 Docker, HTTPS 도메인, Google OAuth Web Client가 필요합니다. 외부에 포트를 직접 열기 어려운 환경에서는 Cloudflare Tunnel 방식을 사용할 수 있습니다.

```powershell
git clone --recurse-submodules https://github.com/Powerpunch777/SPS.git
cd SPS\sps-server\deploy\hub

.\Initialize-SPSHubDeployment.ps1 `
  -Domain "app.example.com" `
  -GoogleClientId "<Google OAuth client ID>" `
  -PromptForGoogleClientSecret
```

초기화는 비밀 값이 담긴 로컬 `.env` 파일을 만들며, 이 파일은 Git에 포함하지 않습니다. 전체 배포 절차는 [Public Hub Docker 배포 안내](sps-server/105-sps-public-hub-docker-deployment-ko.md)를 따르세요.

## 로컬 개발 환경

Windows에서 SPS Workplane과 플러그인을 실행·검증하려면 다음 순서를 사용합니다.

```powershell
git clone --recurse-submodules https://github.com/Powerpunch777/SPS.git
cd SPS

cd .\sps-server\sps-room-chat
npm ci

cd ..\sps-memory
npm ci

cd ..\..
.\sps-server\scripts\Start-SPS.ps1
.\sps-server\scripts\Test-SPSWorkplaneReadiness.ps1 | Format-List
```

기본 로컬 주소는 [http://127.0.0.1:3100](http://127.0.0.1:3100)입니다. 일반 `git clone`을 이미 실행했다면 다음 명령으로 SPS Core submodule을 받습니다.

```powershell
git submodule update --init --recursive
```

## 서버 소스 구조

```text
sps-server/
├─ deploy/
│  └─ hub/                    # Docker Compose, Hub 초기화, 공개 배포 검사
├─ desktop/                   # Electron 기반 SPS Desktop UI·패키징
├─ desktop-node/              # Hub 명령을 받는 로컬 Node 런타임
├─ sps-room-chat/             # Agent Room·Task Room 화면과 협업 Worker
├─ sps-memory/                # Memory 화면, 검색·후보 제안 플러그인
├─ memory-sidecar/            # 로컬 승인 기억·후보 저장 서비스
├─ direct-task-bridge/        # 선택적 loopback Direct Task 실행 브리지
├─ direct-task-pipe-broker/   # Windows Named Pipe 기반 실행 경로
├─ agent-instructions/        # 역할, 권한, Task 운영 규칙
├─ config/                    # 모델 카탈로그와 Workplane 설정
├─ codex-room-adapter/        # Codex app-server 프로토콜 어댑터
├─ scripts/                   # 시작, 복구, 마이그레이션, E2E 검사
├─ tests/                     # 보안·호환성·회귀 테스트 fixture
├─ tasks/                     # 구현 작업 명세와 검증 기록
└─ website/                   # GitHub Pages용 공개 제품 사이트

external/
└─ sps-core/                  # 고정 커밋으로 연결된 SPS Core submodule
```

`external/sps-core`는 별도 저장소를 가리키는 Git submodule입니다. 저장소 복제 시 `--recurse-submodules`를 사용해야 Hub, Desktop, 플러그인이 호환되는 같은 Core 버전을 사용합니다.

## 개발 검사

```powershell
# Workplane 준비 상태
.\sps-server\scripts\Test-SPSWorkplaneReadiness.ps1 | Format-List

# Room Chat 플러그인
cd .\sps-server\sps-room-chat
npm run check

# Memory 플러그인
cd ..\sps-memory
npm run check

# 공개 사이트 소스 검사
node ..\website\scripts\check-site.mjs
```

## 제품 및 운영 문서

- [현재 서버 사용자 안내](sps-server/97-current-server-user-guide-ko.md)
- [SPS Desktop Hosted Hub 모드](sps-server/110-sps-desktop-host-mode-ko.md)
- [Public Hub Docker 배포](sps-server/105-sps-public-hub-docker-deployment-ko.md)
- [도메인·공개 사이트·Hub 구조](sps-server/107-redongames-domain-and-website-ko.md)
- [Cloudflare Tunnel Hub 배포](sps-server/108-sps-cloudflare-tunnel-hub-ko.md)
- [Desktop 릴리스 채널](sps-server/104-sps-desktop-release-channel-ko.md)
- [제품명 및 SPS Core 호환 경계](sps-server/106-sps-product-brand-boundary-ko.md)

## Git에 포함하지 않는 항목

다음은 개인 장비 또는 운영 환경에만 남아야 하며 GitHub에 올리지 않습니다.

- API 키, OAuth 비밀 값, 로그인 정보, `config.local.json`
- `node_modules`, 로그, 실행 상태, Memory 데이터, 첨부 파일 캐시
- Docker 배포 `.env`와 데이터베이스 데이터
- Desktop 빌드 결과물과 개인 컴퓨터의 Node 런타임
