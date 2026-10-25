# SPS 납품 범위와 예상 일정

기준일: 2026-10-25 KST. **계획용 추정치이며 확정 납기나 자동 실행 시간 보장이 아니다.**
현재 Source는 Windows `0.4.137` 개발 후보이며 새로운 서명 설치본이 아니다.
[Windows 내장 연결 계획](WINDOWS-NATIVE-CONNECTIVITY-PLAN-ko.md)의 D1은 승인됐고,
D2 기기별 mTLS와 D3 LAN 기본 off 정책도 승인됐다. loopback TLS 확인 소스 시험은
통과했고 Core 기기 registry/승인·철회와 선택적 mTLS/WS 소스 기반을 추가했다.
실제 LAN·인증서 발급/앱 최초 pairing·Tailscale 없는 Source 이전은 구현/수용 전이다.

## 1. 무엇을 완성으로 볼 것인가

| 도달점 | 포함 범위 | 지금부터 예상 |
| --- | --- | --- |
| 첫 LAN 실증 | 승인된 기기 계약과 TLS, Native 초대/지문 확인, 별도 Windows 두 PC의 연결·거부·철회 | 5~10 집중 개발일 |
| Windows 비공개 베타 | 위 연결 + Source/Node/Owner 복구 연동, SDK 최소 조회, Builder/Preview의 고객 Plugin 제작→설치→Member 사용 루프, 명시적 제한과 진단 | 4~6주 |
| Windows 1차 출시 | 베타 버그 수렴 + 전체 CI·보안·Identity 운영·독립 승인·서명·동일 설치본 두 PC/업그레이드·복원·게시 검증 | 8~12주 |
| 장기 제품 비전 | WAN/relay, 다른 OS, 고객별 Connector/OCE, 공개 커뮤니티 Marketplace/결제 등 | 현시점 신뢰할 수 있는 전체 완료일 산정 불가. 최소 수개월 단위의 별도 로드맵 필요 |

첫 LAN 실증은 API 연결의 중간 성과다. Source/복구를 아직 이전하지 않았다면
제품 전체가 Tailscale-free가 됐다고 표시하지 않는다. 베타도 공개 Stable과 다르다.
완료 예상은 같은 기준일부터의 범위이며 각 행을 더하는 일정이 아니다.

## 2. 근거와 병렬/직렬 작업

이미 No-AI, Runtime/Agent 관측, mock-first 모델 broker, Plugin authoring/Preview,
기술 실행/기록·Node/Source grant 기반이 있다. 이를 재사용하는 일정이지 새 제품을
처음부터 만드는 추정은 아니다. 다만 source/mock 시험은 실계정·두 PC·설치본 수용을
대체하지 않는다. 코드/문서가 있다는 이유로 남은 검증을 생략하지 않는다.

| 남은 작업 | 핵심 의존성 / 불확실성 |
| --- | --- |
| D1~D3 승인 정책의 세부 신원·키 수명·TLS ingress/포트 계약 | 실제 listener/방화벽 변경·장비 시험은 별도 동의 |
| Host/Member TLS·pairing·세션·철회 및 HTTP/WS 인가 | 서버 신뢰 배포, challenge 경합/재생, A/B/Plugin 경계 |
| Native 최초 설정·진단·복구 | 0-Agent/0-Plugin, 손상 설정·Plugin hang, 원격 renderer와 관리 IPC 분리 |
| D4 Source/SMB 이전과 Owner 복구 | 파일 경로·링크·충돌·철회·Node 자격, 기존 데이터/공유 보존 |
| 공개 SDK facade와 호환성 | 실제 Host handler, 필수 invocation/capability, packed consumer, 구 Host 미지원 |
| Builder/Preview/고객 Plugin 전체 루프 | Lead/Worker는 Plugin 책임; 실제 실행·취소·사용 가능한 backend의 개별 수용 |
| 보안/프로세스·복원/업데이트 회귀 | 미지원 OS/renderer 보호를 보장하지 않음; 선택한 제품 위협 모델로 별도 검증 |
| Identity·CI·서명·두 PC·게시 | 미승인 Zod High/major 보류, 운영 자격·인증서/독립 승인과 실제 장비 준비 |

Luna에 독립된 구현·테스트·문서 검토를 병렬로 맡길 수 있지만, 계약 확정→통합 검수→
실제 두 PC→최종 서명 바이트 검증은 상당 부분 직렬이다. 분업 수를 늘려도 이 시간을
없앨 수 없다. 총괄 검수와 거부 테스트를 일정에 포함한다.

## 3. 추정의 전제와 갱신

- 범위를 Windows LAN/현재 Core·공개 SDK·기존 Builder의 1차 제품에 고정한다.
  WAN·Linux·Marketplace 결제·모든 외부 AI/기업 환경은 포함하지 않는다.
- D1~D3 세부 계약/D4 결정, 별도 Windows Member PC와 시험용 계정, 운영 Identity·서명·독립 승인
  준비가 개발과 병행된다는 전제다. 사용자 결정/장비/외부 서비스 대기 시간은 납기로
  확약할 수 없으며, 해결하지 않은 Gate는 출시를 계속 차단한다.
- 보안 major 보류를 일정 때문에 임의 해제하거나 예외 처리하지 않는다. 전체 CI나
  물리 시험 실패가 나오면 원인별로 다시 산정한다.
- 최초 LAN/Source 수용 후 실제 변경량과 버그 추세로 베타 범위를 다시 추정한다.
  퍼센트·테스트 개수·Agent 작업 시간만으로 제품 전체 완료율을 만들지 않는다.
- 이번 기간은 잠정적인 집중 개발 작업량이다. 앱/사용자/도구가 중단돼도 자동으로
  상시 개발이 보장된다는 뜻이 아니며, 확정 날짜가 필요하면 별도 납품 범위를 정한다.

현재 구현/지원은 [아키텍처](PRODUCT-ARCHITECTURE-ko.md), [후보](CURRENT-CANDIDATE.md),
[릴리스 Gate](RELEASE-BASELINE-ko.md), 날짜별 수용 기록이 기준이다.
