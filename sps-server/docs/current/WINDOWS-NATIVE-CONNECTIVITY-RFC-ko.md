# RFC: Windows LAN trusted connectivity v0

작성일: 2026-10-25. 상태: **D1~D3·D7 정책 승인 / 좁은 Host 인증서 준비 연결 / Native LAN OFF**.
[계획과 결정 목록](WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md)의 Stage 0 산출물이다.
개념 이름 전체가 현재 export·endpoint를 뜻하지 않는다. 일부 Core 기기 관리 계약은
소스 기반으로 구현됐고, 신뢰된 Host 전용 Core Settings의 명시 확인 인증서 준비 경로만 연결됐다.
실제 Native LAN ingress는 연결되지 않았고 LAN은 사용할 수 없다.

## 현재 소스 기반

- Host 고정 기기 registry와 공개 인증서/상태 DTO, pending 등록, 로컬 Host의 승인·철회,
  redacted 감사 이벤트를 추가했다. Host ID는 신뢰된 생성자 설정이며 요청 값이 아니다.
- 현재 active Workspace·사용자 membership·기기 승인·인증서 만료를 함께 조회한다.
  기기 승인만으로 Workspace 가입·Plugin·Node·Agent·Source 권한은 생기지 않는다.
- 인증서 등록은 private key 보유 증명이 아니다. 별도 helper는 실제 TLS 1.3 socket의
  authorized clientAuth peer를 검증하고 매번 현재 인가를 조회한다. 시험은 loopback만 사용한다.
- 선택적 WS guard는 upgrade와 이벤트 전달 전 로그인 세션·기기 권한을 재검사한다.
  기존 local/Agent 경로에는 적용하지 않는다. 제품 Native ingress는 아직 없다.
- Core Settings는 신뢰된 Host 전용의 명시 확인을 거쳐 Host 인증서 준비를 호출한다. Member
  발급이나 세션 등록은 하지 않는다. LAN은 OFF이며 listener/방화벽 변경도 없다.
- 비활성 Member 발급 primitive는 표준 PKCS#10 P-256/SHA-256 서명 요청을 사용하며, 개인키는 Member
  로컬 메모리에 두고 공개 요청에서 제외한다. Host의 별도 issuer가 명시적 90일 이하·issuer 유효기간
  안의 non-CA `clientAuth`/`digitalSignature` leaf를 발급한다. Main 내부 서명 IPC는 추가됐지만
  HTTP/SDK·provisioning·갱신·새 GUI 흐름은 없다. 표준 TLS 1.3 loopback에서 새 인증서/올바른 키는 통과하고
  인증서 없음·다른 issuer·같은 issuer의 잘못된 EKU·다른 개인키는 거부했다(application bytes 0).
  CSR 서명 검증은 live TLS 키 소유 증명과 별개다. 자체 서명 프로토콜이나 Google 로그인·기기 승인·
  Workspace/Node/Source grant·새 enrollment를 구현한 것이 아니다.
- Member recipient validator는 고정 issuer PEM/SPKI, Host/device RDN, 로컬 개인키/CSR,
  chain/profile·90일 상한·SKI/AKI를 검사한다. 공개 상태는 기기 승인이나 접근 권한이 아니다.
- Windows Member pending capsule은 주입된 `safeStorage`로 serialized JSON을 암호화/복호화하며
  Identity issuer origin·subject·Host/device·신뢰된 server/issuer pins를 ciphertext 안에만 결속한다.
  private pending filestore도 소스로 구현됐다. Owner Vault 밖의 논리 account/Host/device slot에 first-writer/create-only로
  저장하고 pins는 암호문 context에만 둔다. 덮어쓰기·삭제·자동복구는 없다. unit AES는 DPAPI가 아니며 caller는
  격리 smoke뿐으로 Main/IPC·GUI·enrollment caller 연결은 없다.
- Member issued companion은 원래 pending 키 파일과 별개의 create-only 암호화 파일에 공개
  발급 응답만 저장한다. 신뢰된 account/Host/device/pins·원래 키/CSR·chain/profile·현재 인증서
  만료를 재검증하며 초대 완료 기한을 인증서 만료로 취급하지 않는다. 저장 후 guard 실패에도
  파일이 남을 수 있고 자동 삭제/덮어쓰기/rollback은 하지 않는다. 재독해한 원래 키의 실제
  loopback TLS 1.3 handshake는 소스 증거이며 새 Host issuer는 이전 인증서를 거부한다.
  새 companion의 실제 Windows DPAPI·앱 enrollment·LAN·두 PC·갱신은 미검증이다.
  [발급 자격 저장 검증](../reviews/NATIVE-MEMBER-ISSUED-STORE-VERIFICATION-2026-10-25.md)을 따른다.
