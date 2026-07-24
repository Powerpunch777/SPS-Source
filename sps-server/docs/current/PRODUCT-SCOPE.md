# SPS 1차 제품 범위와 기능 상태

최종 갱신: 2026-07-24

## 제품 한 문장

SPS는 **승인된 로컬 컴퓨터에서 AI가 수행한 작업을 프로젝트·권한·검증 기록과 함께 운영하는 Desktop-first AI 작업 제어 플랫폼**이다.

## 1차 Golden Path

1. 사용자가 SPS Desktop에서 Google 계정으로 로그인한다.
2. 이 컴퓨터에 Owner Host를 만들거나, 초대 코드로 기존 Server에 참여한다.
3. Owner가 프로젝트 Workspace, Agent, Runner 권한을 등록한다.
4. Team Workplane에서 Room으로 목표를 논의하고, 종료 조건이 있는 Task를 만든다.
5. 허용된 Node와 Runner가 등록된 Workspace 안에서만 Task를 실행한다.
6. 파일 변경, 출력, 테스트 결과를 Task 기록에서 검토하고 완료를 판단한다.

## 기능 상태

| 상태 | 항목 | 의미 |
| --- | --- | --- |
| Implemented | Hub, Project, Task, Agent Session, Desktop Node 경계 | 제품의 기본 작업 기록과 실행 권한 모델 |
| Pilot | Owner Host, Google 로그인, 초대, 다중 Node, Team Workplane | 실제 개인·소규모 팀 사용으로 반복 검증 중 |
| Pilot | Official Extensions와 local·git·official Registry source | 서명 검증, disabled stage, 명시적 enable, update·rollback |
| Experimental | Plugin Kit, MCP Connector, 추가 Team·Tool·Automation extension | 계약과 테스트를 확장 중이며 기본 설치에 의존하지 않음 |
| Contract only | 기업 Hosted Hub federation, 공개 Community Marketplace | 아직 일반 사용자 대상 기능으로 제공하지 않음 |
| Deferred | 결제, 판매자 정산·세금·환불, 평점·검색·공개 게시자 포털 | Registry와 설치 lifecycle이 충분히 검증된 뒤 별도 제품 단계에서 판단 |

## Official Extensions의 경계

1차의 `Official Extensions`는 SPS가 서명한 플러그인의 **발견 화면**이다. 이 화면은 다운로드나 설치 권한이 없으며, 설치는 Owner가 `Plugin sources & review`에서 정확한 version·capability·호환성을 검토하고 disabled stage로 가져온 뒤 명시적으로 enable할 때만 일어난다.

커뮤니티가 플러그인을 공개 게시하거나 판매하는 Marketplace는 만들지 않는다. 향후 이를 검토하려면 패키지 서명·철회, 게시자 신원, 호환성·권한 검토, 지원 정책을 먼저 반복 검증해야 한다.

## 이번 단계에서 의도적으로 하지 않는 것

- 모든 AI 역할이나 게임·웹·앱 개발 방식을 Core에 고정하지 않는다.
- Hub가 Node의 임의 폴더나 비밀 값, 로그인 토큰을 읽지 않는다.
- 카탈로그를 열었다고 플러그인이 자동 설치·업데이트·활성화되지 않는다.
- 모델의 요약이나 추론을 자동으로 승인된 장기기억으로 확정하지 않는다.
