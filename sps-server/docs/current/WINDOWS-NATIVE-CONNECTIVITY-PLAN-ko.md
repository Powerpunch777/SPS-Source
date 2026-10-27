# SPS Windows 내장 연결 계획

기준일: 2026-10-27 KST. 상태: **Core·Desktop 등록/Workspace/Host·Member 갱신 연결; Native 기본 OFF, 설치본·물리 LAN 검증 미완료**.
사용자가 전달한 Windows-First Native Connectivity 인계서와 목표 교체 요청을
반영한다. 이 문서는 네트워크 변경, 설치본 교체, 운영 배포 승인이 아니다.

승인 D1의 비활성 초대 codec과 연결별 공개 인증서/TLS 확인은 소스 시험을 통과했다
(codec 25건, TLS 12건). TLS는 임시 loopback 시험 서버만
사용했다. 별도 Core 기기 registry·승인/철회·현재 Workspace 인가, 실제 loopback
mTLS 검증 helper와 선택적 WS guard를 추가했다. 앱 join/Native TLS listener·
최초 pairing·Member 기기 인증서 발급 활성화에는 연결하지 않았으므로 내장 LAN 지원 완료가 아니다.
정확한 범위와 명령은 [Member 기기 소스 검증](../reviews/NATIVE-MEMBER-DEVICE-SOURCE-VERIFICATION-2026-10-25.md)을 따른다.
그다음 내부 pairing 저장 계층은 원자적 일회용 소비·시도 제한·Host/서버 지문 결속과
가입 전 사용자의 pending 기기 생성까지 추가했다. 아직 실제 최초 연결 프로토콜은 아니다.
[pairing 저장 계층 검증](../reviews/NATIVE-PAIRING-STORE-VERIFICATION-2026-10-25.md)을 따른다.

## 현재 체크포인트

2026-10-27 후속 구현은 승인된 Member의 **만료 전 같은 키 인증서 갱신**을 연결한다.
Core Settings에서 인증서 상세를 조회하고 명시적으로 갱신하면, 현재 로그인 세션과 실제
mTLS 인증서로 동일한 승인 기기를 확인한다. 기본 90일 인증서의 마지막 30일에만 가능하며
짧은 인증서는 수명의 1/3로 제한한다. 새 인증서는 별도 이력으로 추가하고 기존 키·초대 등록
기록·암호화 파일은 보존한다. 응답 유실 시 기존 인증서와 CSR로 같은 결과를 복구할 수 있다.
원래 초대 TTL이 지났어도 갱신된 인증서로 기존 등록을 조회한다. 철회는 모든 인증서를 막는다.
후속 [Host 인증서 갱신 검토](../reviews/NATIVE-HOST-RENEWAL-2026-10-27.md)는 기존 server 키와
issuer를 보존하는 만료 전 갱신, 명시적 listener 재시작 및 이전 인증서를 정확히 검증한
Member의 보호 target 갱신을 연결했다. 실제 Electron/DPAPI/Core/DB 통합과 자연 종료를
검증했다. issuer 회전, 만료 후 재신뢰, 설치본 및 두 PC 검증은 별도 미완료다.
정확한 범위와 검증은 [Member 인증서 갱신 검토](../reviews/NATIVE-MEMBER-RENEWAL-2026-10-27.md)를 따른다.

후속 [Desktop Main 등록·복구 통합](../reviews/NATIVE-DESKTOP-INTEGRATION-2026-10-26.md)은
Core Settings의 명시적 초대 등록·기존 등록 조회·중단 저장 복구를 현재 계정과 연결 generation에
결속했다. 토큰·기기 개인키·발급 DTO는 Main에만 남고, UI에는 제한된 공개 상태만 반환한다.
초대 등록은 Host 주소/핀 확인을 요구하며, 저장 복구는 별도의 로컬 확인 후 검증된 임시 alias만
정리한다. 계정 갱신의 늦은 결과와 동시 상태 저장 경합도 차단한다. Windows 개발 checkout의
권한 없는 symlink 오류를 junction으로 보완한 Core `1e107a67`을 현재 지원 행렬에 고정했다.
아래의 이전 체크포인트 검증을 새 통합의 전체 수용 증거로 재사용하지 않는다.
후속 [Native ingress 소유권 구현](../reviews/NATIVE-INGRESS-OWNERSHIP-DESIGN-REVIEW-2026-10-26.md)은
Main의 전용 TLS와 직접 소유한 Core 자식 IPC를 연결했다. Host는 앱 실행마다 명시적으로
선택한 사설 NIC/포트를 확인한 뒤 등록 listener를 켜고, 별도 확인으로 일회용 초대를
클립보드에 복사한다. Core의 로컬 Owner 관리 API가 실제 세션으로 초대를 발급하며,
Main에는 서버/issuer 개인키가 남는다. 일반 Core HTTP bind와 방화벽은 바꾸지 않는다.
실제 Core 자식·임시 PostgreSQL·Main 서명·loopback TLS를 연결한 시험은 exit 0이며,
응답 유실 후 저장된 키/인덱스로 동일 pending 기기를 두 번 복구하고 변경 없음과 자연
종료를 확인했다. 이 시험은 DPAPI 대신 AES fixture를 사용한다. Native LAN 기본 OFF,
실제 DPAPI 앱 등록·전체 HTTP/WS/Source/Node 전송·갱신·두 PC·서명본·전체 CI/보안/종료
검증은 미완료다. Marketplace 정책과 Plugin Builder 구조는 변경하지 않았다.

아래 체크포인트는 각 당시 소스의 검증 이력이며, 현재 구현 범위는 위 후속 상태를 따른다.

사용자 D8 승인 후 [등록 복구 조회/기기 ID 보관](../reviews/NATIVE-ENROLLMENT-RECOVERY-2026-10-26.md)을
추가했다. Core `8c76edabd`는 현재 사용자 세션과 실제 발급 기기 TLS 키로 이미 소비한 초대의
기존 기기 연결만 읽는다. 초대가 만료돼도 유효한 인증서로 조회할 수 있지만, 복원으로 신뢰가
지워졌다면 재로그인해도 이를 되살리지 않는다. Core 실제 DB/TLS 집중 **50/50**, 전체 타입
검사·빌드는 통과했다. Desktop v12 상태는 계정/Host별 공개 기기 ID만 별도로 보관하며 기존
v1-v11 연결/Node 키를 보존한다. 검증한 주소·서버 인증서·핀은 별도 Windows 암호화
레코드로 create-only 보관하며, 공개 ID 범위로 재시작 조회할 수 있다. 별도 복구
클라이언트는 기존 기기 인증서와 현재 계정 세션으로 조회만 하며 초대를 재사용하지 않는다.
실제 Core/임시 DB에서 등록 응답을 끊은 후 같은 pending 기기 조회와 변경 없음도 확인했다.
Desktop 전체는 **958건 중 956 통과·제외 2**, 정확한 Core HEAD의 hosted CI는 **15/15**다.
앱 Main 등록 조합/사용자 확인 UI/실제 DPAPI 복구 동작은 아직 연결 전이다.
Native LAN은 계속 미지원/OFF이며 설치본도 바꾸지 않았다.

