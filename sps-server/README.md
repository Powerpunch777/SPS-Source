# SPS Server

SPS Server는 사람과 역할별 AI Agent가 같은 프로젝트에서 안전하게 협업하도록 Hub, Room, Task, Memory, Desktop Node와 플러그인 실행 경계를 제공하는 서버·클라이언트 구성 모음이다.

이 디렉터리에는 현재 제품 코드뿐 아니라 초기 게임 제작 Work Plane부터 최근 Hosted Hub·Desktop Node까지의 구현 기록이 함께 보존되어 있다. **번호가 붙은 모든 문서가 현재 기준인 것은 아니다.**

## 먼저 읽을 문서

- [문서 지도](DOCUMENTATION.md)
- [제품 및 플러그인 플랫폼 계약](114-sps-product-and-plugin-platform-contract-ko.md)
- [Plugin Kit 및 공식 팀 플러그인 구현 계획](115-sps-plugin-kit-and-bundled-teams-implementation-plan-ko.md)
- [문서 체계 감사와 마이그레이션](116-sps-documentation-audit-and-migration-ko.md)
- [Workplane 상세 청사진](75-optimal-work-environment-blueprint-ko.md)
- [범용 Agent 플랫폼 Core 계약](113-sps-generic-agent-platform-core-contract-ko.md)

## 현재 제품 방향

SPS의 첫 제품은 다음 세 층으로 구성한다.

1. **Core Product**: Hub, Agent Room, Task Room, Workspace, Desktop Node, 실행 기록, 권한과 Memory
2. **Plugin Kit**: 표준 manifest, SDK, Test Kit, CLI, lifecycle, 권한과 패키징
3. **공식 플러그인**: Plugin Studio, Development Core, Indie Game Team, App Product Team, Web Product Team

유료 Marketplace, 판매자 정산과 코어 라이선스 최종 결정은 첫 출시 이후로 미룬다.

## 소스 지도

```text
sps-server/
├─ deploy/hub/                # Hosted Hub Docker 배포
├─ desktop/                   # Electron Desktop UI와 패키징
├─ desktop-node/              # 승인된 로컬 실행 Node
├─ sps-room-chat/             # Agent Room·Task Room 협업 플러그인
├─ sps-memory/                # Memory UI·도구 플러그인
├─ sps-default-memory/        # 기본 Memory provider
├─ memory-sidecar/            # 기존 로컬 Memory 보조 서비스
├─ direct-task-bridge/        # 기존 loopback 실행 브리지
├─ direct-task-pipe-broker/   # Windows Named Pipe 실행 경로
├─ agent-instructions/        # 역할·권한·Task 운영 규칙
├─ config/                    # 모델·Workplane 설정
├─ codex-room-adapter/        # Codex app-server adapter
├─ scripts/                   # 시작·복구·마이그레이션·검증
├─ tests/                     # 보안·호환성·회귀 fixture
├─ tasks/                     # 구현 작업 명세
├─ templates/                 # 현재 문서·Room 템플릿
└─ website/                   # 공개 제품 사이트
```

## 현재 안정 계약

- SPS는 프로젝트, Task Room, 댓글, 문서, Work Product와 실행 상태의 기준 시스템이다.
- Agent Room은 장기 역할 대화 공간이다.
- Task Room은 하나의 유한하고 검증 가능한 작업 공간이다.
- Desktop Node는 Hub가 승인한 프로젝트·Agent·명령 경계 안에서만 로컬 실행한다.
- Memory는 승인된 기억을 검색하고 후보를 제안하며, 권한 없이 Task를 생성·배정·완료하지 않는다.
- 플러그인 플랫폼의 기본값은 최소 권한이어야 한다.

## 개발 시작

```powershell
git clone --recurse-submodules https://github.com/Powerpunch777/SPS.git
cd SPS

cd .\sps-server\sps-room-chat
npm ci
npm run check

cd ..\sps-memory
npm ci
npm run check

cd ..\..
.\sps-server\scripts\Start-SPS.ps1
.\sps-server\scripts\Test-SPSWorkplaneReadiness.ps1 | Format-List
```

기본 로컬 Hub 주소는 `http://127.0.0.1:3100`이다.

## 문서와 구현 로그

기존 번호 문서는 중요한 실패·수정·검증 기록이다. 삭제하지 않지만, 제품 범위와 구현 우선순위를 판단할 때는 `DOCUMENTATION.md`의 현재 기준을 먼저 따른다.