- 미출시 v2 Host identity store는 DPAPI context를 Vault incarnation `dev`/`ino`/`birthtimeNs`에
  결속한다. 이는 로컬 lifecycle 결속이지 attestation이 아니다. 유효한 새 Vault에 slot이 없으면
  `not_prepared`이며 준비를 허용한다. 기존 slot과 함께 Vault incarnation이 없거나 재생성/손상된
  경우 명시적 복구가 필요하고 자동 교체하지 않는다. restore 시 상태 미상은 fail closed다.
- Host 시작/restore interlock은 captured account를 쓰는 process-local guard이며 OS lock 보장은 없다.
- Member 인증서 발급 활성화·session enrollment·갱신·최초 pairing 전송·HTTP/파일/기타 WS 전체 경계·
  전체 Member UI·물리 두 PC는 후속이다.
- 내부 pairing 저장 계층은 가입 전 verified 계정의 pending 등록과 일회용 소비를 같은
  트랜잭션으로 처리한다. HTTP/인증/TLS 호출자는 미연결이다. D6 승인으로 Desktop 기본값은
  코드를 받은 verified 사용자와 1시간/일회 소모다. 기기 승인·Workspace 권한은 별도다.
- Core `0955e8f63`의 비활성 내부 enrollment 조정은 공개 발급 기록을 초대별 하나로 예약하고,
  신뢰된 signer callback 뒤 초대·전체 결속 tuple을 재검사해 공개한다. 실제 authorized/non-resumed
  TLS 1.3 소켓의 정확한 발급 leaf만 원자적 소비·pending 등록에 쓴다. 서명 timeout/동시성은
  명시적인 인스턴스 한도이며 무응답 signer는 종료까지 slot을 유지한다. 재시작 중단 기록은
  자동 재서명하지 않는다. 실제 session caller/ingress/UI는 없고 DB verified flag는 로그인 증거가 아니다.
  집중 40/40 및 Core typecheck/build는 소스 증거이며 실제 앱/LAN/두 PC 수용이 아니다.
- 직접 소유한 Main→Core 자식 IPC의 공개 인증서 서명 채널과 Core 명시적 composition factory를 추가했다.
  Main만 로컬 Host 세션·저장 identity를 확인하며 개인키·계정 token·경로는 전달하지 않는다.
  계정/서버 변경·restore generation, 취소·timeout·disconnect·dispose 후 결과를 차단하고 Core의
  마지막 트랜잭션 write도 lifecycle guard로 거부한다. factory는 자동 활성화하지 않는다.
  이 채널은 Native 로그인/기기 승인/Workspace/Node/Source 권한이나 OS 격리를 대신하지 않는다.
  [서명 채널 검증](../reviews/NATIVE-SIGNER-CHANNEL-VERIFICATION-2026-10-25.md)을 따른다.
- 비활성 session adapter는 실제 SPS Identity 쿠키의 사용자와 exact session ID/digest/user/expiry를
  발급/등록 트랜잭션에 결속한다. shared lock으로 로컬 logout과 순서를 정하고 verified/no-membership
  최초 사용자를 수용하되 다른 사용자 authorizer·본문 userId·Agent/API token 대체는 거부한다.
  실제 fresh TLS 1.3 POST/JSON과 단일 Cookie만 쓰고 browser origin/Authorization은 거부한다.
  제품 mount나 세션 교환 ingress는 없으며 중앙 Google 로그아웃 전파나 Main 호출자 자체의 증명은 아니다.
  [세션 결속 검증](../reviews/NATIVE-SESSION-ENROLLMENT-VERIFICATION-2026-10-25.md)을 따른다.

정확한 시험과 한계는 [Member 기기 소스 검증](../reviews/NATIVE-MEMBER-DEVICE-SOURCE-VERIFICATION-2026-10-25.md)과
[Member 인증서 검증](../reviews/NATIVE-MEMBER-CERTIFICATE-VERIFICATION-2026-10-25.md),
[Member 자격 검증](../reviews/NATIVE-MEMBER-CREDENTIAL-VERIFICATION-2026-10-25.md)을 따른다.
현재 파일 adapter의 정확한 증거는 [pending 저장 검증](../reviews/NATIVE-MEMBER-PENDING-STORE-VERIFICATION-2026-10-25.md)에 있다.

