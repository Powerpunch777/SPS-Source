# Builder CTO별 독립 기억

2026-11-02. 별도 Builder v15 2B.2/2G.2에 따라 CTO private memory를 추가했다.
이번 변경은 Builder의 업무 데이터·도구이며 Core/SDK/migration/릴리스 변경은 없다.

## 범위

기억은 Workspace/project/CTO별 불변 CAS journal을 재사용한다. 현재 배정의 독립 CTO
세션, 정확한 Core 전달 요청/활성·취소되지 않은 run, 저장된 실행 도구 정책을 확인한
경우만 읽거나 새 revision을 쓴다. 같은 Agent/계정을 쓰는 다른 CTO도 공유하지 않는다.
Lead/Worker 또는 일반 UI data provider가 private memory를 자동 읽는 경로는 없다.

새 해석은 현재 CTO에게 전달된 명세의 requestId와 서버 계산 digest를 인용하며, 임의
요청이나 다른 CTO 자료를 출처로 주장할 수 없다. 기존 노트를 수정 없이 승계할 때만
이전 출처를 유지한다. 노트는 모델 해석이지 승인·독립 검증·업무 완료나 최신 명세가 아니다.
이력과 provenance를 보관하지만 모든 임의 텍스트의 비밀을 탐지하는 DLP는 아니다.

과거 두 도구 CTO intent의 정책은 그대로 보존한다. 새 전달만 private memory 조회/
저장을 더한 네 도구 목록을 고정한다. 이전 prepared를 재개할 때 정책을 확대하거나 새
ID로 재전송하지 않는다. CLI 추가 승인 설정은 바꾸지 않았으며 사용자 결정 전이다.

## 검사

Node24.22.1의 격리 Builder 타입/빌드/전체 **357/357**, 공개 SDK CLI validate/test가
통과했다. 초기 타입 검사에서 새 테스트의 string literal 오류가 한 곳 발생했고 수정 후
전체를 다시 실행했다. 기존 DEV의 구 SDK node_modules를 현재 pin의 증거로 쓰거나
변경하지 않고, 깨끗한 공개 SDK 고정 SHA로 임시 복사본을 검사했다.

두 CTO/Workspace/project/Lead/세션/run의 접근 분리, 취소/종료/퇴직, CAS 충돌, 응답
유실, 정확한 이전 노트 복원과 출처 승계, 새 profile/과거 policy 보존을 검사한다. 빌드된
Worker JSONL fake Host는 실제 공개 SDK getRequest/getRun/CAS wire로 조회·저장·
재조회를 왕복하며 Lead 접근·일반 private data provider 조회를 거부한다. 새로운 provider
전송/세션 생성은 호출하지 않는다. 모델 실행이나 실제 Core DB의 증거로 사용하지 않는다.

Luna high의 독립 domain/store·도구 등록 작업을 부모가 통합하고, 별도 read-only 검수로
정책 보존/권한 경계를 확인했다. CAS와 실행 취소의 다중 키 원자성은 보장하지 않으며,
저장 후 권한 변경으로 오류가 나도 이미 publish된 head를 rollback했다고 주장하지 않는다.

별도 AI 없는 source Desktop 앱 검사는 exit0이다. mock Identity와 실제 UI bridge/state/
권한/재시작, 미지원 요청의 Run0건·입력 보존을 확인하고 화면 캡처도 검토했다. 메모리의
실제 모델 사용을 증명하는 시험은 아니다. Main4/4 정상 종료, 출력8개 종료/실패0와
임시 데이터 제거를 확인했다. 기존 로컬 복구 harness는 새 Native LAN 실증이 아니다.
이번 실제 CTO AI 시험은 실행하지 않았고,
이전 Lead 시험은 MCP 도구 취소 처리로 CTO 시작 전 실패했다. 그 결과를 덮거나 재전송하지
않았다. DEV/설치본/계정·데이터/기존 Tailscale은 보존한다. Marketplace·Preview·자체
LAN은 계속 보류하며 CTO 질문 intake, Worker/QA/Task Packet, Runner·납품은 남아 있다.

## 소스 식별

- Builder: `abefb1700a7515f0048e5c13466d2e2ea95ddead`, `codex/builder-foundation`, push 완료.
- Core clean: `a57f4d9ab0025b98ce4c7f9f5f6bf7db7060f136`.
- SDK clean: `c69915a518f0eb600f0ace8238144059911f8d04`.
- 최종357개+앱 시험 사본 지문: `ebb848c9466b648614c66ca7dcb71b8366abb5d61ea2f57199b7b1230ab021c9`.
- manifest: `fb9a6223abd4ffe337ee6ed26a80a809ea99dbb7ec554601cd5d30fdae2b4c78`.
- Worker: `0ed4681b58aa0833f235c8f9bb59eb0ec6ce52a1eaabb70e15b8033727bd6c86`.
- SDK CLI UI 집계: `2a5471fcd2a303ab468356416c41aea7f266a571ec97a78c341a71ef67be2d6c`.
- 실제 Host UI index: `3373eee9c523cf5f6c0e3ad2b964c87fc8200df3bbe87e7da34e0c3c09706e59`.

문서 후속 수정이 포함된 HEAD와 시험 사본 지문은 동일하다고 주장하지 않는다.
원시 로그/계정/실제 Workspace 식별자/비공개 소스는 공개 Builder에 올리지 않는다.
Source Desktop에서 Node24/PATH24/npm_execpath/절대 SPS_BUILDER_SOURCE_ROOT로
`node scripts/smoke-builder-conditional-state-isolated.mjs`를 실행한다. live opt-in은 없다.

[Builder 구현 문서](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/codex/builder-foundation/docs/implementation/CTO-PRIVATE-MEMORY-2026-11-02.md),
[MCP 공식 도구 계약](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)을 참고했다.
비공개 Core나 외부 코드를 공개 레포에 복사하지 않았다.