후속 Core `028396f93`은 일반 종료 시 Worker 실제 종료를 기다리고, 초기화/개별 중지/
재사용 bulk stop 경합을 차단한다. 임시 폴더는 canonical 경로·생성 당시 신원을 매 삭제
시도마다 확인한다. Desktop **925건 중 923 통과·제외 2**, Worker/시작-종료 **23/23**,
Core 전체 타입 검사·빌드는 통과했다. 실제 개발 앱 No-AI/준비된 Host 시험도 각각 정상
종료했지만 그 런타임은 이전 Core `f9e2f9f2f`/dirty Source 기준이므로 최신 서명본 또는
새 Core의 hosted 전체 자식 Job 수용 증거로 재사용하지 않는다. 상세 범위는
[종료 검증 후속](../reviews/WORKSPACE-E2E-CLEANUP-2026-10-26.md)을 따른다.

후속 [발급기관 bootstrap](../reviews/NATIVE-ISSUER-BOOTSTRAP-2026-10-26.md)은
초대의 정확한 서버 인증서를 확인한 TLS 연결에서만 공개 Host/발급기관 정보를 가져온다.
로그인 토큰·쿠키·초대 secret 없이 전체 issuer 프로파일·Host/서버 지문 일치를 검증하고,
그 결과로 기존 등록 클라이언트의 신뢰 문맥을 만든다. 세션·기기·Workspace 권한은 생기지
않는다. Core 핸들러와 Main 전용 facade의 실제 Core/임시 DB loopback 연동은 통과했고,
제품 startup·초대 UI·listener는 연결하지 않았다. CI launcher의 선언되지 않은 root `tsx`
의존도도 제거했으며, 새 HEAD의 hosted 성공 여부는 별도로 확인한다.

후속 [Native 등록 호출부](../reviews/NATIVE-ENROLLMENT-CLIENT-2026-10-26.md)는
Main 전용 비활성 클라이언트로, 매번 새 TLS 1.3 연결의 정확한 서버 인증서를 확인한 뒤
기존 세션 교환·CSR 발급·mTLS pending 등록을 호출한다. 토큰·쿠키·개인키는 renderer나
SDK에 노출하지 않고, 계정/Host guard·취소·시간 제한·응답 계약을 검증한다. 실제 Core와
임시 DB를 쓴 loopback 통합 시험에서 일회용 초대 소비·재사용 거부·권한 자동 부여 없음을
확인했다. 공개 issuer 신뢰 bootstrap은 후속 소스 검증을 추가했다. 아직 앱 Main startup/
초대 UI·DPAPI 저장 조합에 연결하지
않았으므로 실제 사용자의 최초 연결이나 내장 LAN 지원이 아니다.

사용자 승인 후 Core Settings의 로컬 정상 종료 버튼과
[앱 시험 종료 검증](../reviews/WORKSPACE-E2E-CLEANUP-2026-10-26.md)을 보완했다.
Desktop 883건 중 882건 통과·기존 제외 1건, 별도 Settings 7가지 소스 앱 시험과
No-AI·준비된 Host의 정상 종료/재시작·출력 종료·임시 데이터 정리를 확인했다.
설치본 교체나 최종 HEAD의 hosted CI·전체 자식 Job 종료 증거를 뜻하지 않는다.
종료는 계정·Agent·Plugin·Host 권한과 별개인 로컬 앱 제어이며, LAN을 켜거나
실행 권한을 추가하지 않는다. 실제 종료·출력 EOF와 CI 소유 Job 자연 종료는
분리해서 기록하며, 강제 정리는 성공으로 인정하지 않는다.

후속 [Native 세션 교환](../reviews/NATIVE-SESSION-EXCHANGE-2026-10-26.md)은 기존
Identity 검증·사용자·세션 저장을 재사용하는 비활성 TLS 전용 핸들러다. 등록 전에
Bearer를 세션 쿠키로 교환하되 기기 승인·Workspace/Plugin/Node/Source 권한은
추가하지 않는다. Native 쿠키는 항상 Secure이며 기존 hub 쿠키 설정은 보존한다.
실제 제품 Main caller, 초대 화면, listener·LAN·두 PC 증거는 아직 아니다.

후속 [Host 초대 관리](../reviews/NATIVE-HOST-PAIRING-MANAGEMENT-2026-10-26.md)는
기존 저장소를 재사용하는 비활성 Owner 세션 facade다. 1시간·검증된 수신자 요청이라는
승인 범위를 고정하고 시도/활성 초대 수는 Core의 명시적 입력으로 남겼다. 후속 사용자
승인으로 Desktop 기본 정책은 초대별 5회 오입력 시 `exhausted`·Host별 활성 10개다.
트랜잭션 중 권한
상실은 발급/취소와 감사 기록을 롤백하지만, 커밋 후 연결 상실은 결과만 보류하고
이미 커밋한 상태를 되돌리지 않는다. 실제 세션·임시 DB 시험이지 앱의 초대 버튼,
네트워크 listener, 자동 재시도 또는 두 PC 최초 연결 수용이 아니다.

후속 [등록 HTTP 경계](../reviews/NATIVE-ENROLLMENT-HTTP-BOUNDARY-2026-10-26.md)는
기존 세션·pairing·발급 계층을 재사용하는 비활성 전용 핸들러다. 두 내부 경로만 받으며
본문/읽기/실행 시간·동시성 한도와 timeout/dispose 뒤의 DB/응답 guard를 검증했다.
실제 loopback TLS/mTLS·임시 DB 시험이지 앱 startup mount, 최초 세션 교환, LAN listener,
전체 HTTP/WS 인가나 실제 두 PC 지원이 아니다. 기존 API/SDK/지원 전송은 바꾸지 않았다.

