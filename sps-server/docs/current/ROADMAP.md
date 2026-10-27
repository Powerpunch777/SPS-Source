# SPS 구현 로드맵

최종 갱신: 2026-10-27

## 현재 우선순위

제품은 **AI 선택형 범용 워크스테이션**이며 Core 비공개·SDK 공개를 유지한다.
현재 제품 계약은 [아키텍처](PRODUCT-ARCHITECTURE-ko.md), 다음 우선순위는
[Windows 내장 연결 계획](WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md)이다.
다중 실행 경로의 기반·수용 기준은 [다중 백엔드 계획](MULTI-BACKEND-WORKSTATION-PLAN-ko.md)에 보존한다.
구현 상태와 테스트 증거는 [재사용 감사](../reviews/MULTI-BACKEND-REUSE-AUDIT-2026-10-25.md),
[Core/Plugin 진행 기록](../reviews/CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md)으로 분리한다.

2026-10-27 현재 Core·Desktop은 Native 등록/복구, 승인된 Workspace 탐색과 격리 창,
개인 Inbox 상태 변경, 선택적 모델 연결 설정 및 Member의 만료 전 같은 키 갱신을
연결했다. [Workspace/Inbox 검증](../reviews/NATIVE-INBOX-STATE-2026-10-27.md),
[모델 설정 검증](../reviews/MODEL-HOST-SETTINGS-2026-10-27.md),
[Member 갱신 검증](../reviews/NATIVE-MEMBER-RENEWAL-2026-10-27.md),
[Host 갱신과 Member target 전환](../reviews/NATIVE-HOST-RENEWAL-2026-10-27.md)이 각 범위와 한계를 기록한다.
Native 기본값은 OFF다. issuer 회전·만료 후 신뢰 복구, Native Source/Node, 실제 AI 실행,
설치/업데이트/복원과 물리 두 PC 및 보안 게이트는 남아 있다.
후속 [Native Plugin 실행 기반](../reviews/NATIVE-PLUGIN-EXECUTION-FOUNDATION-2026-10-27.md)은
기존 앱 작업자와 비공개 고정 호출을 연결하고 호출별 현재 권한·취소·결과 전달 경계를 추가한다.
실제 선언 shell/widget 화면은 별도 Native Plugin 창에서 실행하고, 상대 모듈·CSS/자산과
데이터/액션 호출을 연결했다. joined Electron/Core/DB E2E에서 상태 변경·비활성화 차단과 자연 종료를 통과했으며,
스트림·Host 탐색/알림·전체 공개 SDK 지원은 미완료다. 자세한 범위와 증거는
[Native Plugin UI 기록](../reviews/NATIVE-PLUGIN-UI-2026-10-27.md)을 참조한다.
후속 [공개 Native 연결 SDK](../reviews/NATIVE-CONNECTIVITY-SDK-2026-10-27.md)는
현재 호출의 검증된 연결 근거만 읽는 `connectivity.current()`와 전용 read capability를 추가한다.
전체 Host 목록·연결 생성·이벤트 구독·실행 권한을 제공하는 API는 아니며 아직 미출시 소스다.
아래는 단계별 이전 구현·검증 이력이며, 전체 플랫폼 완성이나 현재 배포 승인을 의미하지 않는다.

최신 local 관리 increment: 준비된 Host의 직접 소유 Core 자식에 Owner 세션 결속
기기 status/list/events/approve/revoke를 연결하고, 독립 Core Settings에 목록과
명시적 승인/철회를 추가했다. 확인창 도중 계정/Host/기기 변경 거부와 이전 목록 제거,
조회/변경 트랜잭션 세션 재검사를 포함한다. LAN OFF·등록/초대/갱신 미연결이며
준비된 Host의 실제 승인 전체 앱 흐름과 두 PC/서명본 검증은 남아 있다.
[기기 관리 검증](../reviews/NATIVE-HOST-MANAGEMENT-VERIFICATION-2026-10-25.md)을 따른다.

후속 [준비된 Host 소스 앱 수용](../reviews/NATIVE-PREPARED-HOST-ACCEPTANCE-2026-10-26.md)은
시험용 보호 identity를 실제 Main이 재독해한 뒤 기기 관리의 available 빈 목록을
조회하는 경로를 통과했다. Plugin startup 차단/0-Agent/일반 renderer 403과 재시작을
검사했지만 보안 확인창·실제 기기 enrollment/승인·LAN/물리 두 PC 수용은 아니다.

