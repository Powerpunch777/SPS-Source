# SPS 문서 체계 감사와 마이그레이션

## 문서 지위

- 감사일: 2026-07-23
- 대상: 저장소 루트 README, `sps-server`의 설계·운영·배포·구현 기록, 주요 플러그인 README
- 목적: 제품 정의와 구현 상태가 문서마다 달라지는 문제를 줄이고 현재 기준 문서를 한곳에서 찾게 한다.

## 1. 감사 결과 요약

현재 저장소에는 중요한 구현 증거가 풍부하지만 다음 문제가 있다.

1. 루트 README는 범용 협업 플랫폼을 설명하지만 `sps-server/README.md`와 초기 설계 문서는 게임 제작 도구로 한정한다.
2. 여러 문서가 `final`, `current source of truth`, `최종`을 동시에 사용한다.
3. 과거 구현 로그와 현재 제품 계약이 같은 디렉터리와 같은 중요도로 노출된다.
4. Memory가 sidecar/plugin 소유인지 Core 계약인지 문서 시대에 따라 설명이 달라진다.
5. 현재 존재하는 플러그인 구현과 앞으로 만들 Plugin Kit·Marketplace가 구분되지 않는다.
6. 파일럿, Alpha, 출시 제품, 배포 완료의 의미가 섞여 있다.
7. 라이선스와 상업 정책이 아직 미결정인데 확정된 사업 모델처럼 읽힐 수 있다.

## 2. 이번 정리의 결정

### 현재 제품 기준

`114-sps-product-and-plugin-platform-contract-ko.md`

- 로컬 중심 멀티에이전트 제작 플랫폼
- SPS Extension Profile
- Plugin Kit, Plugin Registry
- Plugin Studio
- Development Core
- 게임·앱·웹 공식 팀 플러그인
- 첫 출시 제외 항목

### 현재 구현 계획

`115-sps-plugin-kit-and-bundled-teams-implementation-plan-ko.md`

- 단계별 구현
- 테스트와 보안 기준
- 기존 플러그인 마이그레이션
- Private Beta 진입 조건

### Workplane 상세 설계

`75-optimal-work-environment-blueprint-ko.md`

- Room, Task, Workspace, Session과 UI 상세
- Agent Room·Task Room은 Core 고정 타입이 아니라 Team/Workplane 플러그인이 구성하는 경험
- 제품 전체 범위를 결정하는 문서가 아니라 Workplane 구현 청사진

### Core 경계

`113-sps-generic-agent-platform-core-contract-ko.md`

- SPS Core가 보장해야 하는 범용 Agent 플랫폼 계약
- Project·Task·Agent·Agent Session·권한·Node·이벤트를 제공하고, 특정 공식 팀 플러그인의 제품 기능과 분리

### 운영 사실

배포, Desktop, Node, OAuth, 도메인, E2E 감사 문서는 실제 환경과 명령을 설명한다. 제품 비전보다 운영 사실에 우선권이 있다.

### 역사 기록

번호가 붙은 `*-log.md`, audit, correction 문서는 당시 변경과 검증 증거로 유지한다. 새로운 제품 결정의 기준으로 사용하지 않는다.

## 3. 문서 우선순위

충돌 시 다음 순서를 사용한다.

1. 보안·데이터 손실을 막는 실제 코드와 자동 테스트
2. 현재 제품 계약 `114`
3. 현재 구현 계획 `115`
4. Core 계약 `113`
5. Workplane 청사진 `75`
6. 현재 운영·배포 가이드
7. 구현 로그와 역사 문서

코드와 문서가 충돌하면 문서를 코드에 맞추는 것으로 끝내지 않는다. 먼저 코드가 의도한 계약을 위반하는지 판단하고, 필요한 경우 코드와 문서를 같은 변경에서 수정한다.

## 4. 문서 상태 표준

모든 설계·계획 문서 상단에 다음 중 하나를 표시한다.

| 상태 | 의미 |
| --- | --- |
| Product Contract | 현재 제품 범위와 사용자 약속 |
| Implementation Contract | 구현해야 하는 구체적 동작과 완료 기준 |
| Operational Guide | 현재 운영 절차와 명령 |
| Audit | 특정 시점의 검토 결과 |
| Implementation Log | 완료한 변경과 검증 증거 |
| Historical | 보존하지만 현재 기준이 아님 |
| Proposal | 검토 중이며 확정되지 않음 |

추가 상태 필드:

- 작성일 또는 검증일
- 적용 버전/commit
- 선행·후행 문서
- 구현 상태: `planned | in_progress | implemented | verified | deprecated`

## 5. README 역할

### 루트 `README.md`

포함:

- 제품 한 문장
- 현재 단계
- 첫 출시 범위
- 핵심 구조
- 설치와 빠른 시작
- 보안 원칙
- 현재 기준 문서 링크

제외:

- 개별 CMP 실행 기록
- 장문의 구현 연혁
- 한 컴퓨터의 절대 경로와 개인 프로젝트명
- 세부 Core patch 기록

### `sps-server/README.md`

포함:

- 서버 저장소의 역할
- 현재 기준 문서 지도
- 구성 요소 지도
- 개발 검사 진입점
- 구현 로그는 역사라는 설명

