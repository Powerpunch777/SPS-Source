# 93. 협업 배포 준비도

## 목적

Workplane은 기본적으로 한 사람의 PC에서만 동작한다. 친구나 팀원이 함께 쓰려면 단순히 `3100` 포트를 열지 않고, SPS의 인증된 배포 모드와 사용자 권한을 함께 켠다.

이 문서는 기본 안전 상태를 유지하면서 2인 이상 협업으로 전환하는 절차와 검증 기준을 정한다.

## 2026-07-18 인증 협업 E2E

`Test-SPSAuthenticatedMultiUserE2E.ps1`를 격리된 Docker PostgreSQL과
실제 Chromium 브라우저로 실행해 통과했다. 인증 bootstrap, Owner 계정 생성,
Operator 초대/참여, Viewer 강등, Viewer의 초대 API 거부를 확인했고 임시
서버·DB·컨테이너는 종료 후 제거됐다.

이는 제품의 인증과 역할 경계를 검증한 결과다. 실제 Tailnet 또는 reverse
proxy 배포는 아래의 수동 preflight를 거쳐야 하며, 이 테스트가 원격 노출을
자동으로 활성화하지는 않는다.

## 현재 기본값

| 항목 | 기본값 | 이유 |
| --- | --- | --- |
| 접근 | `local_trusted` | 현재 PC의 사용자만 접속한다. |
| bind | `127.0.0.1` loopback | LAN 또는 인터넷에 UI를 노출하지 않는다. |
| Room/Task | 계속 사용 가능 | 로컬 개발 및 Agent 실행은 영향받지 않는다. |
| 친구 협업 | 비활성 | 네트워크와 인증을 함께 준비한 뒤에만 활성화한다. |

현재 상태 확인:

```powershell
cd "C:\Users\young\Documents\AGENT 구축\sps-server"
.\scripts\Test-SPSWorkplaneCollaboration.ps1 | Format-List
```

`state=local_only`는 오류가 아니라 안전한 기본 상태다.

## 권장 경로: 인증된 Private Tailnet

협업자가 같은 집이나 학교 네트워크에만 있지 않을 수 있으므로, 기본 권장 경로는 Tailscale 같은 사설 Tailnet이다.

1. 호스트 PC와 협업자 PC를 같은 Tailnet에 연결한다.
2. SPS `.env`에 `BETTER_AUTH_SECRET` 또는 `PAPERCLIP_AGENT_JWT_SECRET`을 설정한다. 값은 채팅, Room 문서, Agent prompt, Git에 넣지 않는다.
3. 아래 명령으로 `authenticated/private/tailnet`과 Tailnet DNS 허용 호스트를 명시적으로 설정한다. 이 도구는 인증 비밀값이 없으면 설정을 거부하고, 기존 `config.json` 백업을 먼저 남긴다.

```powershell
.\scripts\Set-SPSWorkplaneAccessMode.ps1 -Mode PrivateTailnet -AllowedHostname "your-machine.tailnet.ts.net"
```

4. Workplane을 재기동한다.

```powershell
.\scripts\Start-SPS.ps1 -Restart
.\scripts\Test-SPSWorkplaneCollaboration.ps1 | Format-List
```

`state=collaboration_ready`가 될 때까지 초대하지 않는다. Workplane 부트스트랩은 이제 SPS 설정 파일의 실제 bind host/port를 읽으므로, Tailnet 전환 뒤에도 기존 서버를 중복 기동하지 않고 상태를 확인한다.

`Set-SPSWorkplaneAccessMode.ps1`은 다음 명시적 모드를 제공한다.

| 모드 | 용도 | 필수 입력 |
| --- | --- | --- |
| `LocalOnly` | 한 PC에서만 사용하는 기본 안전 상태 | 없음 |
| `PrivateTailnet` | 서로 다른 네트워크의 소규모 팀 | `-AllowedHostname`과 인증 비밀값 |
| `PrivateLan` | 신뢰 가능한 같은 LAN | `-AllowedHostname`과 인증 비밀값 |
| `Public` | HTTPS reverse proxy 뒤의 외부 서비스 | `-AllowedHostname`, `-PublicBaseUrl`, 인증 비밀값 |

이 명령은 포트 포워딩, 방화벽 변경, 비밀값 생성·노출, 사용자 초대를 자동으로 수행하지 않는다. 적용 뒤에는 항상 preflight와 두 브라우저 수동 검증을 거친다.

개발 환경에서는 실제 배포 인스턴스를 건드리지 않는 인증 다중 사용자 E2E도 실행할 수 있다.

```powershell
.\scripts\Test-SPSAuthenticatedMultiUserE2E.ps1
```

