# SPS Product Scope

최종 갱신: 2026-07-28

## 한 문장

SPS는 Agent, 실행기, 플러그인을 조합해 개인과 팀이 자기만의 AI 작업환경을 만드는 Desktop-first 플랫폼이다.

## 첫 회사

새 서버를 만든 사용자는 빈 Company를 얻는다. 기본 Project, Team 구조, 역할 조직, Memory 전략은 생성되지 않는다.

첫 Company에는 다음만 준비된다.

1. 회사 컨테이너
2. 사용자가 연결·검증한 Agent 한 명
3. 활성화된 `Plugin Discovery & Builder` 플러그인
4. `Settings > Plugins`의 플러그인 관리·Catalog 탐색 화면

첫 Agent는 `Plugin Discovery & Builder` 안에서 사용자와 대화한다. Agent는 Catalog를 검색해 적합한 플러그인 또는 Pack을 추천하고, 없으면 새 플러그인을 설계·제작할 수 있다.

## 기본 원칙

- Core는 특정 회사 조직, 개발 분야, Room/Task 흐름, 사람 권한, Memory 전략을 강제하지 않는다.
- 게임, 앱, 웹, 플러그인 개발 방식은 Pack 또는 플러그인으로 제공한다.
- Marketplace Catalog는 `Settings > Plugins`에 위치한다. Catalog 검색 자체는 읽기 전용이다.
- 설치·활성화·업데이트·제거는 Core의 플러그인 lifecycle을 통해 기록된다. Agent가 어떤 lifecycle 도구를 사용할지는 대화 맥락을 바탕으로 Agent가 판단한다. 추천 결과 선택은 시스템의 자동 행동이 아니다.
- 협업이 필요해지면 Access Control, Workplane, Memory, Connector 같은 플러그인을 원하는 조합으로 추가한다.

## 제품 상태

| 범위 | 상태 |
| --- | --- |
| Desktop Owner Host, Agent registry, Node/Runner, 실행 기록 | 구현·검증 진행 중 |
| 플러그인 manifest, 상태, worker, UI slot, Registry 검사 | 구현되어 있으나 SPS SDK로 정리 중 |
| Plugin Discovery & Builder 기본 회사 경험 | 목표 |
| 권한을 제공하는 Access Control 플러그인 | 목표 |
| 게임·앱·웹 Pack | 목표 |
| 공개 커뮤니티 Marketplace, 판매·정산 | 제품 방향만 정의, 출시 범위 아님 |

## 출시 범위 밖

- 특정 AI 제공자나 특정 모델의 강제
- Core에 게임 제작·웹 제작·앱 제작 조직도를 고정하는 일
- 플러그인 자동 설치 또는 추천 결과에 따른 암묵적 활성화
- 공개 플러그인 판매, 결제, 세금, 환불, 게시자 평점