제외:

- 수십 개의 개별 smoke test 결과
- 과거 특정 사용자 프로젝트 상태
- “문서 N이 모든 경우에 절대 우선” 같은 단일 숫자 기준

### 컴포넌트 README

각 컴포넌트 README는 다음을 답한다.

1. 무엇을 소유하는가
2. 무엇을 소유하지 않는가
3. 외부 계약은 무엇인가
4. 개발·테스트 방법은 무엇인가
5. 보안 경계는 무엇인가
6. 현재 알려진 제한은 무엇인가

## 6. 단계적 디렉터리 정리

첫 문서 PR에서는 링크 손상을 피하기 위해 파일을 대량 이동하지 않는다.

후속 정리 목표:

```text
sps-server/docs/
├─ product/
├─ architecture/
├─ implementation/
├─ operations/
├─ security/
├─ plugin-authoring/
└─ history/
   ├─ implementation-logs/
   └─ audits/
```

이동 순서:

1. `DOCUMENTATION.md`에 현재 위치와 미래 위치를 기록
2. 내부 링크 검사 도구 추가
3. 역사 문서 이동과 redirect 성격의 짧은 stub 추가
4. README 링크 갱신
5. 깨진 링크 검사 후 기존 위치 제거

## 7. 이름과 용어 통일

| 사용 | 피할 표현 |
| --- | --- |
| SPS | 문맥 없이 SonParkServer와 SPS를 번갈아 사용 |
| Core Product | 모든 기능을 Core라고 부르기 |
| SPS Extension Profile | 기존 Core SDK 위에서 통일하는 객체·권한·lifecycle·golden path 표준 |
| Plugin Kit | SDK, generator, testkit, CLI 전체 |
| Plugin Studio | 플러그인을 만드는 공식 플러그인 |
| Development Core | 게임·앱·웹 팀 플러그인의 공통 개발 계층 |
| Agent Room | Team/Workplane 플러그인이 Agent Session 위에 구성하는 장기 역할 대화 공간 |
| Task Room | Team/Workplane 플러그인이 Core Task 위에 구성하는 유한한 실제 작업 공간 |
| Desktop Node | 승인된 로컬 실행 노드 |
| official bundled plugin | 배포본에 포함될 수 있으나 기본 SPS에서 자동 활성화하지 않는 공식 플러그인 |
| planned | 아직 구현되지 않은 확정 범위 |
| verified | 자동 또는 실제 E2E 증거가 있는 상태 |

`SPS Game Work Plane`은 역사 문서나 게임 플러그인 문맥에서만 사용한다. 전체 제품명으로 사용하지 않는다.

## 8. 구현 상태 표현 규칙

잘못된 예:

> SPS는 Plugin Studio와 Marketplace를 제공한다.

현재 올바른 예:

> Plugin Studio와 Plugin Registry는 구현 계획 단계다. Registry는 local·GitHub·official 공유 배포의 출처·무결성·권한 검토를 먼저 제공하며, 유료 Marketplace 거래는 Registry E2E 검증 이후에 검토한다.

검증 수준:

```text
planned
→ implemented
→ locally tested
→ E2E verified
→ pilot verified
→ release verified
```

문서에서 더 높은 수준을 주장하려면 대응 로그, 테스트 또는 릴리스 링크가 있어야 한다.

## 9. 라이선스와 Marketplace 문서 규칙

현재 결정하지 않은 항목:

- Core 오픈소스 또는 source-available 여부
- 상업적 재사용 제한
- 유료 플러그인 수수료
- Marketplace 운영 주체와 결제 방식

따라서 README와 제품 계약은 다음만 말한다.

- 플러그인 표준, 직접 설치와 Registry 기반 공유 배포는 제품 범위다.
- 유료 거래는 Registry의 package·권한·lifecycle E2E 이후 검토한다.
- 라이선스는 기존 제3자 코드의 조건을 지키면서 별도 법률 검토 후 결정한다.

## 10. 후속 문서 작업

- `sps-server/README.md`를 이 문서 지도 중심으로 축소
- `sps-memory/README.md`의 “game workplane” 표현을 범용 Memory provider 표현으로 변경
- 각 플러그인에 manifest 권한 표와 소유/비소유 경계 추가
- `sps-room-chat`에 구조 README와 Worker 모듈 분해 지도를 추가
- 역사 로그의 자동 index 생성
- Markdown 내부 링크와 존재 파일 검사 CI 추가
- README에서 구현 상태를 자동 또는 반자동으로 동기화할 방법 검토

## 11. 감사 제한

이 감사는 저장소의 공개 문서 구조, README, 현재 기준으로 선언된 핵심 설계와 최근 플랫폼 문서를 중심으로 수행했다. 개별 역사 로그는 제목·상호 참조·현재 README에 인용된 상태를 기준으로 분류했으며, 모든 과거 실행 결과를 다시 재현하거나 각 로그의 기술적 사실을 재검증한 것은 아니다. 역사 로그의 증거 유효성은 관련 자동 테스트와 실제 환경 재실행으로 별도 검증해야 한다.
