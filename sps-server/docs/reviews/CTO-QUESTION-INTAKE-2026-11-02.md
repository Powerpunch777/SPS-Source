# CTO 질문 접수와 사용자 결정 목록

2026-11-02. 최신 사용자 결정은 **작업 중 CTO 질문 → Lead 검토 → 사용자 결정이 필요한
것만 미결정사항에 표시**다. 일반 메인 Lead/고객 상담의 설계 질문을 이 목록에 섞지 않는다.
이 경계를 별도 Builder v15와 완료 계획에 날짜를 붙여 반영했다.

## 현재 구현

CTO는 자신의 정확한 Core 전달 요청·활성/미취소 run과 독립 세션, 현재 Workstream
digest/소유 노드/실행 허용 목록을 확인한 뒤 질문을 내부 접수한다. 불변 proposal에는
모호성, 대안과 장단점, 권고, 지연 영향, 실제 reporter/request/명세 출처를 연결한다.
CTO는 자기 질문 한 건과 보드 revision만 읽고 다른 CTO 질문이나 기억을 받지 않는다.

기존 CAS journal을 재사용하며 동시 접수/응답 유실을 자동 쓰기나 새 실행으로 반복하지
않는다. Lead의 검토는 준비된 `cto-inbox` 세션과 활성 run만 수행한다. 기존 명세 해결/
위임 범위 선택/사용자 결정 필요의 의미 판단은 AI의 책임이다. 코드의 필터는 이미 저장된
검토 분류를 읽을 뿐 키워드로 사용자의 판단 필요성을 대신 결정하지 않는다.

검토는 실제 고정 설계/기술/명세 ID를 인용하지만 그 해석이 맞다는 독립 검증은 아니다.
오래된 명세/다른 배정에 대한 질문을 최신 명세의 결정으로 바꾸지 않는다. 현재 정확한
Workstream이 유지되고 `user-decision-needed`인 항목만 사용자 UI provider로 보낸다.
미검토/내부 해결은 제외하며 조회 오류도 단순 질문 없음으로 숨기지 않는다.

일반 초안 질문은 메인 초안/설계 문서에 남고 표시 이름을 '설계 질문'으로 구분했다.
기존 저장 자료·답변 이력과 legacy backend 계약은 삭제하지 않는다. 새 CTO 질문의
사용자 답변 연결은 미완성이므로 입력과 전송을 막고 읽기 전용이라고 표시한다.
이를 일반 decisions 대화로 잘못 보내거나 가짜 답변/설계 개정/CTO 수신을 만들지 않는다.

Core/SDK/DB/릴리스는 바꾸지 않았다. 공유 CTO 계획 권한 검사를 메모리/질문에서
재사용하며, 과거2/4도구 intent는 보존하고 새 전달만6도구를 고정한다. 옛 활성 run이
자기 기억을 옛 출처로 정리할 수 있는 경계는 유지하되 신규 명세 수신/질문 권한으로
확대하지 않는다. v15의 CTO 자율 재계획을 모든 개정의 자동 중단 정책으로 바꾸지 않았다.

## 검증

Node24.22.1 격리 타입/빌드/전체 **383/383**, SDK CLI validate/test 통과. 새 질문
서비스11개, 도메인/표시/정책과 기존 기억/수신/질문 해석 회귀를 포함한다. fake Host가
실제 모델 판단·Core DB·Lead 자동 전달을 증명하지는 않는다.

첫 source 앱 시험은 미결정사항 화면에서 메인 전용 새로고침 버튼을 찾는 스크립트
오류로 실패했다. Main2/2 정상 종료와 출력4개 종료/실패0, 내부 임시 데이터 제거를
확인했고 진단 복사본은 보존했다. 실제 화면 이동 경로로 고친 두 번째 시험은 CTO 표시
검사를 통과한 뒤 일반 초안의 질문 수를 즉시 조회하는 assertion에서 실패했다. Main2/2,
출력4개 정상 종료와 내부 임시 데이터 제거를 확인했다. 일반 초안 표시 이름을 '설계 질문'
으로 구분하고 새로고침 완료 뒤 정확히1개를 기다리는 strict 검사로 재검사했다.

마지막 재검사는383개·타입/빌드·SDK CLI와 no-AI source 앱까지 exit0이다. 실제 UI
bridge에서 일반 질문과 목록의 분리, 미검토/내부 해결 제외, 사용자 결정 필요1건 표시,
CTO 권고와 Lead 추천 구분, 읽기 전용 입력/전송과 action0건을 확인했다. 표시 자료는
명시적인 DTO fixture이며 실제 AI가 저장한 질문이 아니다. 제거 후 실제 provider는
null이다. 캡처를 검토했고 Main4/4 정상 종료·출력8개 종료/실패0·임시 데이터 제거를
확인했다. 기존 로컬 복구 harness는 새 Native LAN 실증이 아니다.

실제 AI는 다시 실행하지 않았다. CLI 추가 승인 정책은 사용자에게 설명한 뒤 미결정인
상태이며 무단 자동 승인 변경은 없다. DEV/설치본/계정/데이터·Tailscale은 보존한다.

## 식별과 남은 범위

- Builder: `1cd2e62da39fad354e7c59bea572f921af929ebb`, `codex/builder-foundation`, push 완료.
- Core: `a57f4d9ab0025b98ce4c7f9f5f6bf7db7060f136` clean.
- SDK: `c69915a518f0eb600f0ace8238144059911f8d04` clean.
- 마지막 재검사 source 지문: `07111e392dbf60af1cd19116155145672ccaff14c6dafb54de02f144eeb1e7e7`.
- manifest: `3507349595e5060e1b3fcbea61c9ba60ec9b3a4db4aa36bf49bbc2f2dec98846`.
- Worker: `da50758214495e6b31b7246a177f934aade44296c60737c70a194692a379782d`.
- SDK CLI UI 집계: `5795d7adf1ee26eed56a36e5fff33a8529bcaf47014fbed202e8991df6a551f5`.
- 실제 Host UI index: `6c6daa7a447197d2031f9b0d8c884dbdc4922aa15ac03a9f741f5d32a2cc23ac`.

이후 문서 수정까지 시험 사본과 같은 source 지문이라고 주장하지 않는다. 원시 로그나
계정/실제 Workspace/경로·비공개 소스는 공개 Builder에 올리지 않는다. 재현은 Source
Desktop에서 Node24/PATH24/npm_execpath/절대 SPS_BUILDER_SOURCE_ROOT로
`node scripts/smoke-builder-conditional-state-isolated.mjs` 실행, live opt-in 없음이다.

CTO 질문으로 내부 Lead를 자동 호출하기, Lead 직접 해결의 CTO 회신, 사용자 답변의
공유 기억/설계 Revision/Workstream 재전달·수신 연결은 후속이다. 이 단계로 전체
Builder 완료/실제 CTO 실행/OS 격리/설치본·서명·Stable 자격을 선언하지 않는다.
Worker/QA/Task Packet/Runner·납품은 계속 남아 있으며 Marketplace·Preview·자체
LAN은 보류다. [Builder 구현 기록](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/codex/builder-foundation/docs/implementation/CTO-QUESTION-INTAKE-2026-11-02.md),
[MCP 공식 도구 계약](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)을
참고했다. 외부 코드나 비공개 Core를 공개 Builder에 복사하지 않았다.
