# SPS Desktop 계정·초대·Member Node 출시 계획

> 상태: 현재 기준 설계. Owner Host와 메모리의 권위 있는 기준은
> `111-sps-owner-host-and-memory-platform-architecture-ko.md`다.

## 1. 제품 결정

SPS Desktop은 Windows용 앱 하나로 출시한다.

- 메인 PC에서는 SPS Core와 SPS Default Memory를 포함한 **Owner Host**를 내부에서 시작하고
  암호화된 Owner Vault를 관리한다.
- 팀원 PC에서는 같은 앱이 **Member Node**가 되어 자기 컴퓨터의 Codex CLI, Agy, Ollama,
  LM Studio, 전문 API 도구를 실행한다.
- Workspace, Rooms, Tasks, 초대, 권한 설정은 브라우저가 아닌 Desktop 앱 창에서 사용한다.
  Google 승인만 기본 브라우저를 잠깐 연다.

개인과 소규모 팀의 기본 Host는 Owner PC다. `redongames.com`은 회사 웹사이트이며, 공용
`app.redongames.com` 또는 외부 Docker Host는 후속 배포 선택지다.

## 2. 첫 실행

### Owner

1. Owner가 SPS Desktop을 실행하고 `Use Owner Host`를 선택한다.
2. 앱이 Owner Vault, Core, SPS Default Memory를 준비하고 Workspace를 연다.
3. 한 대만 쓰면 Local/offline으로 사용한다.
4. 팀원을 연결할 때만 Private team access(Tailscale) 또는 Public HTTPS를 선택한다.
5. Private team access는 시스템 Tailscale과 Google OAuth redirect URI가 준비된 경우에만
   활성화한다. Core는 loopback에만 바인딩된다.

### Member

1. Owner가 SPS Desktop의 Private team access에서 한 번 쓰는 Operator 사람 초대를 생성한다.
   초기 Owner 설정에 쓰인 Owner 초대는 절대로 공유하지 않는다.
2. Member는 SPS Desktop을 설치하고 `SPS2-...` 초대 코드를 붙여넣거나
   `sps://join` 딥링크를 연다. `SPS2` 코드는 Team Host 주소와 일회용 초대를 함께
   담으므로 새 컴퓨터도 수동 주소 입력 없이 시작할 수 있다.
3. 앱이 Host 주소를 저장하고 브라우저 초대를 열어, 연결 가능 여부와 초대 상태를 표시한다.
4. Member가 Google 로그인을 마치고 초대를 수락한다.
5. Member는 Workspace만 열거나, `Scan local capabilities`와 `Connect this computer`로
   Node 등록까지 계속한다.
6. Owner가 Node를 승인하고 필요한 Agent만 grant한다.

초대 코드는 계정, Node 승인, Agent 실행 권한, CLI/API 키를 대신하지 않는다. 각각은
별도의 확인과 권한 부여 단계다.

`SPS-XXXX-...` 짧은 코드는 이미 Team Host 주소가 저장된 Desktop에서만 사용하는
호환 입력이다. 새 Member에게는 자기완결형 `SPS2-...` 코드만 전달한다.

## 3. 초대 코드 UX

초대 생성 화면은 다음을 제공한다.

- 초기 회사 역할: Viewer, Operator, Admin, Owner
- 만료 시간: 15분, 1시간, 24시간, 7일
- 사용 횟수: 기본 1회
- 짧은 코드, 브라우저 초대 URL, 데스크톱 딥링크, QR
- 취소, 만료, 이미 사용됨, 잘못된 코드의 명확한 상태와 감사 로그

코드는 서버에 해시로만 저장한다. Desktop은 공백, 대소문자, 하이픈이 섞인 입력을 정규화하고,
HTTPS Team Host 외의 주소나 오래된 경로 조각을 거부한다.

## 4. Node 연결 UX

Member Node 설정 화면은 순서를 숨기지 않는다.