[등록 HTTP 경계](../reviews/NATIVE-ENROLLMENT-HTTP-BOUNDARY-2026-10-26.md)는 기존
세션·초대·발급 서비스를 한도/기한/late-effect guard와 조합해 loopback TLS/mTLS 및
임시 DB에서 검증했다. 제품 mount·앱 세션 교환·LAN listener·HTTP/WS 전체 인가는 미완료다.

1. Windows Desktop/Host/Member/Node를 우선 안정화하고, 외부 Tailscale 없이 동작하는
   내장 **LAN** 경로를 개발한다. Stage 0 감사는 완료했고, 전체 초대코드와 서버 지문
   확인(D1), PC별 mTLS 인증서(D2), LAN 기본 off/명시 opt-in(D3)이 승인됐다. Core 기기
   registry·승인/철회·현재 Workspace 인가·선택적 mTLS/WS 경계와 일회용 pairing 저장은
   source 기반이다. 신뢰된 Host 전용 Core Settings에서 명시 확인 후 인증서를 준비하는
   좁은 경로가 연결됐다. 비활성 Member PKCS#10 요청/인증서 발급과 loopback mTLS 시험도 추가했다.
   고정 issuer PEM/SPKI·Host/device·로컬 키/CSR·chain/profile을 검사하는 recipient validator와,
   계정 issuer origin/subject·Host/device·신뢰 pins를 ciphertext 안에 결속하는 Windows pending capsule도 있다.
   private pending filestore도 구현됐다. Owner Vault 밖의 논리 account/Host/device slot에 first-writer/create-only로
   저장하고 pins는 암호문 안에만 둔다. 덮어쓰기·삭제·자동복구는 없고 caller는 격리 smoke뿐이다.
   발급 응답은 기존 키를 보존한 별도 create-only issued companion에 암호화 저장하고 재독해 시
   pins·원래 키/CSR·chain/profile·현재 인증서 만료를 검사한다. 새 Host issuer는 이전 인증서를
   실제 loopback TLS 1.3에서 거부했다. unit AES는 DPAPI 증거가 아니며, Source `48a35262` Windows CI에서
   실제 43.8.3/24.22.0 DPAPI 재독해는 별도로 통과했다. Main/IPC·GUI·enrollment caller 연결은
   아직 없다. 저장 후 guard 실패는 파일 rollback을 보장하지 않는다.
   [발급 자격 저장 검증](../reviews/NATIVE-MEMBER-ISSUED-STORE-VERIFICATION-2026-10-25.md)을 따른다.
   이는 제품 enrollment·사용자 인증·기기 승인·Workspace/Node/Source grant가 아니다.
   LAN은 OFF: Native LAN listener·방화벽 변경·Member 발급 활성화·enrollment·세션 등록·갱신은 없다.
   D7은 server/Member 90일·issuer 365일과 기존 키 갱신 정책 승인이지, 실제
   갱신 구현은 아니다. 미출시 v2 DPAPI store의 Vault-incarnation 결속·복구·process-local
   interlock 한계는 [계획](WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md)에 기록한다.
   Source `425000cb` CI는 실제 Host/새 Member filestore의 Windows safeStorage 프로세스 간 재독해를
   Electron 43.8.3 / Node 24.22.0에서 통과했다. Settings와 9개 Linux shard/typecheck/build도 통과했지만
   No-AI의 elevated PostgreSQL 거부와 Zod gate로 전체 실패다. Source `1cddbcf7`의 첫 CI 실행기 보완도
   Windows 초기화 오류로 unit 5개 실패해 뒤 E2E가 건너뛰어졌다. Source `1e6152a8`의 시험 전용
   desktop 후속도 동일하게 unit 5개 실패했고 Native/Settings/No-AI는 실행되지 않았다. 새 restricted token의
   default DACL에 사용자 SID를 추가하는 보완은 로컬 8/8이나 elevated CI는 검증 전이다.
   Core `0955e8f63`은 초대별 공개 발급 기록과 실제 mTLS 소켓 완료를 조정하는 비활성 내부 서비스를
   추가했다. 발급은 초대를 소비하지 않고 완료 때만 pending 등록·소비·감사를 원자적으로 처리한다.
   해당 revision의 집중 40/40·전체 typecheck/build와 Core PR CI 15/15 job은 통과했다.
   후속으로 직접 소유한 Main→Core 자식의 공개 서명 IPC 및 명시적 Core factory를 추가했다.
   Main은 현재 Host 세션/저장 identity/account generation을 재확인하고 개인키를 전달하지 않는다.
   중복 Host start는 하나로 합치며 start 중 stop은 늦은 spawn을 차단한다. 채널 disconnect/dispose는
   새 호출과 마지막 DB write를 차단한다. 제품 session caller/등록 UI/ingress·자격 저장 caller·갱신은 아직 없다.
   비활성 session adapter는 실제 SPS Identity 쿠키와 exact session/user/expiry를 발급·등록 트랜잭션에
   결속하며 wrong-secret 예산 전·마지막 write 뒤 재검사한다. 다른 user guard 조합은 거부하고,
   local logout은 shared row lock으로 순서를 정한다. 제품 session exchange/route mount는 아직 없고
   실제 HTTPS·fixture RSA session·mTLS 소스 시험을 물리 PC나 Google 운영 증거로 사용하지 않는다.
   [세션 결속 검증](../reviews/NATIVE-SESSION-ENROLLMENT-VERIFICATION-2026-10-25.md)을 따른다.
   Source `7311041b` push CI `40190150149`는 16/18 job 성공이다. 9개 Linux shard/full build와
   Windows Native DPAPI·Settings·No-AI·packaged Workspace surface는 통과했지만 packaged Preview는
   실제 Assistant 등록의 서버 오류로 실패했고 Zod gate도 차단됐다. Core `ed45c51c` PR CI
   `40190064373`는 15/15 성공이다. 이 CI를 후속 issued companion 검증으로 재사용하지 않는다.
   후속 Source `48a35262` push CI `40197294957`도 16/18 성공이며 companion DPAPI·Settings·No-AI·
   packaged Workspace는 통과했지만 Assistant 등록 500/보류 Zod는 남았다. Desktop의 서버 자산 복사
   누락을 별도 재현하고 패키징 gate를 보완한다. [자산 검증](../reviews/PACKAGED-AGENT-ASSETS-VERIFICATION-2026-10-25.md)을 따른다.
   [서명 채널 검증](../reviews/NATIVE-SIGNER-CHANNEL-VERIFICATION-2026-10-25.md)과
   [CI 채널 관측](../reviews/NATIVE-CI-CHANNEL-CHECKPOINT-2026-10-25.md)을 따른다.
   [등록 조정·CI 후속 검증](../reviews/NATIVE-ENROLLMENT-ORCHESTRATION-VERIFICATION-2026-10-25.md)을 따른다.
   기존 복구·Source·Node 권한과 Zod High `1243066` 보류·Low 2건 등 출시 Gate는 유지한다.
   UI token gate·Tailscale-free Source·Host 승인/복구의 전체 앱/물리 수용도 미완료다.
   정확한 명령·수·runtime·CI revision은 아래 검증 기록에 모으며,
   개발 UI 결과를 서명 설치본 또는 두 PC 증거로 사용하지 않는다.
   [Member 기기 검증](../reviews/NATIVE-MEMBER-DEVICE-SOURCE-VERIFICATION-2026-10-25.md)과
   [pairing 저장 검증](../reviews/NATIVE-PAIRING-STORE-VERIFICATION-2026-10-25.md),
   [Member 인증서 검증](../reviews/NATIVE-MEMBER-CERTIFICATE-VERIFICATION-2026-10-25.md),
   [Member 자격 검증](../reviews/NATIVE-MEMBER-CREDENTIAL-VERIFICATION-2026-10-25.md),
   [pending 저장 검증](../reviews/NATIVE-MEMBER-PENDING-STORE-VERIFICATION-2026-10-25.md),
   [설정/복원 lifecycle 검증](../reviews/NATIVE-SETTINGS-RESTORE-VERIFICATION-2026-10-25.md)을 따른다.