## 1. 목표와 비목표

Windows Host와 별도 Windows Member가 Tailscale 없이 승인된 LAN에서 연결한다.
Core의 사용자/Workspace/Plugin 권한과 Native 복구를 재사용한다. TLS 전송 성공,
사용자 로그인, 기기 승인, Workspace 권한, Node 실행 승인을 합치지 않는다.

이번 RFC는 WAN/Relay, 자동 검색, 파일 동기화, 자체 암호, 새 업무 역할, Linux 구현을
정하지 않는다. Host Source 공유는 별도 D4 Gate다. 구 Tailscale·초대·데이터와
Builder/Preview를 파괴하지 않는다.

## 2. 신뢰 주체와 공격자

- Host identity: endpoint 주소와 구별되는 안정된 신원. 키 교체는 승인과 감사 필요.
- User: 기존 SPS Identity 검증을 통과한 사용자. 로그인만으로 Host 사용 권한 없음.
- Member device: Node 실행 키와 별도 용도인 승인된 장치 자격. 사용자와 Host에 결속.
- Session: Host·사용자·기기·인증 generation·수명에 결속된 현재 연결 권한.
- Workspace/Plugin invocation: 서버가 유도한 현재 실행 문맥과 activation/capability.
- Node/Runner/Source: 기존 별도 grant/lease를 유지하는 실행·파일 권한.

LAN 도청/중간자·거짓 서버·초대 탈취·재생·미승인/철회 기기·악성 Plugin/UI·A/B
접근·중복 요청·호스트 재시작을 시험한다. 같은 OS 사용자의 공격적 프로세스를 막는
완전 격리는 현행 구현의 보장이 아니다. `safeStorage`나 앱 sandbox만으로 이 위협을
해결했다고 주장하지 않는다. 보호 미지원 실행은 fail-closed 또는 기존 승인된 신뢰
실행 표기를 유지하며 내장 연결을 이유로 보호 수준을 올려 표시하지 않는다.

## 3. TLS와 trusted ingress

TLS 1.3의 검증된 라이브러리와 서버 신원 검증이 전제다. D1은 전체 초대코드에 Host
서버 지문을 담아 신뢰한 별도 채널로 전달하고 앱에서 확인하는 방식으로 승인됐다.
고객 관리 CA는 후속이다. D2는 PC별 별도 Member mTLS 인증서와 Host 승인 방식으로
승인됐다. D3는 LAN 기본 꺼짐·명시 opt-in·선택 사설망/전용 TLS 포트이며 실제
방화벽/LAN 시험은 별도 동의가 필요하다. **D7 승인(2026-10-25):** 서버와 Member 기기
인증서의 기본 유효기간은 각각 90일, 별도 issuer CA는 365일이다. 승인 상태인 기기는
기존 키와 검증된 현재 신원으로 만료 전에 갱신하며, 키 변경/분실 시 명시적 재신뢰와
재승인이 필요하다. 철회된 기기는 갱신하지 않으며 주기적 재로그인이나 초대코드 재입력을
강제하지 않는다. 자체 challenge 서명 알고리즘, 인증서 오류 무시, 앱 전역 CA/TLS 검증
해제는 대안이 아니다.

D7은 서버/Member 인증서 90일, 별도 issuer 365일 및 만료 전 기존 키·검증된 현재 신원을
사용하는 갱신 정책의 승인이다. 갱신 threshold/issuer 회전 세부는 미정이고, 갱신 자체는
미구현이다. Core Settings source E2E 7개 모드는 로컬 Electron 43.7.7에서 통과했으나 잠긴 43.8.3의
로컬 DPAPI 검증은 아니다. exact Source HEAD `425000cb1c44bf583d9d655632057440c06f90f7`의
기존 `Verify SPS` run `40181306002`와 `40181309808`은 각각 18개 job 중 16개 성공, 2개 실패했다.
두 run 모두 9개 Linux test shard와 full Linux typecheck/build가 통과했다. Windows job의 Native step 10,
Core Settings source E2E step 11, Owner Host runtime 준비 step 14도 통과했다.

