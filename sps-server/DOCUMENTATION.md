# SPS 문서 지도

이 파일은 `sps-server` 문서의 진입점이다.

## 현재 기준

| 질문 | 기준 문서 |
| --- | --- |
| SPS가 어떤 제품인가? | `114-sps-product-and-plugin-platform-contract-ko.md` |
| Core와 플러그인의 경계, Plugin Kit 이전 표준화는? | `114-sps-product-and-plugin-platform-contract-ko.md`의 `SPS Extension Profile` |
| 무엇을 어떤 순서로 구현하는가? | `115-sps-plugin-kit-and-bundled-teams-implementation-plan-ko.md` |
| 공식 플러그인은 어떻게 발견·검증·설치되는가? | `120-sps-plugin-registry-and-official-extensions-contract-ko.md` |
| 지금 출시·검증·보류 중인 기능은 무엇인가? | `docs/current/PRODUCT-SCOPE.md` |
| 문서가 충돌하면 무엇을 따르는가? | `116-sps-documentation-audit-and-migration-ko.md` |
| Room·Task·Workspace의 상세 UX와 기술 구조는? | `75-optimal-work-environment-blueprint-ko.md` |
| 범용 Agent 플랫폼의 Core 경계는? | `113-sps-generic-agent-platform-core-contract-ko.md` |
| 현재 사용자는 어떻게 사용하는가? | `97-current-server-user-guide-ko.md` |
| Hosted Hub와 Desktop은 어떻게 운영하는가? | `110-sps-desktop-host-mode-ko.md` |
| Public Hub는 어떻게 배포하는가? | `105-sps-public-hub-docker-deployment-ko.md` |
| Multi-Node 준비 상태는? | `109-sps-multi-node-readiness-audit-ko.md` |

## 현재 제품 범위

첫 출시 목표:

- SPS Core Product
- SPS Extension Profile + Plugin Kit
- 공식 Team Workplane과 기본 Memory Provider
- local·GitHub·official source의 서명·무결성·권한 diff 기반 설치
- Owner의 명시적 활성화, 업데이트, 롤백

1차에서 제외하고 검증 뒤에만 검토할 항목:

- 커뮤니티 공개 Marketplace와 게시자 포털
- 판매자 정산·세금·환불
- 기업용 private Registry federation
- 코어 라이선스 최종 결정

## 문서 유형

- Product Contract: 사용자에게 약속하는 현재 제품 범위
- Implementation Contract/Plan: 구현 순서와 완료 기준
- Operational Guide: 현재 실행 가능한 운영 절차
- Audit: 특정 시점 검토
- Implementation Log: 완료 변경과 검증 증거
- Historical: 현재 기준이 아닌 보존 자료

번호가 붙은 구현 로그는 삭제하지 않는다. 다만 새로운 제품 결정이나 구현 우선순위는 `docs/current/`과 현재 기준 문서에 먼저 반영한다.

## 문서 변경 규칙

코드 변경으로 다음이 바뀌면 같은 PR에서 문서를 갱신한다.

- 제품 범위
- 권한과 보안 경계
- Plugin manifest와 lifecycle
- Room·Task 상태 전이
- Desktop Node 실행 경계
- 설치·배포 명령
- 공식 기본 제공 플러그인

구현 로그를 추가하는 것만으로 기준 문서가 자동 갱신된 것으로 간주하지 않는다.