준비된 Host의 실제 Main/Core 연결은 [후속 소스 앱 수용](../reviews/NATIVE-PREPARED-HOST-ACCEPTANCE-2026-10-26.md)에서
검증했다. 별도 격리 Electron으로 시험용 DPAPI identity를 먼저 준비하고, 실제 앱을
두 번 실행해 Owner 세션/Host 핀 결속·available 빈 기기 목록·Plugin startup 423 차단·
0-Agent·일반 Workspace 관리 API 403을 확인했다. Native 보안 확인창을 자동 승인한
시험이 아니며 실제 Member enrollment·approve/revoke·LAN·두 PC/서명본은 여전히 후속이다.
Core 전체 CI가 잡은 status OpenAPI 누락은 `28757d809`의 fresh PR CI 15/15에서 해소됐다.
그 뒤 Windows 종료 보완과 prepared-Host 앱 검증은 별도 후속 변경이므로 같은 결과를
새 HEAD의 CI 증거로 재사용하지 않는다. 종료 전용 inherited pipe는 Native 서명 IPC
폐기 후에도 남지만 종료 외 권한은 없고 LAN listener도 열지 않는다.

후속 local Host management는 준비된 Host identity와 직접 소유 Main IPC의 공개
Host/server 핀을 확인한 Core 자식에만 status/list/events/approve/revoke를 연결한다.
실제 Owner 세션·actor·두 Desktop proof가 일치해야 하며 DB 조회/변경 전후 세션과
채널을 재검사한다. Core Settings는 좁은 공개 DTO만 표시하며 확인창 전후의 계정/
Host/generation·인증서/기기 revision 변화와 늦게 도착한 이전 UI 결과를 거부한다.
준비 후 Host 재시작은 명시적이며 LAN은 계속 OFF다. 이는 initial enrollment 또는
연결된 Native stream 철회 수용이 아니다. 이번 소스/DB/설정 UI 검증과 남은
준비된 Host 전체 앱/두 PC/서명본 검증은 [로컬 기기 관리 검증](../reviews/NATIVE-HOST-MANAGEMENT-VERIFICATION-2026-10-25.md)에 분리한다.

Core `0955e8f63`에 초대별 공개 발급 기록과 두 단계 등록의 내부 조정 계층을 추가했다.
발급은 초대를 소비하지 않고, 실제 authorized/non-resumed TLS 1.3 소켓에 제시된 정확한
발급 인증서만 초대 소비·pending 기기·감사와 함께 트랜잭션으로 등록한다. 잘못된 secret 예산은
기존 pairing 계층을 재사용한다. 동일 발급 재요청·재시작은 같은 인증서를 반환하고, 중복 서명·
발급 중 결속 변경·철회·만료·철회 키 부활은 거부한다. migration `0167_absurd_loki`는 새 공개
발급 자료만 추가하고 restore는 이를 pairing 전에 삭제한다. Core 집중 **40/40** 및 전체
typecheck/build는 통과했다. 실제 세션 인증 caller·등록 UI·TLS ingress는 아직 없으므로
이것은 앱 최초 연결 수용이 아니다. [등록 조정 검증](../reviews/NATIVE-ENROLLMENT-ORCHESTRATION-VERIFICATION-2026-10-25.md)을 따른다.

후속 Main 서명 채널은 직접 소유한 Core 자식의 Node IPC에만 연결한다. Core의 명시적 factory는
공개 Host/issuer 핀을 캡처하고 기존 enrollment service를 조합한다. 개인키·계정 token·파일 경로는
채널로 전달하지 않으며 renderer/preload/Plugin SDK API는 추가하지 않는다. Main은 현재 Host 세션과
identity store를 서명 전후 확인하고 계정/서버 변경·restore generation 변화 뒤 이전 채널을 거부한다.
취소·시간 초과는 실제 작업 종료 증거가 아니며, 실제 작업이 settle할 때까지 Main 동시성 slot을 유지한다.
Core factory는 자동 시작하지 않는다. 제품 Native 세션 인증 경로·발급 자격 저장 caller·등록 UI·LAN listener는 여전히 후속이다.
정확한 한도·실행 명령·증거 범위는 [서명 채널 검증](../reviews/NATIVE-SIGNER-CHANNEL-VERIFICATION-2026-10-25.md)에 모은다.

후속 비활성 session adapter는 실제 SPS Identity 세션 쿠키에서 사용자를 도출하고, DB 트랜잭션에서
같은 session ID/digest/user/expiry와 verified 상태를 재검사한다. 초대 오입력 예산 전과 마지막
발급/등록 write 뒤에 검사하며, 다른 사용자의 authorizer 조합도 거부한다. 실제 fresh TLS 1.3
IncomingMessage·POST/JSON을 요구하고 browser origin·Authorization·본문 userId 대체를 거부한다.
새 제품 route/listener나 Google 흐름은 만들지 않았다. 로컬 Core logout과 DB 처리의 순서 보장이지
중앙 Google 로그아웃의 즉시 전파·COMMIT 순간까지의 시간 정지 보장은 아니다.
[세션 결속 검증](../reviews/NATIVE-SESSION-ENROLLMENT-VERIFICATION-2026-10-25.md)에 최종 증거를 기록한다.

후속 Member issued companion은 기존 pending 키 파일을 변경하지 않고 공개 발급 응답만 별도
암호화 파일에 create-only로 저장한다. 다시 읽을 때 현재 계정/Host/device/pins·원래 키/CSR·
인증서 chain/profile/만료를 재검증한다. 초대 완료 기한과 인증서 수명은 다르며, 초대 기한이
지났다는 이유만으로 아직 유효한 인증서를 폐기하지 않는다. 저장 후 guard 실패는 오류를
반환해도 파일이 남을 수 있으며 filesystem rollback·자동 복구·기기 승인은 아니다.
실제 loopback TLS 1.3 재독해 시험을 포함한 집중 37/37, Desktop 761 total/760 pass/1 skip은
소스 증거다. unit AES는 DPAPI가 아니다. 후속 Source `48a35262` Windows CI에서 companion의 실제
43.8.3/24.22.0 safeStorage 별도 프로세스 재독해는 통과했다. 두 PC나 앱 enrollment 증거는 아니다.
Main/IPC·앱 enrollment caller·LAN listener·갱신은 연결하지 않았다.
[발급 자격 저장 검증](../reviews/NATIVE-MEMBER-ISSUED-STORE-VERIFICATION-2026-10-25.md)을 따른다.