두 Windows Native secure-storage step도 실제 동일 사용자 프로필의 Electron `safeStorage`/DPAPI로
통과했다. 현재 HEAD의 smoke는 Host identity와 새 Member pending-key filestore를 생성하고 별도
Electron 프로세스에서 재독해했다. safe result는 Electron **43.8.3**, Node **24.22.0**,
`realWindowsSafeStorage=true`, `sameKeyAfterRestart=true`, `memberPendingKeyProtected=true`,
`sameMemberKeyAfterRestart=true`다. 따라서 이전 `d3ddbaa` run `40180490974` / Windows job
`121130316230`의 Host/capsule smoke 결과를 승계한 것이 아니라, 새 filestore를 exact HEAD에서 직접
검증한 증거다.

그럼에도 CI는 **green이 아니다**. 두 run의 production dependency gate는 승인 예외 없는 Zod High
`1243066`으로 실패했다. No-AI step도 elevated Windows 계정에서 embedded PostgreSQL이 시작을
거부해 Owner Host가 뜨지 않았고, 이후 Workspace BrowserWindow 대기가 시간 초과됐다. 따라서 No-AI
결과는 실행 중/성공이 아니라 실패이며 acceptance는 통과하지 않았다. CI 전용 restricted-token
wrapper의 후속 Source `1cddbcf7` CI `40183986226` / `40183990969`도 실패했다. Windows job
`121140772485`는 unit probe 5개의 `0xC0000142` 등 초기화 실패 때문에 Native/Settings/No-AI를
건너뛰었다. 이후 시험 전용 window station/desktop과 명시 ACL·checked cleanup을 보완했다.
로컬 probe 8/8, Desktop 715 total / 714 pass / 0 fail / 1 skip이지만 elevated path 해결은 미검증이다.
과거 DPAPI 증거를 새 수정의 qualification으로 바꾸지 않는다.
[등록/CI 후속 검증](../reviews/NATIVE-ENROLLMENT-ORCHESTRATION-VERIFICATION-2026-10-25.md)을 따른다.

정확한 run/job·실패 단계·safe JSON은 [Native CI 관측 기록](NATIVE-CI-OBSERVATION-2026-10-25.md)과
위 pending 저장 검증을 따른다. 실제 고객 키/listener는 사용하지 않았다.

신원 확인 전에는 사용자 access token·초대 secret·Workspace 자료를 보내지 않는다.
신뢰하지 않은 discovery 응답이나 redirect를 따라 credential을 전달하지 않는다.
주소 변경과 키 변경은 다르게 처리한다. DNS/IP 문자열 일치만으로 기존 Host라 믿지 않는다.

ingress는 요청마다 검증한 transport context를 Core의 내부 타입/채널로 전달해야 한다.
외부 `X-SPS-*`/forwarded 헤더를 지우고 다시 붙이는 것만으로 같은 사용자 로컬
위조까지 방어했다고 주장할 수 없다. 별도 ingress를 고르면 peer 인증된 내부 채널과
스푸핑 방지까지 설계해야 한다. Core TLS listener를 고르면 기존 loopback listener와
권한 예외를 분리한다. 임의 loopback 프록시가 Owner launch proof를 붙이면 안 된다.

Core의 기존 `local_trusted` 모드는 loopback 전용이다. bind를 LAN으로 바꾸거나
`desktopLocalAccessGuard`의 remote peer 통과를 새 기기 인증으로 쓰지 않는다.
소유자 bootstrap의 두 per-launch proof는 main process의 좁은 로컬 경로에만 둔다.

## 4. 승인된 D1과 페어링/세션 상태기계 제안

초기 `SPSLAN1-`은 미출시 source draft였다. 실제 TLS에서 전역 검증 해제 없이
명시적인 연결별 신뢰 자료를 제공하기 위해 **`SPSLAN2-`, v2**에 공개 서버 인증서
DER을 추가했다. 이전 draft는 거부하며 기존 제품 `SPS2-` 초대는 그대로다.
전체 코드는 최대 8192 ASCII bytes, 공개 DER candidate는 1~4096 bytes의 canonical
base64url이다. HTTPS origin, Host ID, SHA-256 SPKI pin, 공개 인증서, pairing ID와
32-byte secret, epoch-ms 발행/만료 시각을 정확한 schema/canonical JSON으로 다룬다.

