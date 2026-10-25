# SPS Windows 내장 연결 계획

기준일: 2026-10-25 KST. 상태: **Stage 0 감사/설계, 내장 LAN 미구현**.
사용자가 전달한 Windows-First Native Connectivity 인계서와 목표 교체 요청을
반영한다. 이 문서는 네트워크 변경, 설치본 교체, 운영 배포 승인이 아니다.

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

## 5. 미확정 결정

아래는 권고/선택지이며 승인된 제품 정책이 아니다. 결정 전에는 해당 효과가 있는
실행 코드를 켜지 않는다. 구체적인 TTL·rate limit·보관 기간도 RFC 수용 전에 확정한다.

| ID | 필요한 결정 | 권고 / 비교안 | 결정 전 가능한 일 |
| --- | --- | --- | --- |
| D1 | Host 신원을 Member에게 안전하게 전달하는 방법 | 신뢰한 별도 채널의 전체 초대에 Host 지문 포함 vs 고객 관리 CA; 미확인 TOFU 자동 수락 금지 | identity DTO·거부 시나리오·UI 초안 |
| D2 | Member 기기 자격과 키 보호/교체 | 별도 Member 키 + mTLS 기기 인증서 vs 표준 PoP 방식; Node 키와 권한은 분리 | 기존 키 보관/복원 감사, 라이브러리/Windows 제약 검토 |
| D3 | LAN listener 소유자·포트·허용 인터페이스·방화벽 동의 | 별도 신뢰 ingress vs Core TLS listener 비교; 기존 local_trusted bind 확대 금지 | mock 계약/노출 위협 모델; 실제 listener/방화벽 변경 없음 |
| D4 | Tailscale 없는 Host Source 접근 | 제한된 파일 broker vs OS 공유; 경로/링크/충돌/철회 검증과 권한 명시 | 현재 SMB 보존, read/write/rename/delete 요구 정리 |
| D5 | WAN / 자동 검색 / 운영 모델 | LAN 수용 뒤 기업 TLS endpoint·relay·NAT 대안 비교 | 이번 구현 범위에서 제외 |

사용자가 승인한 Windows-first/Tailscale 없는 목표를 D1~D4의 임의 보안·운영 선택
승인으로 확대하지 않는다. Agent/Plugin 0개 Native 복구는 선택 항목이 아니다.

## 6. 작은 변경 단위

| 순서 | 범위 | 진입/완료 Gate와 롤백 |
| --- | --- | --- |
| 0 지금 | 11영역 코드 감사·현재 시퀀스·RFC·결정 목록·문서 정렬 | 런타임/DB/키/지원표 불변. 이번 문서만 revert 가능 |
| 1 계약 | D1~D3 결정, trusted ingress/Member 자격·세션·Native 복구 계약 | HTTP/WS/서브리소스의 단일 인가 모델, 정확한 DTO·실패·제한, 공격 테스트 설계 검수. 아직 외부 노출 없음 |
| 2a Core | opt-in TLS/auth 경계·짧은 일회용 pairing·기기 승인/철회 | mock/격리 TLS fixture, 미승인·위조·재생·동시 소비·A/B·복원 거부. 기존 Tailscale/로컬 권한 회귀 |
| 2b Desktop | Native 설정과 Member 클라이언트, 0-Agent/0-Plugin 복구 | 임시 source Electron, 브라우저·Plugin bridge 승격 차단, 재시작/중단·철회 수용. 실제 LAN은 별도 동의 |
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

이번 단계에는 실행 코드·DB migration·OS 키/인증서·방화벽·Tailscale·설치본·고객
데이터를 변경하지 않는다. 다음은 D1~D3의 최소 선택과 계약 검수이며, WAN·Linux나
실제 고객 환경으로 범위를 확장하지 않는다.