직전 Source `7311041b` push CI `40190150149`는 18개 job 중 16개 성공·2개 실패다.
9개 Linux shard/full typecheck/build와 Windows Native DPAPI·Settings·No-AI·packaged Workspace
surface까지 통과했지만 packaged Plugin Preview는 실제 Assistant 등록 폼의 서버 오류로
roster 대기에 실패했다. 이전 embedded PostgreSQL chmod 오류와 구별하며 Preview 성공으로
기록하지 않는다. 보안 정책은 보류된 Zod High로 계속 차단된다. Core `ed45c51c` PR CI
`40190064373`는 15/15 job 통과했다. 이 CI는 후속 issued companion의 증거가 아니다.

Source `48a35262` push CI `40197294957`도 16/18 성공이다. 새 companion DPAPI·Settings·No-AI·
packaged Workspace surface는 통과했지만 packaged Preview의 Assistant 등록 500은 남았다.
별도 조사에서 Desktop 패키징이 정식 서버 build의 자산 복사를 건너뛰는 누락을 확인하고
기존 build 재사용·배포 자산 비교·실제 패키지 지침 로더 검사로 보완한다. 이 결함이 해당
CI 500의 유일한 원인인지와 새 잠긴-runtime packaged CI는 아직 미입증이다.
[패키지 자산 검증](../reviews/PACKAGED-AGENT-ASSETS-VERIFICATION-2026-10-25.md)을 따른다.

Source `1e6152a8`의 CI `40185474383` / `40185477664`는 각각 18개 job 중 16개 성공·2개 실패다.
9개 Linux shard와 full Linux typecheck/build는 통과했지만 Windows unit은 **715 total / 709 pass /
5 fail / 1 skip**으로 Native/Settings/No-AI 이후 시험이 실행되지 않았다. 시험 전용 window station/
desktop 보완만으로 `0xC0000142`가 해결되지 않았다. 후속 CI-only helper는 새 restricted token의
default DACL에 동일 사용자 SID를 추가하고 기존 ACE 보존·Admin deny-only를 확인한다.
기존 OS ACL·계정·방화벽은 변경하지 않는다. 로컬 **8/8**은 통과했지만 elevated runner 원인은
새 exact-HEAD CI 전까지 미입증이다. Core `0955e8f63` PR CI `40185340099`는 15/15 job 통과했고,
별도 review workflow는 Dependency Graph 미활성으로 실패했다. 앞선 `425000cb` DPAPI 성공은
그 과거 revision에만 적용한다. [CI 채널 관측](../reviews/NATIVE-CI-CHANNEL-CHECKPOINT-2026-10-25.md)과
Zod 보류·기존 출시 게이트를 유지한다.

후속 Source `4a378c60`의 push CI `40188043818` 및 PR CI `40188048547`도 최종 16/18 성공·2개 실패다.
9개 Linux shard/full typecheck/build는 통과했고 Windows 실행기·Desktop 739 total/738 pass/1 skip·
실제 Native safeStorage(43.8.3/24.22.0)·Settings 7개 모드·runtime 준비는 통과했다.
그러나 No-AI는 개발 checkout의 embedded PostgreSQL 실행 파일에 불필요한 `chmod`를 시도하다
EPERM으로 Host가 종료돼 실패했고 뒤 packaged 시험은 실행되지 않았다. restricted token의 이전
DLL 초기화 실패와 구별한다. Windows의 POSIX 실행 비트 보정만 제거하는 dependency patch를
검증하며 pnpm cache/checkout/user profile의 ACL을 넓히지 않는다. Core `ac6875bf` PR CI
`40188015914`는 15/15 통과했지만 새 세션 결속/의존성 patch revision의 증거로 재사용하지 않는다.

신뢰된 Host 전용 Core Settings에서 명시적으로 확인한 뒤 Host 인증서 준비를 실행하는
좁은 경로가 연결됐다. 이는 Member 기기 인증서 발급이나 등록 UI가 아니다. Native LAN은
계속 OFF이며 Native LAN listener나 방화벽 변경은 없다. 활성화된 Member 발급·enrollment·세션 등록·갱신도 없다.

비활성 Member 발급 primitive는 표준 PKCS#10 P-256/SHA-256 서명 요청을 사용한다. Member 개인키는
로컬 메모리에 두고 공개 요청에서는 제외한다. Host의 별도 issuer가 명시적 유효기간 90일 이하이며
issuer 유효기간 안에 드는 non-CA `clientAuth`/`digitalSignature` leaf를 발급한다. Main 내부 서명 채널은
추가됐지만 HTTP/SDK·provisioning·갱신·새 GUI 흐름은 없다. 표준 TLS 1.3 loopback에서 새 인증서와
올바른 키는 통과하고, 인증서 없음·다른 issuer·같은 issuer의 잘못된 EKU·다른 개인키는 거부했다.
application bytes는 0이다. CSR 서명 검증과 live TLS 키 소유 증명은 별개이며 자체 서명 프로토콜을
추가하지 않는다. Google 로그인·기기 승인·Workspace/Node/Source grant·새 enrollment 증거도 아니다.
[Member 인증서 검증](../reviews/NATIVE-MEMBER-CERTIFICATE-VERIFICATION-2026-10-25.md)을 따른다.

Member recipient validator는 고정 issuer PEM/SPKI, Host/device RDN, 로컬 개인키/CSR 일치와
인증서 chain/profile·90일 상한·SKI/AKI를 엄격히 검사한다. 공개 상태는 기기 승인이나 인가가 아니다.
Windows Member pending capsule은 주입된 `safeStorage`로 serialized JSON을 암호화/복호화하고,
Identity issuer origin·subject·Host/device·신뢰된 server/issuer pins를 ciphertext 안에만 결속한다.
unit의 AES fixture는 DPAPI 증거가 아니다. 실제 private pending filestore adapter도 소스로 구현됐다.
Owner Vault 밖의 userData에 논리 account issuer/subject·Host/device slot을 만들고 first-writer/create-only로 저장한다.
server/issuer pins는 slot 이름이 아닌 암호문 context에만 결속하므로 pin 변경으로 새 키를 조용히 채택하지 않는다.
덮어쓰기·삭제·자동복구는 없으며 현재 caller는 격리 smoke뿐이다. 발급 자격 companion도 같은 저장 경계를 재사용하지만 Main/IPC·GUI·enrollment caller는
없고 기존 복구·Source·Node 권한은 불변이다. [pending 저장 검증](../reviews/NATIVE-MEMBER-PENDING-STORE-VERIFICATION-2026-10-25.md)을 따른다.

