# SPS Windows 내장 연결 계획

기준일: 2026-10-25 KST. 상태: **Stage 0 완료, Core 2a 진행 중, Desktop 2b 일부 연결; 내장 LAN 미지원**.
사용자가 전달한 Windows-First Native Connectivity 인계서와 목표 교체 요청을
반영한다. 이 문서는 네트워크 변경, 설치본 교체, 운영 배포 승인이 아니다.

승인 D1의 비활성 초대 codec과 연결별 공개 인증서/TLS 확인은 소스 시험을 통과했다
(codec 25건, TLS 12건). TLS는 임시 loopback 시험 서버만
사용했다. 별도 Core 기기 registry·승인/철회·현재 Workspace 인가, 실제 loopback
mTLS 검증 helper와 선택적 WS guard를 추가했다. 앱 join/Native TLS listener·
최초 pairing·Member 기기 인증서 발급에는 연결하지 않았으므로 내장 LAN 지원 완료가 아니다.
정확한 범위와 명령은 [Member 기기 소스 검증](../reviews/NATIVE-MEMBER-DEVICE-SOURCE-VERIFICATION-2026-10-25.md)을 따른다.
그다음 내부 pairing 저장 계층은 원자적 일회용 소비·시도 제한·Host/서버 지문 결속과
가입 전 사용자의 pending 기기 생성까지 추가했다. 아직 실제 최초 연결 프로토콜은 아니다.
[pairing 저장 계층 검증](../reviews/NATIVE-PAIRING-STORE-VERIFICATION-2026-10-25.md)을 따른다.

## 현재 체크포인트

신뢰된 Host 전용 Core Settings에서 명시적으로 확인한 뒤 Host 인증서 준비를 실행하는
좁은 경로가 연결됐다. 이는 Member 기기 인증서 발급이나 등록 UI가 아니다. Native LAN은
계속 OFF이며 Native LAN listener나 방화벽 변경은 없다. Member 발급·세션 등록·인증서 갱신도 없다.

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

최종 Desktop 전체 unit은 **654/654 (skip 없음)**, focused command는 **75/75** 통과했다. Core Settings source
Electron의 7개 모드도 재실행해 기존 로컬 Electron **43.7.7**에서 모두 통과했다. 이는 잠긴
Electron **43.8.3** 또는 DPAPI v2의 양성 수용 증거가 아니다. 새 Native smoke 첫 실행이
도입된 `await electronPhase()` deadlock을 잡아 부모가 기존 `void` entry를 복구하고 regression
assertion을 추가했다. 재시도는 `runtime_validation / electron_version_mismatch`로 fail closed했고
actual `43.7.7`, Node `24.21.0`, expected `43.8.3`을 보고했다. 이는 fail-closed 진단 확인이지
43.8.3 DPAPI 성공이 아니다. CI는 lock-default Electron binary를 사용하며 override 실행을 수용 증거로
보지 않는다. 정확한 Source `9c3c145abc536fa9add5d6e6f5f87fc7d2b6d404` CI run `40175609939`는
9개 Linux shard와 Core full typecheck/build는 통과했고, Windows Native identity smoke 및 Zod High
`1243066` production gate 때문에 전체 실패했다(예외 없음). Windows No-AI 단계는 skipped였다.
Core run `40175522247`은 고정 Core revision에서 15 jobs 성공했다. 진단 mismatch는 로컬에서 확인됐고
이 수정을 포함한 새 CI는 아직 없다. [설정/복원 lifecycle 검증](../reviews/NATIVE-SETTINGS-RESTORE-VERIFICATION-2026-10-25.md)을 따른다.

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

**D7 승인(2026-10-25):** 서버 및 Member 기기 인증서의 기본 유효기간은 각각 **90일**,
별도 issuer CA 인증서의 기본 유효기간은 **365일**이다. 여전히 승인된 기기는 만료 전에
기존 키와 검증된 현재 신원을 사용해 갱신한다. 키가 변경·분실되면 명시적 재신뢰/재승인이
필요하고, 철회된 기기는 갱신하지 않는다. 주기적 재로그인이나 코드를 다시 붙여넣도록 강제하지 않는다.

D7은 운영 기본값과 갱신 원칙의 승인이다. 현재 구현은 명시적 시각을 받는 계산 helper와
비활성 Host 인증서 생성/암호화 보관 primitive이며, 실제 갱신 threshold·issuer 회전·기기
발급·mTLS ingress는 미완료다. 격리 시험 키만 사용했고 실제 고객 키/listener는 만들지 않았다.
D4~D5와 키 회전·최대 TTL·rate limit·보관 기간·listener 배치의 세부 계약은 여전히 검수 대상이다.

| ID | 필요한 결정 | 권고 / 비교안 | 결정 전 가능한 일 |
| --- | --- | --- | --- |
| D1 승인 | 전체 초대코드 + Host 서버 지문 확인 우선 | 고객 관리 CA 후속; 미확인 TOFU 자동 수락 금지 | 비활성 초대 envelope 계약·거부 테스트, 실제 TLS/키 정책은 별도 |
| D2 승인 | PC별 별도 Member mTLS 인증서 + Host 승인 | 사용자/Node/CLI/Source 권한 분리, 재설치/키 분실 시 재승인 | 발급·보관·철회·회전 세부 계약, 기존 키와 용도 분리 |
| D3 승인 | LAN 기본 off, Host 명시 opt-in, 선택 사설망 + 전용 TLS 포트 | local_trusted bind 확대/자동 방화벽 변경 금지; 배치 세부는 검수 | loopback TLS 시험, 외부 listener/방화벽/두 PC는 별도 동의 |
| D6 승인 | 코드 받은 verified 사용자·1시간·첫 등록 요청 시 소모 | 기기 승인·Workspace/실행 권한 별도 | 비활성 Desktop 요청 기본값; 실제 발급/전송은 후속 |
| D7 승인 | 서버/Member 인증서 90일, 별도 issuer CA 365일; 승인 기기 기존 키·현재 신원으로 만료 전 갱신 | 키 변경/분실은 명시적 재신뢰·재승인, 철회 기기는 갱신 금지, 주기적 재로그인/코드 재입력 강제 없음 | validity 계산·비활성 Host PKI/보관 시험; 갱신 threshold·issuer 회전·기기 발급·mTLS ingress 미완료 |
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
| 2b Desktop 일부 | 신뢰된 Host-only Core Settings 명시 확인 후 인증서 준비까지 연결 | 최종 Desktop 654/654 (skip 없음), focused command 75/75, 7개 source Electron 모드가 43.7.7에서 통과; lock-default smoke는 43.7.7/43.8.3 mismatch에서 fail closed. 43.8.3 DPAPI 양성 증거·Member 클라이언트/발급·복구 UI 미완료 |
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
Member 발급·pairing 전송 결속·0-Agent/0-Plugin 복구 UI를 구현하는 일이다. 기본 off Native ingress,
전체 HTTP/WS/서브리소스 인가·철회와 실제 두 PC는
후속 수용 Gate다. OS 키/인증서 저장소·방화벽·Tailscale·설치본·고객 데이터를 변경하는
명령은 실행하지 않는다. 검수/동의 전 실제 LAN·WAN·Linux·고객 환경으로 확대하지 않는다.