2. Native 초기 연결·승인·철회·복구를 0-Agent/0-Plugin에서도 제공한다. 기존 사용자
   인증·Workspace/Plugin·Node 실행 권한은 분리하고, HTTP/WS 양쪽에 적용한다.
3. API·Owner 복구·Host Source/SMB의 별도 의존성을 이전/검증한다. 실제 Windows 두 PC와
   동일 서명본 수용 전에는 기존 Tailscale/설정/지원표를 삭제하거나 무음 전환하지 않는다.
4. 승인 Connection의 최소 SDK 조회/상태·관측을 공개한다. Plugin에 원시 키/관리자
   소켓 API를 주지 않는다. WAN/Relay 및 Linux 제품 구현은 후속 결정으로 둔다.

아래는 이미 확보한 소스 기반이며 새 연결 완료 증거가 아니다. 이 기반을 보존하면서
CLI/Gateway/OCE의 후속 확장보다 위 Windows 연결 작업을 먼저 진행한다.

## 기존 소스 기반과 후속 실행 경로

1. No-AI reference의 소스 수용을 완료했다. 실제 UI/state/events/Workspace Job,
   A/B 거부·Host 재시작·Native 복구는 [수용 기록](../reviews/NO-AI-WORKSPACE-ACCEPTANCE-2026-10-25.md)을 따른다.
   Node/session 등 기존 계약은 필요한 후속 연결에서 개별 검증한다.