1. Host 연결 확인
2. Google 로그인
3. 회사 선택
4. 로컬 capability 스캔
5. Node 등록 및 Owner 승인 대기
6. Agent별 실행 권한 부여
7. 프로젝트별 작업 폴더 연결

Node가 pending이면 앱은 “Owner 승인 대기”, revoked이면 “다시 등록 필요”, active이면
“허용된 Agent 실행 가능”으로 표시한다. CLI 로그인 만료, Host 연결 오류, 작업 폴더 누락,
로컬 모델 중지, Node 오프라인은 실행 전에 구체적으로 알린다.

Host에는 실행기 종류와 버전, 동의한 capability, Node 상태만 공개한다. 실행 파일의 절대
경로, Codex/Agy 로그인, API 키, 로컬 모델 파일과 프로젝트 파일은 Member PC에 남는다.

## 5. 권한 모델

| 권한 | 의미 |
| --- | --- |
| `view` | Agent와 허용된 상태/보고를 본다 |
| `chat` | Agent Room에서 대화한다 |
| `assign_task` | Lead로서 Worker에게 Task를 만든다 |
| `review` | 완료/차단 보고를 검토한다 |
| `configure` | AGENTS.md, 모델, 도구, Agent 설정을 바꾼다 |
| `run_here` | 특정 Node에서 해당 Agent 실행을 허용한다 |

사람 x Agent 권한과 Node x Agent 실행 grant는 분리한다. Worker는 기본적으로 Task 생성 권한이
없고, Lead만 Task를 만든다. Agent의 기본 Node는 하나지만, Owner가 추가 허용 Node를 둘 수
있다. CLI 작업은 충돌하지 않는 작업 폴더와 세션이면 병렬 실행할 수 있고, 로컬 AI는 Node의
자원 정책에 맞게 보수적으로 제한한다.

## 6. 완료/차단 보고

Member Node가 실행한 Worker는 Task의 원본 기록에 결과, 근거, 산출물과 차단 사유를 남긴다.
Core는 Task를 만든 Lead Room으로 완료/차단 보고를 전송하고 Lead를 깨운다. 실행 실패나
메모리 Provider 장애가 원본 Task/Room 기록을 막아서는 안 된다.

## 7. 출시 기준

### 필수

- Windows 설치 프로그램, 코드 서명, 업데이트 확인
- Owner Host가 앱 내부에서 시작되고 Vault/기본 메모리가 재시작 뒤에도 보존됨
- Google 로그인과 일회용 초대 코드/딥링크로 Member가 회사에 참여함
- Owner가 Node 승인, Agent grant, 기본 Node 변경, revoke를 UI에서 수행함
- 친구 PC의 Codex CLI 또는 지원 로컬 AI가 승인된 Task만 실행함
- 결과가 원래 Lead Room에 보고됨

### 출시 전 실제 E2E

1. 메인 PC에서 새 테스트 회사와 Lead/Worker Agent를 만든다.
2. 두 번째 Windows PC에 서명된 SPS Desktop을 설치한다.
3. 초대 코드와 Google 로그인으로 Member를 참여시킨다.
4. Member PC의 capability를 등록하고 Owner가 Node를 승인한다.
5. Owner가 한 Worker에만 Node grant를 부여한 뒤 Task를 실행한다.
6. Member PC의 CLI 출력, Task 결과, Lead Room 보고를 확인한다.
7. grant를 해제해 신규 실행이 거절되는지 확인한다.
8. Owner Host와 Member 앱을 재시작해 상태와 기억 보존을 확인한다.

## 8. 범위 밖

- 다른 사람의 CLI 로그인 정보나 API 키를 Host로 업로드하는 기능
- Host가 Member PC에 직접 접속하거나 임의 셸 명령을 실행하는 기능
- 공개 인터넷에 무인증 Host를 노출하는 기능
- macOS/Linux 정식 지원