codec 자체는 인증을 하지 않는다. 별도 `native-connection-tls.mjs`는 공개 인증서의
자기 서명·서버 용도·SAN·기간·정확한 DER·SPKI를 검사하고, 그 인증서만 `ca`에
넣은 새 TLS 연결에서 `rejectUnauthorized: true`로 상대를 확인한다. OS/앱 전역 CA,
인증서 검사 해제, 임의 root fallback이나 인증서 자동 회전은 없다. 이 첫 구현은
명시적 self-signed server leaf에 한정하며 고객 관리 CA/체인은 지원하지 않는다.

TLS probe는 HTTP나 자격정보를 전송하지 않는다. 결과 `tls_peer_verified`는
해당 TLS 상대의 키 소유 확인일 뿐 SPS Host ID·Google 사용자·Member 승인·Workspace
인가·Core readiness가 아니다. 후속 Core handshake에서 Host ID를 결속해야 한다.
Host 인증서 준비는 현재 Core Settings의 신뢰된 Host-only main/preload 경로에 연결돼 있다.
기존 join·공개 SDK·Native LAN listener에는 연결하지 않았고 시험 TLS 서버는 loopback뿐이다.
원문 secret은 로그나 오류에 포함하지 않는다. 초대가 실행/Source grant를 부여하지 않는다.

문법적으로 정상인 envelope는 **신뢰되지 않은 입력**이다. TLS verifier는 현재 시각의
발행/만료와 인증서 유효기간을 검사하지만 최대 TTL/시계 오차·원자적 일회성 소비·
사용자/기기 결속은 Host 프로토콜의 책임이다. codec이 대신하지 않는다. 후속 내부
저장 계층은 secret 소비와 계정/pending 기기 결속을 구현했지만, 실제 세션·키 소유와
TLS 상대를 확인하는 endpoint를 아직 제공하지 않는다.
SPKI pin은 이 첫 계약에서 서버 인증서 공개키의 DER SubjectPublicKeyInfo 해시다.
미출시 v2 Host identity store와 좁은 준비 진입점은 있으나, 이는 인증서 attestation이나
운영용 키 수명주기가 아니다. 유효한 새 Vault에 slot이 없는 상태는 `not_prepared`이며 준비할 수 있다.
기존 slot의 Vault incarnation이 없거나 재생성/손상된 경우에는 명시적 복구가 필요하고 restore 시
unknown은 fail closed다. Host 시작/restore interlock은
process-local이며 OS lock은 보장하지 않는다. D7의 server certificate 갱신과 pin 갱신/배포는
미구현이고 세부 회전 계약도 남아 있다.
전송 채널에서 코드 전체를 바꾼 공격자는 지문도 바꿀 수 있으므로, 코드 자체는
독립된 신뢰점이나 Host 서명이 아니다. 기존 신뢰 Host의 pin 변경은 별도 재확인이다.

개념 상태는 `unpaired -> requested -> pending_approval -> approved -> active`다.
`expired`, `revoked`, `identity_changed`, `unavailable`은 별도 원인이다. 연결 소켓의
`connected`와 `authorized`는 독립 값이며 `unavailable`은 revoke를 뜻하지 않는다.

1. Host Native UI가 대상 Host/사용자·수명·일회성 challenge를 만든다. 전달할 초대는
   신뢰 채널에서 Host 신원과 함께 검증해야 한다. short code만으로 TOFU 자동 수락 금지.
2. Member Native UI가 서버 신원을 확인한 다음 기존 SPS Identity 사용자와 별도
   Member 키의 소유를 증명한다. 신원 검증 이전 token 전송은 금지한다.
3. Host는 대상 Host/사용자/기기·nonce·만료·시도 제한·재사용을 확인한다. 초대
   소비와 pending 등록은 원자적이어야 하며 병렬 수락은 하나만 성공한다.
4. Host 소유자가 Native UI에서 사용자를 확인하고 기기를 승인한다. 페어링 승인은
   Workspace membership·Plugin·Node 실행 grant를 자동 생성하지 않는다.
5. Host는 승인된 기기에 한정된 세션을 발급한다. 저장소에는 원문 pairing secret과
   장기 bearer token을 남기지 않고 필요한 검증 자료와 generation만 둔다.
6. 매 요청에서 서버 신원·기기 자격·사용자 세션·현재 membership·Plugin 문맥을
   검증한다. 연결 조회에 body `workspaceId/deviceId/hostId`만 신뢰하지 않는다.