2. Node Runtime의 읽기 전용 연결 관측(Stage 2a)을 기존 API에 추가하고 source
   Desktop에서 검증했다. [관측 수용 기록](../reviews/RUNTIME-DISCOVERY-ACCEPTANCE-2026-10-25.md)을 따른다.
   Host 초기화 API 등록 snapshot과 공개 reader(Stage 2b)도 실제 권한 거부까지
   검증했다. [Host 지원 수용 기록](../reviews/HOST-SUPPORT-ACCEPTANCE-2026-10-25.md)을 따른다.
   안전한 Agent 실행 설정 조회(Stage 2c)는 기존 list/get을 보존하며 config/키 없이
   별도 Node binding 관측을 제공한다. [Agent 수용 기록](../reviews/AGENT-EXECUTION-DESCRIPTOR-ACCEPTANCE-2026-10-25.md)을 따른다.
   모델 요청·CLI·Agent 세션과 OCE 관리의 서로 다른 능력/권한/실행 소유권은 계속 정렬한다.
3. Direct API Stage 3a의 내부 전송/Secret 기반에 Stage 3b의 Host 연결·grant,
   공개 `models.list/submit/get/cancel`, 중복 방지 Run과 별도 실행 기록을 결속했다.
   Host 모델 연결·Plugin 승인 설정 UI는 기존 API에 연결했고,
   실제 제공자 인증은 아직 검증하지 않은 mock-first source 범위다.
   [Host 설정 후속](../reviews/MODEL-HOST-SETTINGS-2026-10-27.md)을 따른다.
   [Stage 3b 검증 상태](../reviews/MODEL-BROKER-ACCEPTANCE-2026-10-25.md)를 따른다.
   [Stage 3a 검증](../reviews/MODEL-TRANSPORT-FOUNDATION-ACCEPTANCE-2026-10-25.md)은
   당시 내부 기반의 증거로만 유지한다. CLI 사례도 승인된 시험 범위에서 구현한다.
   실키·고객 데이터·유료 API 및 실제 게임 빌드 환경은 별도 확인.
4. 기존 Gateway adapter의 고정 버전 호환을 검증하고 OCE는 별도 read-only Connector부터.
5. 기존 Builder/Preview를 소비자로 연결하고 게임 개발 워크스테이션의 실제 사용을 실증.

선택적 Primary/Extension·UI 자유, Native 복구, OS/renderer 보호, Workspace stop·
데이터 수명주기는 기존 [비파괴 이전 계획](../reviews/CORE_PLUGIN_ARCH_MIGRATION_PLAN.md)을
이어간다. 다중 백엔드 조사로 완료 처리하거나 OCE로 대체하지 않는다. 서명·Identity·
최신 보안/의존성·Linux·물리 두 PC 릴리스 게이트 역시 별도 유지한다.

## 2026-07-30 계획 이력

아래의 완료/다음 단계 표기는 당시 범위의 기록이며 현재 후보나 2026-10-25 목표
완료 판정으로 사용하지 않는다. Agent 필수 연결·필수 공통 Shell을 전제한 문장은
위 현재 계약으로 대체된다. 기존 증거는 날짜/tuple과 함께 보존한다.

현재 제품 정의는 [PRODUCT-ARCHITECTURE-ko.md](PRODUCT-ARCHITECTURE-ko.md)이며, 자세한 구현
순서는 [CORE-WORKSPACE-PLUGIN-BASELINE-PLAN-ko.md](CORE-WORKSPACE-PLUGIN-BASELINE-PLAN-ko.md)를 따른다.
이 로드맵은 특정 AI 회사 구조를 Core 기능으로 만들지 않는다는 원칙 아래 진행된다.

플러그인 제작 기반의 세부 구현 순서와 완료 Gate는
[PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md](PLUGIN-PLATFORM-IMPLEMENTATION-PLAN-ko.md)를 따른다.