D7 승인값은 서버/Member 인증서 90일, 별도 issuer 365일이다. 만료 전 기존 키와 검증된
현재 신원을 쓰는 갱신 정책도 승인됐지만 갱신은 구현되지 않았다. 미출시 v2 Host identity
store는 DPAPI 암호화 context를 Vault incarnation의 `dev`/`ino`/`birthtimeNs`에 결속한다.
이는 로컬 lifecycle 결속이지 attestation이 아니다. 유효한 새 Vault에 slot이 없으면
`not_prepared`이며 준비를 허용한다. 기존 slot이 있는데 Vault incarnation이 없거나 재생성됐거나
slot이 손상/연결됨/legacy인 경우 명시적 복구가 필요하며 자동 교체하지 않는다. restore 시
slot 상태 미상은 fail closed다. Restore gate는 restore 전체와 비동기 Host activation 동안
Host 시작 및 connection/account 변경을 상호 배제하고 captured account/routing context를 재검사한다.
Store 권한 guard는 마지막 async binding 확인 전후 모두 검사한다. 이는 process-local gate이며 OS lock이나
transactional filesystem rollback은 보장하지 않는다. Promotion 뒤 activation이 실패하면 복원 데이터는
유지되고 오류도 이를 명시한다.

저장소 Source `425000cb` 기준 Desktop 전체 **707 tests: 706 pass, 0 fail, 1 skip**, pending store **15/15**, 집중 명령 **36/36**이다.
정확한 명령은 위 pending 저장 검증을 따른다. skip은 로컬 8.3 alias 미가용이며 root helper의 ancestor guard는 유지된다.
기존 Core Settings source E2E 7개 모드는 로컬 **43.7.7**에서 재통과했지만, 로컬 smoke는 잠긴
**43.8.3**과 달라 crypto 전에 거부된다. 대신 exact Source HEAD
`425000cb1c44bf583d9d655632057440c06f90f7`의 `Verify SPS` run `40181306002`와
`40181309808`에서 각 18개 job 중 16개 성공, 2개 실패했다. 두 run 모두 9개 Linux test shard와
`SPS Core full Linux typecheck and build`가 통과했고, Windows job의 Native secure-storage step 10,
Core Settings source E2E step 11, Owner Host runtime 준비 step 14도 통과했다.

정확한 HEAD의 Windows smoke는 동일 Windows 사용자 프로필에서 실제 Electron `safeStorage`/DPAPI를
사용했다. Host identity와 새 Member pending-key file store 모두 `create` 및 별도 Electron 프로세스
재독해가 성공했고, 결과는 Electron **43.8.3**, Node **24.22.0**, `realWindowsSafeStorage=true`,
`sameKeyAfterRestart=true`, `memberPendingKeyProtected=true`, `sameMemberKeyAfterRestart=true`다.
이는 이전 Source `d3ddbaaa5270d4288a9a177a093e55d185d1c5d5` run `40180490974` /
Windows job `121130316230`의 capsule-only smoke와 구별되는 새 filestore의 직접 CI 증거다.

전체 CI는 **green이 아니다**. 두 run 모두 production dependency policy step에서 승인 예외 없는
Zod High `1243066`으로 차단됐고, No-AI E2E step 15는 Owner Host의 embedded PostgreSQL이 elevated
Windows 계정에서 시작을 거부해 실패한 뒤 인증된 Workspace BrowserWindow 대기로 시간 초과됐다.
No-AI acceptance 성공으로 기록하지 않는다. 그 후 첫 restricted-token wrapper의 `1cddbcf7` CI는
위와 같이 실패했고 새 private-desktop 보완의 검증을 기다린다. 해당 경로의 재검증 전까지 in-progress/pending으로
유지한다. [Native CI 관측 기록](NATIVE-CI-OBSERVATION-2026-10-25.md)과
[CI runner 검증](../reviews/NATIVE-WINDOWS-CI-RUNNER-VERIFICATION-2026-10-25.md)을 참조한다.
production/full audit는 Zod High `1243066`과 기존 Low 2건을 보고했고 High 보류는 유지된다(예외 없음).
그 외 새 경고는 없고 생성 보안 문서 검사는 통과했다. [설정/복원 lifecycle 검증](../reviews/NATIVE-SETTINGS-RESTORE-VERIFICATION-2026-10-25.md)과 위 pending 저장 검증을 따른다.

## 1. 변경된 우선순위

최우선은 **Windows Host 1대와 별도 Windows Member 1대가 외부 Tailscale 설치·계정·
Serve 없이 연결되는 SPS 내장 LAN 경로**다. Windows Desktop/Host/Member/Node를
먼저 안정화하고 Linux Headless Host와 macOS는 후속으로 둔다. Linux CI 회귀검사는
계속 필수이며, Linux 제품 지원과 혼동하지 않는다.

Core 비공개·공개 SDK, AI 선택형 워크스테이션, 선택적 Primary/Extension, Native
복구와 고객별 Plugin 방향은 그대로다. Lead/Worker·업무 승인·평가는 Plugin 책임이다.
완료한 No-AI/Runtime 관측/모델 broker 기반은 폐기하지 않는다. CLI/Gateway/OCE의
다음 확장보다 이번 연결 기반을 먼저 검토한다. Marketplace/결제/Relay 운영은
LAN의 선행 조건이 아니다.

Windows 비공개 베타와 서명 1차 출시의 잠정 범위·기간·의존성은
[납품 일정 추정](SPS-DELIVERY-ESTIMATE-ko.md)에 분리한다. 전체 장기 비전에 대한
확정 완료일을 뜻하지 않는다.

## 2. 기준과 상태

이번 감사의 고정 코드 기준:

| 영역 | revision / 상태 |
| --- | --- |
| Source | `b1c4b244734e9fbbd627ad5d2953d9d790775678` |
| Core | `0ba417ad9b0e26ae1cf598edca524b82059d04de` |
| 공개 SDK | `d4d69208480fc618b2055378b85d183aea422d50` |
| Desktop | 미출시 소스 `0.4.137`, `development-candidate` |
| 현 원격 제품 계약 | Windows 10/11 x64, Tailscale stable `>=1.52.0` |
| 새 내장 LAN / WAN / Linux Host | 모두 `unsupported` |

