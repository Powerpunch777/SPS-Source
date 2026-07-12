# Powerpunch

Paperclip을 게임 개발 AI 작업의 제어 평면(control plane)으로 사용하는 로컬 워크플레인입니다. 장기 실행되는 역할별 Agent Room, 작업 단위의 Task Room, 보조 기억 검색, 그리고 안전한 로컬 Direct Task 실행 경로를 제공합니다.

> 현재 아키텍처의 기준 문서는 [75-optimal-work-environment-blueprint-ko.md](paperclip-game-workplane/75-optimal-work-environment-blueprint-ko.md)이며, P0 구현·배포 기록은 [76-room-workplane-p0-implementation-and-deployment-log-ko.md](paperclip-game-workplane/76-room-workplane-p0-implementation-and-deployment-log-ko.md)입니다.

## 원칙

- **Paperclip이 시스템 오브 레코드입니다.** 회사, 프로젝트, Task Room, 댓글, 산출물과 작업 상태는 Paperclip에서 관리합니다.
- **Task Room은 Paperclip 이슈입니다.** Agent Room은 별도의 런타임이 아니라 장기 유지되는 역할별 작업 데스크입니다.
- **Memory Sidecar는 보조 기능입니다.** 기억을 검색하고 후보를 보관하지만, 작업 생성·배정·라우팅·종료를 하지 않습니다.
- **Direct Task는 명시적으로 실행합니다.** 로컬 Named Pipe Broker는 기본적으로 비활성화되어 있으며, 사용자 목표에 대해서만 Task Room을 생성합니다.

## 구성

```text
paperclip-game-workplane/
├── paperclip-memory-plugin/    # Memory Sidecar 검색·후보 제안용 Paperclip 플러그인
├── paperclip-room-chat-plugin/ # Codex app-server 기반 장기 Agent Room 플러그인
├── memory-sidecar/             # 승인된 LEARNINGS.md 검색 및 후보 검토 서비스
├── direct-task-bridge/         # 루프백 전용 Direct Task 실행 브리지
├── direct-task-pipe-broker/    # Windows Named Pipe 기반 Direct Task 게이트웨이
├── codex-room-adapter/         # Codex app-server 프로토콜 스키마
├── scripts/                    # Paperclip 운영·검증 PowerShell 도구
├── tasks/                      # 구현 작업 명세
└── tests/                      # 보안·기능 테스트 fixture
```

## 요구 사항

- Windows PowerShell 5.1 이상 또는 PowerShell 7+
- Node.js / npm
- 로컬 Paperclip 런타임
- Direct Task를 사용할 경우 `agy.exe` 및 프로젝트별 워크스페이스 설정

## 빠른 시작

```powershell
git clone https://github.com/Powerpunch777/Powerpunch.git
cd Powerpunch\paperclip-game-workplane

# Paperclip과 Memory Sidecar 상태를 확인하거나 시작합니다.
.\scripts\Start-PaperclipWorkplane.ps1

# 준비 상태를 읽기 전용으로 점검합니다.
.\scripts\Test-PaperclipWorkplaneReadiness.ps1 -AsMarkdown
```

기본 로컬 엔드포인트는 다음과 같습니다.

| 서비스 | 기본 주소 |
| --- | --- |
| Paperclip | `http://127.0.0.1:3100` |
| Memory Sidecar | `http://127.0.0.1:3188` |

## 플러그인 검증

각 플러그인의 의존성을 설치한 후 검증합니다.

```powershell
cd paperclip-memory-plugin
npm ci
npm run check

cd ..\paperclip-room-chat-plugin
npm ci
npm run check
```

`npm run check`은 매니페스트, 워커 문법, 플러그인 계약, 안전 경계와 UI 빌드를 검사합니다.

## Memory Sidecar 사용

Memory Sidecar는 승인된 기억을 검색하고, 후보를 별도 보관합니다. 후보의 승인 전에는 `LEARNINGS.md`를 수정하지 않습니다.

```powershell
cd memory-sidecar

# Sidecar 시작
.\start-memory-sidecar.ps1

# 프로젝트 기억 검색
.\memory-recall.ps1 -Query "Task Room" -Scope project -Limit 5

# 후보 확인 및 승격 미리 보기
.\memory-candidates.ps1 -Limit 20
.\memory-promote-candidate.ps1 -CandidateId cand_example -JournalId project-default
```

실제 승격은 명시적인 `-Apply`가 있어야 합니다.

```powershell
.\memory-promote-candidate.ps1 -CandidateId cand_example -JournalId project-default -Apply
```

## Direct Task 안전 경계

Direct Task는 로컬 Named Pipe Broker를 통해서만 활성화합니다.

1. `direct-task-pipe-broker/config.example.json`을 참고해 로컬 전용 `config.local.json`을 만듭니다.
2. `enabled`를 명시적으로 설정하고 프로젝트·회사·목표·워크스페이스 매핑을 검토합니다.
3. Paperclip Project Hub의 **Direct Task Preview**에서 역할, Agent Room, 제목, 목표를 확인한 뒤 직접 실행합니다.

`config.local.json`, 런타임 상태, 로그, `node_modules`, 기억 후보 데이터는 저장소에 포함하지 않습니다. 브리지는 루프백 바인딩, 프로젝트 경로 검증, 역할 허용 목록, 멱등성 키 및 감사 로그를 사용하도록 설계되어 있습니다.

## 주요 문서

- [작업공간 README](paperclip-game-workplane/README.md): 전체 구현 상태와 운영 절차
- [최종 아키텍처](paperclip-game-workplane/00-final-architecture.md)
- [운영 모델](paperclip-game-workplane/02-final-operating-model-ko.md)
- [구조 적합성 체크리스트](paperclip-game-workplane/04-structure-fit-checklist.md)
- [P0 구현 및 배포 기록](paperclip-game-workplane/76-room-workplane-p0-implementation-and-deployment-log-ko.md)

## 운영 시 주의

- Agent Room에 단순히 응답을 받기 위해 작업을 배정하지 마세요. 실제 목표가 있는 별도 Task Room을 생성해야 합니다.
- Direct Task와 기억 후보 승격은 모두 명시적 사용자 의도와 검토를 전제로 합니다.
- Paperclip 업데이트 후에는 `scripts\Test-PaperclipPluginSecretRefCapability.ps1 -AsMarkdown`으로 기능 상태를 다시 확인하세요.