7. 철회/로그아웃/만료/Host 키 변경은 새 요청을 즉시 거부하고 해당 장기 스트림을
   닫는다. 승인 generation을 다시 쓰지 않는다. 재시도는 재승인을 우회하지 않는다.

기존 membership 초대의 수락/Host 승인 흐름을 재사용할 수 있지만, 현재 초대가
이 기기 결속·원자적 challenge 프로토콜을 이미 제공한다고 간주하지 않는다.
TTL·키 회전·rate limit·retention 세부 정책은 계약 PR의 명시적 결정이다. D7에서 인증서
유효기간은 승인됐지만 갱신 threshold·issuer 회전 및 실제 갱신은 아직 구현되지 않았다.

## 5. HTTP, UI, 실시간 관측

### 최초 등록 계약: 발급과 등록의 두 단계

아래 순서 중 Core 발급 기록·조정과 실제 TLS socket 기반 완료 검사는 비활성 소스로 구현됐다.
실제 앱의 최초 연결은 아직 연결·활성화되지 않았다. CSR의 과거 서명 검증을 새 mTLS 연결의
키 소유로 간주하지 않기 위해 두 경계를 분리하며 별도 자체 PoP 서명은 만들지 않는다.

1. Member는 전체 초대의 Host 인증서·지문과 실제 서버 인증 TLS를 먼저 대조한다.
   그 뒤에만 현재 SPS 사용자 인증, 초대 secret 및 공개 CSR을 전송한다. Host는 현재
   사용자·초대·Host/device/CSR를 검증하고 발급 기록을 결속하되 **아직 초대를 소비하지 않는다**.
2. Member는 검증·보관한 인증서와 원래 키로 새 full mTLS 연결을 만든다. Host는 실제 TLS
   peer 인증서, 같은 현재 사용자, 정확한 발급 기록·초대를 대조한 후 등록 트랜잭션에서
   초대 소비와 **pending 기기** 생성을 함께 완료한다. 헤더/body의 기기 ID는 증거가 아니다.