전달 문서의 `be2c08b310d51ca92965919eb1363b98d536e99d`는 이전 소스 검증 checkpoint다.
위 Source는 그 뒤 문서 checkpoint이며, 이번 문서 커밋 후의 HEAD를 고정 코드
감사 revision과 혼동하지 않는다. 현재 제품 pin은 [생성 지원표](CURRENT-CANDIDATE.md),
실제 실행 증거는 각 날짜별 수용 기록으로 확인한다.

상태는 `implemented`(코드 존재), `source-tested`(정확한 소스 시험),
`2-PC-tested`(별도 Windows PC), `signed-release-qualified`(최종 서명 바이트),
`unsupported`(지원하지 않음)로 구분한다. 앞 단계가 뒤 단계를 암시하지 않는다.

이번 결과는 [코드 감사/현재 시퀀스](../reviews/WINDOWS-NATIVE-CONNECTIVITY-AUDIT-2026-10-25.md)와
[좁은 프로토콜 RFC](WINDOWS-NATIVE-CONNECTIVITY-RFC-ko.md)에 있다. Stage 0 문서 정렬은
새 TLS/기기 인증 구현이나 실기기 검증 완료가 아니다.

## 3. 책임과 불변식

| 계층 | 담당 | 금지 |
| --- | --- | --- |
| 신뢰된 Core/Host/Member | TLS, 서버 신원, 사용자 인증, 기기 승인, 세션·철회·감사, 현재 Workspace 인가 | Host명/헤더/LAN 도달성만으로 인증, 원격 Member를 Host로 승격 |
| Native 시스템 UI | 최초 Host 선택·페어링, 기기 승인/철회, 오류·복구 | Agent나 Plugin 설치/응답을 필수 조건으로 사용 |
| 공개 SDK | 승인된 Connection의 최소 read/status/observe, 실제 capability·invocation 검사 | 임의 URL/소켓, TLS 개인키/관리 토큰, 최종 인증 판정 |
| 선택적 Plugin | 고객별 연결 상태 표시·온보딩 보조, 업무 UI | 보안 스택·관리자 승인 대체 |
| Node/Runtime | 별도 등록/승인·서명·lease·Runner/Agent/Source grant | Member 페어링으로 CLI 실행이나 Source 접근 자동 허용 |

- TLS 1.3과 검증된 구현을 사용한다. 자체 암호, 전역 인증서 검사 해제, 평문
  fallback, Host proof를 붙이는 무차별 loopback 프록시는 사용하지 않는다.
- 기존 SPS Identity 로그인은 재사용하되 Host 접근 승인은 별도다. 새 외부 로그인
  서버를 만들거나 Google 로그인 요구를 제거하는 계획이 아니다.
- 매 요청과 실시간 구독에 유효한 사용자·승인 기기·현재 Workspace/Plugin 권한이
  필요하다. 본문의 ID, hostname, `X-Forwarded-*`, Tailscale 헤더는 인증 주체가 아니다.
- 연결·인증·인가·실행 readiness는 서로 다르다. 네트워크 장애는 원격 오류로 남기고
  Tailscale/평문/다른 backend/무권한 로컬 실행으로 무음 전환하지 않는다.
- Owner Vault/사용자 데이터/기존 초대·키·Source를 보존한다. 복원은 새 Host의
  재승인을 요구하며 이전 pairing이나 장기 세션을 부활시키면 안 된다.

## 4. 첫 LAN 범위와 별도 Source 문제

첫 PoC는 명시적으로 선택한 LAN 주소와 Host를 사용한다. 자동 검색은 필수가
아니며 검색 결과는 신원 증명이 아니다. 실제 사용자 동의 전에는 LAN listener,
방화벽, UPnP/NAT-PMP, 공인 포트, OS 인증서 저장소를 변경하지 않는다.

**API 연결과 Host 프로젝트 파일 공유를 따로 이전해야 한다.** 현재 SMB route는
`.ts.net` UNC와 Tailscale IPv4 범위의 TCP 445에 의존한다. API의 TLS 연결이 통과해도
파일 편집이 Tailscale 없이 된다고 표시할 수 없다. 기존 Source grant와 Node별
봉인 credential을 보존하고 TCP 445를 일반 LAN/인터넷으로 확대하지 않는다.

Source 후속안은 승인된 파일 operation broker와 제한된 OS 공유를 비교한다.
전체 폴더 동기화/복제, 임의 경로 노출, Member의 Host 폴더 지정은 대안이 아니다.
첫 전송 PoC가 파일 작업을 지원하지 않으면 명시적으로 미지원 표시하고, 기존
파일 작업은 사용자가 선택한 기존 경로에 남긴다. Tailscale의 전체 제거 판정에는
Source와 Owner 복구 이전도 포함한다.

## 5. 승인된 결정과 남은 선택

**D1 승인(2026-10-25):** 첫 LAN 경로는 신뢰한 별도 채널로 전달하는 **전체 초대코드와
Host 서버 지문 확인**부터 진행한다. 고객 관리 CA는 후속이다. 초대코드가 진짜
Host에서 왔다는 전달 채널의 신뢰가 필요하며, 코드 파싱 성공은 TLS/사용자/기기
인증이나 Workspace 접근 승인이 아니다. 서버 지문 변경을 자동 수락하지 않는다.

**D2 승인(2026-10-25):** SPS가 PC마다 별도 Member 기기 인증서를 관리하는 mTLS
방식부터 진행한다. Google 사용자 인증·Node/CLI 실행 승인은 별개이며, 재설치나
기기 키 분실 시 재승인이 필요하다. TPM/non-exportable 보장이나 기존 Node 키
재사용을 승인한 것이 아니다.

**D3 승인(2026-10-25):** LAN 공유는 기본 꺼짐이다. Host가 명시적으로 켠 경우에만
선택한 사설 네트워크와 전용 TLS 포트에 허용한다. 실제 방화벽 변경·외부 listener
활성화·두 PC 시험은 별도로 확인받는다. 현 단계는 loopback 합성 시험뿐이다.

