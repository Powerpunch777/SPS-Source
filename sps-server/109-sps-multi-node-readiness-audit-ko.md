# SPS 다중 노드 준비 상태

기준일: 2026-07-19

이 문서는 SPS가 친구의 컴퓨터를 협업 실행 노드로 받아들이기 위해 필요한
기능을 구현·검증·운영 준비로 나누어 기록한다. `완료`는 자동 검증 또는 공개
배포 상태가 확인된 항목이며, 실제 사람이 두 번째 컴퓨터에서 수행해야 하는
단계는 별도로 남긴다.

## 현재 결론

SPS Hub와 Desktop Node의 제품 흐름은 파일럿 가능한 상태다. 초대받은 사람이
자기 컴퓨터의 CLI 또는 로컬 AI를 Hub에 등록하고, Owner가 Agent별로 그 컴퓨터의
실행 권한을 줄 수 있다. 그러나 서명된 자동 업데이트 배포와 실제 협업자
컴퓨터에서의 첫 연결은 아직 완료 조건이 아니다.

## 구현 및 검증 상태

| 영역 | 상태 | 확인 근거 |
| --- | --- | --- |
| 공개 Hub | 완료 | `https://app.redongames.com/api/health`가 인증 모드와 공개 노출을 보고한다. Docker Hub, PostgreSQL, Cloudflare Tunnel을 사용한다. |
| Google 로그인 시작 | 완료 | 공개 배포 점검이 Google OAuth 필수 설정과 로그인 시작 URL을 확인한다. 실제 Google 계정으로 끝까지 로그인하는 일은 파일럿에서 확인한다. |
| 인앱 초대 코드 | 완료 | Owner/Admin이 `SPS-XXXX-...` 코드를 만들고, `/join`에서 코드 입력 후 로그인하는 Chromium E2E가 통과했다. |
| 사람별 접근 | 완료 | 초대 수락은 회사 멤버십만 만든다. Node 승인, Agent grant, 기본 Node 지정은 별도이며 Owner/Admin만 변경할 수 있다. |
| 다중 컴퓨터 Node | 완료 | 자동 E2E에서 두 독립 멤버와 두 Node를 동시에 활성화해 각 Node가 자기 Agent 명령을 처리하는 것을 확인했다. Owner는 실제 Nodes 화면에서 두 Node를 승인한다. |
| 컴퓨터별·Agent별 권한 설정 | 완료 | Owner가 Nodes 화면에서 각 Agent에 맞는 실행기를 가진 Node에만 grant를 부여하고, 최초 grant가 primary Node를 만드는 흐름을 Chromium E2E가 확인한다. |
| 명령 전달과 결과 | 완료 | Hub가 서명된 명령을 Node에 전달하고 stdout/stderr/종료 결과를 같은 Task 실행으로 회수하는 E2E가 통과했다. |
| Node 폐기 | 완료 | revoke된 Node의 이전 승인 재사용이 403으로 거절되는 것을 E2E가 확인한다. |
| 로컬 비밀 보호 | 완료 | CLI 로그인 정보, `CODEX_HOME`, API 키, 로컬 모델, 프로젝트 절대 경로는 Node 밖으로 전송하지 않는다. Hub에는 실행기 종류·capability·프로젝트 ID·허용된 상대 작업 정보만 전달한다. |
| Codex 계정 프로필 | 완료 | Agent 설정의 `codexAccount`는 `.codex`, `.codex-*` 이름만 Hub에 전달한다. Desktop Node는 자기 컴퓨터 사용자 폴더 아래의 해당 프로필과 `auth.json`을 확인한 뒤에만 `CODEX_HOME`을 설정한다. |
| 로컬 AI와 다른 CLI | 완료 | capability scan과 실행 경로는 Codex CLI, Agy CLI, Ollama, LM Studio를 다룬다. Chromium E2E는 한 Node의 CLI runtime과 다른 Node의 Ollama `qwen2.5-coder:7b` 로컬 AI runtime을 각각 실행한다. 실제 사용하려는 실행기는 각 Node에 설치·로그인되어 있어야 한다. |
| 프로젝트 폴더 분리 | 완료 | Hub의 프로젝트 ID를 Node가 자기 로컬 Git 작업 폴더로 매핑한다. 등록되지 않은 임의 절대 경로 실행은 거절한다. |
| Windows 설치 파일 | 파일럿 가능 | `SPS Desktop Setup 0.1.2.exe`를 만들고 Desktop/Node 테스트와 공개 Hub 사전 점검을 통과했다. 현재 설치 파일은 서명되지 않았다. |

## 자동 검증 명령

저장소 루트에서 실행한다.

```powershell
.\sps-server\scripts\Test-SPSAuthenticatedMultiUserE2E.ps1 -Port 3111 -TimeoutSec 210
```

이 검사는 실제 Chromium으로 다음을 한 번에 확인한다.

1. Owner 계정 생성과 회사 부트스트랩
2. `SPS-...` 코드 생성 및 초대 멤버의 코드 입력 가입
3. 권한이 낮은 멤버의 Owner 전용 설정 차단
4. Owner가 Nodes 화면에서 두 초대 멤버의 독립 Node 승인·Agent grant·기본 Node 바인딩
5. CLI Node와 Ollama 로컬 AI Node의 각각의 명령 실행과 결과 회수
6. 첫 Node revoke 뒤 이전 승인 재사용 차단

공개 Hub와 설치 파일은 다음 파일럿 점검으로 확인한다.

```powershell
.\sps-server\scripts\Test-SPS-MultiNodeRelease.ps1 `
  -HubUrl https://app.redongames.com `
  -InstallerPath ".\sps-server\desktop\dist\SPS Desktop Setup 0.1.2.exe" `
  -AllowUnsignedPilot
```

## 아직 남은 운영 조건

### 실제 두 번째 컴퓨터 파일럿

자동 E2E는 한 Windows 프로세스 안에서 두 Node transport를 분리해 검증한다.
실제 친구 컴퓨터에서 설치 파일, Google 로그인, `sps://` 연결, CLI 로그인 상태,
방화벽과 네트워크 환경까지 확인하려면
[두 번째 컴퓨터 파일럿](108-sps-second-computer-pilot-ko.md)을 한 번 수행해야 한다.

### 코드 서명과 자동 업데이트

현재 `0.1.2` 설치 파일은 의도적으로 unsigned Pilot이다. Windows 코드 서명
인증서와 GitHub Actions secrets를 설정하기 전에는 GitHub Release 또는 자동
업데이트 채널에 올리지 않는다. 정확한 출시 절차는
[Desktop Release Channel](104-sps-desktop-release-channel-ko.md)을 따른다.

### 운영상 권장 사항

- 처음에는 읽기 전용 또는 작은 확인 Task로 각 Node를 검증한다.
- Agent grant는 필요한 Node와 Agent 조합에만 준다.
- 협업 종료 시 Node grant와 Node를 revoke한다.
- 프로젝트 폴더 매핑 변경은 실행 중인 Task가 없을 때 수행한다.
