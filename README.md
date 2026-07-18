# SPS Workplane

SPS Workplane은 여러 AI Agent가 한 프로젝트에서 역할을 나누어 작업하도록 돕는 로컬 Windows 서버입니다. 브라우저에서 작업을 만들고, 담당 Agent에게 맡기고, 결과와 기록을 한곳에서 확인할 수 있습니다.

> 기본 주소: [http://127.0.0.1:3100](http://127.0.0.1:3100)

## 공개 제품 사이트와 Hub

- 제품 소개 사이트: `https://redongames.com`
- 인증된 협업 Hub: `https://app.redongames.com`
- 배포 구조와 DNS·Google OAuth 설정 순서: [Redon Games 도메인 구조](sps-server/107-redongames-domain-and-website-ko.md)

공개 사이트와 Hub는 서로 분리한다. 사이트는 Cloudflare Pages의 정적 출력이고,
Hub는 별도 Docker 호스트에서 Google 로그인, 초대, Room, Task, Node 권한을 처리한다.

## 가장 빠른 시작

이미 이 PC에 SPS가 설정되어 있다면, PowerShell에서 아래 두 줄만 실행하세요.

```powershell
cd "C:\path\to\SPS"
.\sps-server\scripts\Start-SPS.ps1
```

명령이 끝나면 브라우저에서 [http://127.0.0.1:3100](http://127.0.0.1:3100)을 엽니다. 서버가 이미 실행 중이면 안전하게 상태를 확인하고 필요한 구성 요소만 시작합니다.

변경 사항을 반영해 다시 시작하려면 다음을 사용합니다.

```powershell
.\sps-server\scripts\Start-SPS.ps1 -Restart
```

## 처음 설치하는 경우

### 준비물

- Windows 10/11
- PowerShell 5.1 이상
- Node.js LTS
- Git (SPS Core submodule 포함 복제용)

이 저장소는 검증된 SPS Core 버전을 Git submodule로 함께 추적합니다. 따라서
처음 복제할 때 submodule까지 함께 받으면 로컬 실행과 Docker 배포가 같은 Core
버전을 사용합니다.

### 1. 저장소 받기

```powershell
git clone --recurse-submodules https://github.com/Powerpunch777/SPS.git
cd SPS
```

이미 일반 `git clone`으로 받았다면, 한 번만 다음 명령을 실행합니다.

```powershell
git submodule update --init --recursive
```

### 2. SPS Core 확인하기

정상 복제되면 SPS Core가 아래 위치에 준비되어 있습니다.

```text
SPS/
├─ sps-server/
└─ external/
   └─ sps-core/
```

개발 중 다른 SPS Core checkout을 시험하고 싶을 때만 시작 경로를 직접 지정합니다.

```powershell
.\sps-server\scripts\Start-SPS.ps1 -CorePath "D:\tools\sps-core"
```

### 3. 플러그인 의존성 설치

```powershell
cd .\sps-server\sps-room-chat
npm ci

cd ..\sps-memory
npm ci

cd ..\..
```

### 4. 서버 시작 및 확인

```powershell
.\sps-server\scripts\Start-SPS.ps1
.\sps-server\scripts\Test-SPSWorkplaneReadiness.ps1 | Format-List
```

마지막 명령의 `ready`가 `True`면 준비가 끝난 것입니다.

## 처음 화면에서 할 일

1. 브라우저에서 `http://127.0.0.1:3100`을 엽니다.
2. **Projects**에서 작업할 프로젝트를 만들거나 선택합니다.
3. 프로젝트의 **Workplane** 설정에서 코드·디자인 등 실제 작업 폴더(Workspace)를 연결합니다.
4. Agent Room에서 Lead Agent에게 목표를 설명합니다.
5. Lead가 Task Room을 만들고 Worker에게 할당하면, 진행 상황과 결과가 해당 Task Room에 기록됩니다.

간단히 말하면, **Agent Room은 상담·관리 공간**이고 **Task Room은 하나의 실제 작업 공간**입니다.

```text
사용자 → Lead Agent Room → Task Room → Worker Agent → 결과 보고
```

## 역할 이해하기

| 역할 | 하는 일 |
| --- | --- |
| Lead | 요청을 정리하고, 작업을 나누고, 결과를 검토합니다. |
| Worker | 할당된 Task Room 안에서만 실제 작업을 수행하고 결과를 보고합니다. |
| Agent Room | 특정 Agent와 계속 대화하는 공간입니다. |
| Task Room | 목표·범위·담당자·결과가 기록되는 단일 작업 공간입니다. |

처음에는 Lead Agent에게 다음처럼 요청하면 됩니다.

> “이 프로젝트의 현재 구조를 살펴보고, 개선할 작업을 작은 Task로 나눠서 제안해줘.”

## 상태 확인과 문제 해결

### 서버가 열리지 않을 때

```powershell
.\sps-server\scripts\Test-SPSWorkplaneReadiness.ps1 | Format-List
```

출력의 `blockers`와 `warnings`를 먼저 확인합니다. Core 경로가 다르면 `-CorePath`를 지정해 다시 실행하세요.

### 플러그인을 수정한 뒤

```powershell
.\sps-server\scripts\Start-SPS.ps1 -Restart
```

### 컴퓨터를 켤 때 자동으로 시작하기

```powershell
.\sps-server\scripts\Install-SPSStartup.ps1 -StartNow
```

## 주요 기능

- **SPS Room Chat**: Lead와 Worker가 프로젝트·Task 단위로 협업합니다.
- **SPS Memory**: 승인된 기억을 검색하고, 새 후보를 검토용으로 제안합니다.
- **첨부 파일**: Task Room에 파일을 올려 필요한 작업 폴더에만 준비합니다.
- **Direct Task**: 명시적으로 실행한 경우에만 로컬 Worker 작업을 시작합니다.
- **Image Worker**: PixelLab 또는 Meshy 기반의 이미지·3D 에셋 작업을 지원합니다.

## 검사 명령

변경 후에는 아래 검사를 권장합니다.

```powershell
# 서버 전체 준비 상태
.\sps-server\scripts\Test-SPSWorkplaneReadiness.ps1 | Format-List

# Room Chat 플러그인 검사
cd .\sps-server\sps-room-chat
npm run check

# Memory 플러그인 검사
cd ..\sps-memory
npm run check
```

## 보안과 공유

기본 실행 모드는 내 컴퓨터에서만 접속하는 `local_trusted`입니다. 인터넷에 포트를 직접 공개하지 마세요. 다른 사람과 함께 쓰려면 Private Tailnet과 인증을 구성한 뒤 협업 검사를 통과해야 합니다.

다음 파일은 GitHub에 올리지 않습니다.

- `node_modules`, 로그, 실행 데이터
- `config.local.json`과 로컬 토큰
- Memory 데이터와 첨부 파일 캐시
- Provider API 키와 계정 인증 정보

## 더 알아보기

- [현재 서버 사용자 안내](sps-server/97-current-server-user-guide-ko.md)
- [제품 준비 상태](sps-server/90-product-readiness-audit-ko.md)
- [협업 배포 준비도](sps-server/93-collaboration-deployment-readiness-ko.md)
- [프로젝트 접근 제어](sps-server/94-project-access-control-ko.md)
- [SPS Desktop 멀티노드 구조](sps-server/98-sps-desktop-multinode-architecture-ko.md)
- [SPS 제품명·호환 경계](sps-server/106-sps-product-brand-boundary-ko.md)