D6 승인(2026-10-25): 초대코드를 받은 사람이 Google/SPS 로그인 후 등록을 요청할 수
있으며 특정 이메일로 제한하지 않는다. 기본 유효기간은 **1시간**, 첫 성공한 등록 요청으로
일회 소모한다. Host 기기 승인과 Workspace/Plugin/Node/Source 권한은 자동으로 생기지 않는다.
잘못된 secret이나 잘못된 대상 요청이 정상 등록의 성공으로 취급되는 정책은 아니다.
**D6 추가 승인(2026-10-26):** 초대별 검증된 잘못된 secret 5회면 `exhausted`로
더 이상 사용할 수 없고, Host별 활성 초대는 최대 10개다. 만료·소진·소비·철회된
초대는 활성 수에서 제외한다. 로컬 코드 형식 오류나 미인증 요청을 오입력 횟수로
과금하지 않으며, Core의 기존 원자적 한도 검사를 Desktop 명시적 기본 정책으로 쓴다.
이는 초대 UI나 외부 listener 활성화 승인이 아니다.

**D7 승인(2026-10-25):** 서버 및 Member 기기 인증서의 기본 유효기간은 각각 **90일**,
별도 issuer CA 인증서의 기본 유효기간은 **365일**이다. 여전히 승인된 기기는 만료 전에
기존 키와 검증된 현재 신원을 사용해 갱신한다. 키가 변경·분실되면 명시적 재신뢰/재승인이
필요하고, 철회된 기기는 갱신하지 않는다. 주기적 재로그인이나 코드를 다시 붙여넣도록 강제하지 않는다.

D7은 운영 기본값과 갱신 원칙의 승인이다. 후속 구현은 현재 세션·기존 키·승인 기기로
만료 전 Member 인증서를 명시적으로 갱신하며, 마지막 30일(짧은 수명은 1/3)로 제한한다.
Host 서버 인증서의 같은 키 갱신과 Member target 전환은 후속 소스 통합 검증을 마쳤다.
issuer 회전·만료 후 신뢰 복구는 미완료다. 격리 시험 키만 사용했고
실제 고객 키나 운영 listener를 변경하지 않았다.
D4~D5와 키 회전·최대 TTL·rate limit·보관 기간·listener 배치의 세부 계약은 여전히 검수 대상이다.

**D8 승인(2026-10-26):** 계정별로 검증한 Host 주소와 지문을 보관해 등록 완료 응답이
유실되거나 앱이 재시작된 뒤 기존 등록 상태를 확인한다. 개인키는 Windows 암호화
저장소에 유지한다. 현재 사용자 세션과 같은 기기 인증서의 실제 키 소유를 확인한
읽기 전용 조회를 사용하며, 자동 재등록·기기 승인·초대 재사용은 하지 않는다.
아직 구현 중인 복구 계약이지 새로운 listener, 키 회전, 인증서 자동 신뢰 또는 LAN
활성화 승인이 아니다. 만료된 일회용 초대 secret을 장기 자격으로 보관하지 않는다.

| ID | 필요한 결정 | 권고 / 비교안 | 결정 전 가능한 일 |
| --- | --- | --- | --- |
| D1 승인 | 전체 초대코드 + Host 서버 지문 확인 우선 | 고객 관리 CA 후속; 미확인 TOFU 자동 수락 금지 | 비활성 초대 envelope 계약·거부 테스트, 실제 TLS/키 정책은 별도 |
| D2 승인 | PC별 별도 Member mTLS 인증서 + Host 승인 | 사용자/Node/CLI/Source 권한 분리, 재설치/키 분실 시 재승인 | 발급·보관·철회·회전 세부 계약, 기존 키와 용도 분리 |
| D3 승인 | LAN 기본 off, Host 명시 opt-in, 선택 사설망 + 전용 TLS 포트 | local_trusted bind 확대/자동 방화벽 변경 금지; 배치 세부는 검수 | loopback TLS 시험, 외부 listener/방화벽/두 PC는 별도 동의 |
| D6 승인 | 코드 받은 verified 사용자·1시간·첫 등록 요청 시 소모·오입력 5회 소진·Host 활성 10개 | 기기 승인·Workspace/실행 권한 별도 | 비활성 Desktop 기본값과 실제 Core 한도 시험; 앱 초대 UI·전송은 후속 |
| D7 승인 | 서버/Member 인증서 90일, 별도 issuer CA 365일; 승인 기기 기존 키·현재 신원으로 만료 전 갱신 | 키 변경/분실은 명시적 재신뢰·재승인, 철회 기기는 갱신 금지, 주기적 재로그인/코드 재입력 강제 없음 | Host·Member 갱신·보호 저장·기존 등록 조회와 target 전환 연결; issuer 회전·만료 후 재신뢰·설치본/두 PC 검증 미완료 |
| D4 | Tailscale 없는 Host Source 접근 | 제한된 파일 broker vs OS 공유; 경로/링크/충돌/철회 검증과 권한 명시 | 현재 SMB 보존, read/write/rename/delete 요구 정리 |
| D5 | WAN / 자동 검색 / 운영 모델 | LAN 수용 뒤 기업 TLS endpoint·relay·NAT 대안 비교 | 이번 구현 범위에서 제외 |

사용자가 승인한 Windows-first 목표와 D1~D3을 D4, 키/세션 세부 정책이나 실제
외부 네트워크/운영 변경 승인으로 확대하지 않는다. 0-Agent/0-Plugin 복구는 필수다.

## 6. 작은 변경 단위

| 순서 | 범위 | 진입/완료 Gate와 롤백 |
| --- | --- | --- |
| 0 완료 | 11영역 코드 감사·현재 시퀀스·RFC·결정 목록·문서 정렬 | `f5171ef83473fc538a7b5db6576c3c99ab05cebe` 문서 checkpoint. 런타임/DB/키/지원표 불변 |
| 1 계약 중 | D1~D3 승인, 초대/서버 인증서·TLS source 시험, Member 세션·철회·Native 복구의 세부 계약 | HTTP/WS/서브리소스의 단일 인가, 기기 registry와 키/세션 정책 검수. 아직 외부 노출 없음 |
| 2a Core 진행 | 기기 registry/승인·철회·현재 인가·TLS peer/WS 검사와 내부 일회용 pairing 저장 계층 구현 | 최초 연결 인증/TLS adapter·Native ingress·HTTP 전체 경로/실제 LAN은 미완료 |
| 2b Desktop 일부 | Host-only 인증서 준비 연결, 비활성 Member 발급·recipient 검증·private pending filestore | 수·runtime/CI는 현재 체크포인트 참조. 새 filestore의 잠긴 runtime 검증·앱 caller/발급 자격 저장·enrollment·승인/복구 UI 미완료 |
| 2c 실제 LAN | 승인된 시험 데이터로 Windows 두 PC | Tailscale 없는 A/B 연결, 잘못된 서버/사용자/기기·Workspace 거부, 실제 포트/버전/tuple 증거. 미통과시 opt-in 해제 |
| 3 SDK | 승인 Connection read/status부터, scoped observe | 실제 handler → SDK 선언/worker → packed consumer → Desktop 수용, missing invocation/capability·A/B 거부. 관리 mutation은 비공개 |
| 4 통합 | D4 Source, Owner 복구, 로그아웃·키 회전·연결 복구 | API·Source·Node를 독립 검증. 철회/복원 후 권한 부활 없음. 기존 초대/데이터 유지 |
| 5 제품 | signed package·업데이트·두 PC·정확한 바이트 | 별도 승인 후만 설치본 교체. 동일 Source/Core/SDK/설치본 SHA에 수용·공격·업그레이드/롤백 증거 결속 |
| 6 후속 | WAN 설계·운영비/relay/고객 정책 결정 | LAN 지원과 분리, 사용자 승인 전 운영 서비스 생성 없음 |
| 7 후속 | Windows 안정 뒤 Linux Headless 준비 | 클라이언트/SDK 계약 재사용; 지금 Linux 제품 구현 안 함 |