새 연결의 키 증명은 표준 [TLS CertificateVerify](https://www.rfc-editor.org/rfc/rfc8446.html#section-4.4.3)를
사용한다. 최초 등록은 재개 세션·early data를 수용하지 않는 경로로 검증한다. 발급 전
크기·시도·동시성·서명 예산과 만료를 제한하고 동일 요청은 동일 기록/인증서를 재사용해야 한다.
Core 저장은 migration 0167의 초대별 공개 기록이며 예산/수명은 명시 생성자 입력이다. 동일 committed
재요청은 같은 인증서를 반환하고, 실패/중단 signing은 자동 재서명하지 않는다. 실제 프로세스 간
사용자 세션 결속 adapter는 비활성 소스로 추가했지만 제품 활성화·retention 정리·GUI 실패 복구는 후속이다.
Main signer 채널은 내부에만 추가했으며 private key/전체 CSR/초대 secret은
발급 테이블에 저장하지 않는다. [정확한 검증과 제한](../reviews/NATIVE-ENROLLMENT-ORCHESTRATION-VERIFICATION-2026-10-25.md)을 따른다.

pending 등록용 검사는 승인된 기기의 일반 API guard와 분리한다. 이 제한 경로가 임의 Core
API/파일/WS 프록시가 되어서는 안 된다. 발급·로그인·mTLS 성공만으로 Host 승인이나 Workspace
membership, Plugin, Node/CLI/Source grant를 만들지 않는다. 소비된 초대의 재등록과 철회 기기의
권한 부활은 거부한다. 이 제안은 실제 listener/방화벽 활성화 승인이 아니다.

보호된 HTTP·Artifact/파일·UI 서브리소스·WebSocket upgrade 모두 동일한 기기/사용자/
Workspace 인가를 거쳐야 한다. 세션 cookie가 있거나 LAN 소켓이라는 이유로 기기
검사를 생략하지 않는다. 현재 WebSocket 경로는 Express HTTP 미들웨어와 별도이므로
이를 자동 상속한다고 가정하지 않는다. WS는 upgrade뿐 아니라 철회/만료 이후
구독 전달도 차단해야 한다. bounded event와 cursor/gap 복구를 쓰되 전체 스냅샷으로
권한 없는 Workspace 이벤트가 흘러가지 않게 한다.

원격 Workspace renderer에는 Desktop 관리 preload를 제공하지 않는다. Native
최초 연결·승인·복구 창은 고정 파일/sender/mainFrame 검증과 좁은 IPC만 갖는다.
비신뢰 Plugin이 Native 창의 승인 버튼이나 origin을 가장할 수 없어야 한다.

### 구현 전 남은 TLS 결속 검수

- 초대의 `origin`·`hostId`·지문을 검증한 실제 연결 상대와 함께 대조한다. 하나라도
  다르면 Identity token이나 pairing secret을 보내지 않는다. Host ID 응답을 TLS와
  무관한 신원 증명으로 쓰지 않는다.
- 초대 만료, D7의 인증서 유효기간, 저장 pin의 수명/회전은 별개다. 승인된 기기만 기존
  키와 검증된 현재 신원으로 만료 전에 갱신할 수 있어야 하며, 실제 갱신 threshold와
  issuer/pin 회전은 후속 구현이다. Host 키 변경을 명시적으로 처리하고 변경 pin을
  TOFU/일반 CA로 무음 대체하지 않는다.
- Node HTTP/TLS client의 검증 설정이 Chromium renderer·WebSocket에 자동 적용된다고
  가정하지 않는다. Electron session별 정책·인증서 cache와 스트림 정리를 별도 검증한다.
  기본 session 전역 검증 해제나 범용 certificate-error 수락은 금지한다.
- `checkServerIdentity`의 hostname 검사만으로 X.509 체인·유효기간·pin 정책을 모두
  대체하지 않는다. 임시 self-signed fixture 통과도 실제 Host 신뢰 배포 수용이 아니다.
- 승인 D2는 Member mTLS다. 표준 CSR 서명과 live TLS 키 소유 증명을 구분하며 자체 PoP를 병행 구현하지 않는다.
  비활성 client 인증서 발급 primitive 이후의 발급 활성화·키 보관·앱 최초 연결과 전체 HTTP/WS/서브리소스
  검사는 후속이다. 현재 승인·사용자 결속의 소스 registry와 transport helper 시험은 전체 제품 경로 수용을 대신하지 않는다.

## 6. 공개 SDK의 최소 표면 제안

첫 공개는 현재 승인된 Workspace의 Connection **목록/상태 조회**로 제한한다.
observe는 우선 Core가 관측한 bounded 상태의 읽기이며 임의 주소 probe나 자동 연결
생성이 아니다. push 구독이 필요하면 기존 이벤트 primitive의 scope·철회 의미를
검증한 뒤 추가한다. 새 API 이름/capability/export는 아직 확정하지 않는다.

제안 DTO는 opaque connection reference, transport 종류, 연결 상태, 인가 상태,
관찰 시각, 근거 수준, 안전한 오류 code만 담는다. 인증서 개인키·access token·
pairing secret·원문 endpoint·사용자 이메일·전체 장치 목록은 반환하지 않는다.
`readSpsHostSupport`의 등록 operation 보고를 재사용하되 readiness/권한으로 해석하지 않는다.

새 facade는 사용자 또는 승인된 background Job의 **Host 발급 Workspace invocation**이
없으면 거부한다. 선언 capability·설치/activation·현재 Workspace 권한을 서버에서
재검사한다. 기존 generic invocation wrapper는 scope 누락 시 모든 method를 거부하는
구조가 아니므로 이를 새 API의 보장으로 복사하지 않는다. SDK 로컬 검사와 별개로
Host가 최종 권위다. Host 전체 관리 목록은 Native 관리 API에만 남긴다.

packed SDK 소비자 import/타입 시험과 실제 Worker→Core handler 시험을 함께 추가한다.
구 Host는 unknown/unsupported; Node heartbeat 관측이나 `executionGrants.revoke`를
Member 연결/철회 API로 바꾸지 않는다. 새 연결만으로 `runs.dispatch` 권한을 얻지 않는다.

## 7. 저장·복원·오류·감사

필요한 논리 자료는 Host identity version, 승인 기기/사용자 binding, challenge 소비,
세션 generation, 철회, redacted 감사다. 기기/이벤트는 additive migration 0165로
기존 session/Node 자격과 분리했다. migration 0166은 Host/서버 SPKI에 scoped된
내부 일회용 pairing과 redacted 이벤트를 추가한다. Host 신원의 생성/암호화 보관은 좁은 Core Settings
준비 경로에 연결됐지만, Member 발급 primitive의 provisioning·실제 최초 pairing·장기 세션 저장은 미구현이다.
Migration 0167은 초대별 공개 발급 기록을 추가하고 restore는 이를 pairing보다 먼저 삭제한다.
현재 pin은 생성 시 고정된 값이므로
키 교체 시 이전 서비스/리스너를 반드시 폐기해야 한다. 새 pin 인스턴스의 거부 시험은
모든 프로세스의 이전 키를 자동 철회했다는 증거가 아니다.

Windows safeStorage를 기존 패턴에 맞춰 재사용한다. 이전 43.7.7 runtime의 프로세스 간 재독해 시험은
잠긴 43.8.3의 DPAPI v2 양성 수용이 아니다. TPM/non-exportable 또는 같은 사용자 악성 프로세스 격리를 보장하지 않는다.
Member 키와 Node 키는 별도 용도다. private pending/issued filestore는 구현됐지만 앱 lifecycle·회전·폐기·발급 자격 저장 caller는 후속이며
소유 smoke fixture 통과도 enrollment나 Host 승인이 아니다.
Host 이전/Owner Vault 복원은 기존 remote credential을 부활시키지 않고
명시적 재승인을 요구한다. restore sanitizer에 새 자격 자료를 포함해야 한다.

오류는 transport unavailable, Host identity changed, sign-in required,
device pending/revoked, Workspace denied, protocol unsupported를 구분한다. 원문
TLS exception/endpoint/key/사용자 자료를 Plugin 오류에 흘리지 않는다. 네트워크
재시도는 bounded/backoff·취소 가능하고 auth/revoke 실패는 자동 재승인하지 않는다.

연결 해제와 Node/모델 작업 취소·종료 확인은 별도다. 외부 효과/파일 변경을 undo했다고
표시하지 않는다. 파일 공유와 실행 이력을 이번 세션 저장소에 중복 구현하지 않는다.

## 8. RFC 승인 전 통과 조건

- 승인 D1~D3와 키 교체/만료/복원·Host 검증 UX의 세부 계약이 사용자 결정에 정렬됨.
- 라이브러리·TLS/client 인증의 Windows/Electron 지원·라이선스·업데이트 책임 확인.
- 거짓 서버·같은 초대의 다른 Host/기기·병렬 소비·재생·철회·A/B 테스트 명세.
- HTTP/WS/서브리소스/Native sender와 Plugin invocation의 동일한 거부 조건.
- opt-in 기본 off, listener·방화벽의 명시 동의, 정리/롤백과 기존 Tailscale 회귀 명세.
- 실제 두 Windows PC와 동일 서명본의 증거 계획. mock 테스트로 대체하지 않음.

## 표준 참고

- [TLS 1.3 RFC](https://www.rfc-editor.org/rfc/rfc8446): 표준 전송 기반 참조이며
  인증서 신뢰 배포나 SPS 인가 정책까지 해결하지 않는다. 구현 시 최신 개정/errata를 확인한다.
- [Node TLS 공식 API](https://nodejs.org/api/tls.html): 검증된 라이브러리 후보 검토
  자료. 문서 최신 버전이 SPS 번들의 runtime 지원을 증명하지 않는다.
- [Electron session 인증서 검증](https://www.electronjs.org/docs/latest/api/session#sessetcertificateverifyprocproc):
  session별 인증서 검증과 cache 동작 검토 자료. 새 검증 hook을 설치했다는 뜻이 아니다.
- [표준 OAuth DPoP](https://www.rfc-editor.org/rfc/rfc9449.html): D2의 PoP 비교 자료다.
  최종 선택은 Member mTLS이며 DPoP 구현을 추가하지 않는다.
- [표준 Mutual TLS와 인증서 결속](https://www.rfc-editor.org/rfc/rfc8705.html):
  사용자 token과 client 인증서 결속의 검토 근거다. SPS가 이 OAuth profile 전체를
  구현했다는 뜻이 아니며 별도 SPS Identity/Workspace 인가는 계속 필요하다.
- [Tailscale Serve 공식 문서](https://tailscale.com/docs/features/tailscale-serve):
  현행 호환 경로만 설명한다. 새 내장 LAN의 사용자/기기 인증 근거로 사용하지 않는다.