## 0단계: 기존 제품을 기준 구조에 맞추기 — 완료

- Company 중심 기본 UI를 Workspace 용어로 바꾸되, 기존 저장소는 일시적인
  마이그레이션 호환 계층으로만 유지한다.
- Paperclip Workplane 탐색과 Experimental 화면을 SPS 기본 Core UI에서 제거한다.
- Core 업무 역할 제어를 중립적인 Workspace 멤버십, Host/Node 신뢰,
  플러그인 전용 실행 Grant로 바꾼다.
- 현재 Project Source UI를 Host 소유의 이름 있는 Workspace Source로 바꾼다.

완료 기준: 새 Workspace에는 Discovery & Builder 플러그인, Host/Member 기술 설정만
있고 내장 Room/Task/역할 흐름이 없다.

## 1단계: Host, Member, Node, Source 기본 루프 — 자동 검증 완료, 물리 장치 확인 대기

- SPS 로그인, Host 생성, 초대, Member 참여, Node 승인/철회, 재시작 복구,
  Tailscale 전용 접근을 검증한다.
- Member가 선택한 로컬 Runtime만 공개하고 Credential은 로컬에 유지한다.
- Host가 여러 Workspace Source를 관리하고 플러그인 전용 Source Grant로 Member가
  편집하게 한다.
- Member 제거 시 활성 접근, Node, Runtime 연결, Grant는 즉시 제거하고 과거 기록은
  보존한다.

완료 기준: 패키지된 Host와 Member Desktop이 실제 Host 프로젝트 Source를 사용해
전체 루프를 완료한다.

## 2단계: 안정적인 플러그인 플랫폼 — 엔지니어링 기준 완료

- Extension Profile, Manifest, 호환성, Capability, 데이터 격리, 마이그레이션,
  실행, Connector, UI 계약을 공개한다.
- 플러그인은 Workspace별로 동작한다. 비활성화는 되돌릴 수 있고, 완전 삭제는
  SPS 내부 데이터만 지우며 프로젝트 폴더는 보존한다.
- 공식 Registry와 로컬 개발 패키지만 제공한다.
- Conformance Test, Test Kit, 패키지 검사, 단계적 업데이트, Rollback, Backup,
  Diagnostics를 만든다.

완료 기준: 플러그인 작성자가 SPS Core를 수정하지 않고 외부 폴더에서 개발, 검사,
설치, 활성화, 비활성화, 업데이트, 복구, 삭제를 할 수 있다.

## 3단계: 기본 Discovery & Builder 플러그인 — 완료

- 새 Workspace에서 유일한 기본 활성 플러그인으로 만든다.
- 첫 Assistant에 Host가 선택한 Runtime을 필수로 연결한다.
- Catalog 검색과 플러그인 설계 도구만 제공하고 자동 설치/활성화는 하지 않는다.
- 생명주기 변경은 `설정 > 플러그인`의 명시적 행동으로 연결한다.

완료 기준: 빈 Workspace에서 원하는 작업 방식을 설명하면 숨겨진 Workplane 없이
안전한 추천이나 플러그인 설계를 받을 수 있다.

## 4단계: 베타 준비 — 다음 단계

- Core가 범용 Workspace Shell, Dashboard, Inbox를 제공하고 플러그인이 위젯,
  보고, 행동, 탐색 구성을 제공하는 계약을 구현한다. 상세 기준은
  [WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md](WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md)를 따른다.
- Host와 Member의 패키지된 Desktop 사용성과 안정성을 전체 점검한다.
- 업데이트 호환성, 플러그인 마이그레이션 검토, 백업/복원, 삭제, Node/Source 철회,
  네트워크 중단 후 재시도와 진단을 시험한다. SPS 1차 버전은 오프라인 제품 모드를
  제공하지 않는다.
- Windows/Tailscale 지원 범위, 알려진 제한, 개인정보와 백업 안내, 출시 점검표를
  공개한다.

완료 기준: 소규모 비공개 베타 사용자가 개발자 콘솔 없이 독립 Workspace를 만들고,
안전하게 Host에 참여해 공식/로컬 플러그인을 사용할 수 있다.

## 베타 이후

- 커뮤니티 게시, 제3자 Registry, 신뢰/평판, Marketplace 검토 과정
- Access Control, Team Workplane, Memory Provider, Game, Web, App,
  Plugin Development Pack 같은 선택형 공식 작업 플러그인
- 추가 운영체제와 승인된 네트워크 방식