한 PR에서 Host 전체 교체, 새 workflow 엔진, SDK 범용 네트워크 API, 기존 SMB 제거를
묶지 않는다. Source/Core/SDK 각각 필요한 변경만 하고 support matrix pin을 함께
검증한다. 구 SDK/Host는 명시적 unknown/unsupported이며 새 메서드를 추정 호출하지 않는다.

## 7. 수용·증거 체크리스트

- 서버 인증서·지문 변경/다른 Host 초대·중간자·hostname/forwarded header 위조 거부.
- 미승인/철회/복제 기기, 탈퇴 사용자, 만료 세션, challenge 재사용·경합·시도 제한.
- A/B Workspace·Plugin·비활성 activation, capability 누락, Host 관리 API 호출 거부.
- HTTP뿐 아니라 WS upgrade·지속 구독·파일/Artifact·UI 자산·재연결의 같은 권한.
- Member 연결과 Node 등록/활성·Runner/Agent/Source grant·lease를 독립 시험.
- 방화벽 차단·주소/포트 변경·LAN 단절·Host 재시작 시 안전 오류와 명시적 복구.
- 철회 직후 새 요청/구독 거부와 기존 스트림 종료. 이미 발생한 파일/모델/Node 효과를
  되돌렸다고 표시하지 않음. 새 인증 generation으로 재접속 필요.
- Vault/DB 복원 후 pairing/세션/기기 grant가 살아나지 않고 Native 재승인 가능.
- 0-Agent/0-Plugin, Plugin hang, 손상 설정에서도 Native 설정·철회·복구 진입.
- 네트워크/인증 변경은 기존 Builder/Preview·No-AI·모델 broker와 Tailscale 시험을 보존.

증거에는 명령·시각·Source/Core/SDK·실제 listener/프로세스·TLS 구현 버전·설치본
SHA·실제 HTTP/WS 결과를 결속한다. 원문 토큰·키·이메일·PC명·실주소·로컬 절대경로를
공개 로그에 넣지 않는다. 기존 Tailscale 전용 증거를 새 LAN 증거로 재사용하지 않는다.

## 8. 지원 전환과 남은 Gate

현재 `support-matrix.json`의 `remoteTransport: tailscale`은 그대로 둔다. LAN만
검증되면 LAN 범위만 추가하고 인터넷/NAT 연결을 홍보하지 않는다. 구 경로는 사용자의
명시적 선택으로 유지하고, 검증 뒤 별도 마이그레이션에서만 Tailscale 요구를 제거한다.

Zod major/설치본 교체 보류, 전체 최신 CI, Identity 운영 rollout, 코드 서명, 동일
서명본의 두 PC 수용·업그레이드, 독립 승인·Core main 조건은 [릴리스 기준](RELEASE-BASELINE-ko.md)을
유지한다. 새 연결이 이 Gate를 면제하지 않는다. Stage 3b의 기존 UI token gate
실패와 미승인 Zod High 기록도 해소된 것으로 표시하지 않는다.

Stage 0에서는 실행 코드를 바꾸지 않았다. Stage 1은 독립 초대 계약과 서버 인증서/
TLS 확인 시험을 추가했다. Stage 2a는 additive migration 0165와 Core 기기 관리 계약을
추가하며, 실제 사용자 DB가 아니라 임시 DB에서 검증한다. Core 기기 관리 API router는 신뢰된
`nativeConnectivityHostId`가 있을 때만 mount되고 제품 startup에서 아직 이 ID를 전달하지 않는다.
이는 위에 연결된 로컬 Core Settings Host 인증서 준비 경로와는 별개다.
신규 WS guard도 전용 Native ingress용 opt-in이며 기존 local/Agent/TS listener에 붙이지 않는다.

내부 pairing 저장 계층은 migration 0166으로 소비/이벤트와 pending 생성을 함께 검증했다.
신뢰된 호출자가 실제 세션·기기 키 소유·현재 Host 지문을 검증하는 전송 프로토콜은 후속이다.
초대 대상/기본 TTL은 D6으로 확정했다. Desktop의 비활성 요청 기본값은 any-verified-user와
1시간이며, 범용 Core 저장 계층은 여전히 명시적인 정책 입력을 요구한다.

Host PKI/암호화 보관 및 버전별 한계는 [키 보관 검증](../reviews/NATIVE-HOST-IDENTITY-VERIFICATION-2026-10-25.md)에 기록한다.
자세한 restore 경합과 오류 동작은 [설정/복원 lifecycle 검증](../reviews/NATIVE-SETTINGS-RESTORE-VERIFICATION-2026-10-25.md)에 기록한다.
다음은 기존 slot과 Vault incarnation이 불일치하거나 손상된 경우의 명시적 복구·restore lifecycle을 연결하고,
Member 발급 활성화/enrollment·키 저장 앱 lifecycle·pairing 전송 결속·0-Agent/0-Plugin 복구 UI를 구현하는 일이다. 기본 off Native ingress,
전체 HTTP/WS/서브리소스 인가·철회와 실제 두 PC는
후속 수용 Gate다. OS 키/인증서 저장소·방화벽·Tailscale·설치본·고객 데이터를 변경하는
명령은 실행하지 않는다. 검수/동의 전 실제 LAN·WAN·Linux·고객 환경으로 확대하지 않는다.