이 테스트는 임시 Docker PostgreSQL, 별도 임시 데이터 디렉터리와 포트에서 SPS을 실행하고, Owner 가입, Operator 초대/참여, Viewer 권한 하향, Viewer의 초대 API 거부를 실제 Chromium으로 확인한 뒤 임시 서버, 데이터베이스, 데이터를 정리한다.

## 다른 노출 방식

| 방식 | 사용 조건 | 판단 |
| --- | --- | --- |
| 인증된 Private LAN | 모든 사용자가 같은 신뢰 가능한 LAN에 있을 때 | 가능하지만 Tailnet보다 범위가 넓다. |
| 인증된 Public + HTTPS reverse proxy | 제품을 외부 사용자에게 제공할 때 | 운영용 선택지. HTTPS URL, 백업, 모니터링, 사용자 초대 정책이 필요하다. |
| `0.0.0.0`만 열기 | 인증 또는 HTTPS 없이 포트만 노출 | 사용하지 않는다. |

## 사용자와 권한

네트워크에 접근할 수 있어도 모든 사용자가 Agent 정책을 바꾸면 안 된다.

| 사람 | 기본 권한 |
| --- | --- |
| Owner/Admin | 사용자 초대, Organization 정책, Agent 모델/도구/CLI 계정 구성 |
| Operator | Project, Room, Task에서 협업하고 메시지/첨부/검토 수행 |
| Lead Agent | 권한 정책 안에서 Worker Task 생성, 배정, 검토, 기술적 완료 판단 |
| Worker Agent | 배정된 Task 실행과 Task Room 보고 |

친구는 보통 `Operator`로 초대한다. 서버 설정, Agent 계정, 조직 위임 정책을 바꿔야 할 때만 Admin을 부여한다.

### Project 경계

`project_memberships`는 여전히 사용자별 참여/즐겨찾기 상태일 뿐 접근 제어 목록(ACL)이 아니다. 접근 제어는 Core의 `projects.access_mode`와 `project_access_grants`가 담당한다.

| 모드 | 동작 |
| --- | --- |
| `company` (기본값) | 기존처럼 활성 Company 구성원이 협업한다. |
| `restricted` | 명시적으로 부여된 사람과 Agent만 Project를 연다. Owner/Admin은 복구를 위해 항상 접근한다. |

Project `Configuration > Project access`에서 사람 또는 Agent에게 `Viewer`, `Collaborator`, `Manager`를 부여한다. `Manager`만 Project 설정 변경과 새 Task 배정 권한을 가진다. 배정된 Worker는 자신의 Task에 한정해 협업할 수 있으며, Lead는 `Manager` 권한이 있어야 새 Task를 만든다.

## 2인 브라우저 수락 테스트

1. Owner가 호스트 브라우저에서 `Organization`의 People and access로 초대를 만든다.
2. Operator가 다른 PC 또는 별도 브라우저 프로필에서 초대를 수락하고 로그인한다.
3. Owner가 별도 테스트 Project를 `restricted`로 전환하고 Operator에게 `Collaborator` 권한을 준다.
4. Operator가 허용된 Project의 Room, Task, 첨부를 읽고 댓글을 남긴다.
5. Operator가 권한을 받지 않은 Project를 열었을 때 거절되는지 확인한다.
6. Lead Room에서 Worker Task 하나를 만들고 배정한다.
7. Worker가 작업을 끝내면 Task 결과가 생성한 Lead의 원래 Room에만 보고되는지 확인한다.
8. Operator가 Agent policy/CLI account 변경을 시도했을 때 거절되는지 확인한다.
9. Owner/Admin이 같은 변경을 수행했을 때만 허용되는지 확인한다.

이 테스트가 끝나기 전에는 멀티 사용자 지원을 "배포 완료"로 표시하지 않는다.

## 운영 경계

- Memory Sidecar, local CLI credentials, Adapter 실행 경로는 호스트 PC 내부에 남긴다.
- 협업자는 SPS UI/API 권한으로 작업하지만 호스트 OS의 사용자 권한을 자동으로 얻지 않는다.
- Agent가 만든 Task의 소유 Lead Room, 보고 경로, workspace mapping은 네트워크 모드와 무관하게 유지된다.
- Core는 네트워크/인증/사용자 권한을 담당하고, Lead/Worker 작업 규칙과 Room workflow는 Workplane plugin이 담당한다.
- Project 접근은 `project_memberships`가 아니라 `access_mode`와 명시적 grant로 판단한다. 상세한 역할·복구 규칙은 `94-project-access-control-ko.md`를 따른다.
