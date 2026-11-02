# Lead 내부 해결의 CTO 회신 검증

2026-11-02. 사용자 확정 흐름은 CTO 작업 질문을 내부 Lead가 검토하고, 해결할 수 있는
질문에는 원래 CTO로 답하며 사용자 결정이 필요한 부분만 미결정사항에 올리는 것이다.
일반 고객 상담 질문은 메인 Lead에서 다룬다.

## 구현

Builder `fe5468efb499054fe1383b45c338ffb4ee6933b8` / `codex/builder-foundation` push 완료.
별도 [Builder 구현 기록](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/fe5468efb499054fe1383b45c338ffb4ee6933b8/docs/implementation/CTO-QUESTION-REPLY-2026-11-02.md)에
도구 계약, 소스/manifest/Worker/UI 해시와 재현 방법을 기록했다.

- 정확한 질문의 실제 Core-bound intake Lead run이 내부 검토를 저장한 뒤 명시적 답변을
  작성한다. 사용자 결정 필요 질문, 미검토 질문, 다른 검토 작성자/run은 답할 수 없다.
- 답변/선택지/실제 고정된 근거를 불변 journal에 저장하고 원래 CTO 세션으로 별도
  planning turn을 admission한다. 대상·명세·권한·CAS·정책 지원을 재확인한다.
- 결과 불명은 같은 request의 receipt만 관찰하고 자동 재송신하지 않는다. Lead와 CTO는
  같은 실행 안에서 서로의 응답을 기다리지 않는다. 새 CTO/세션/스케줄러를 만들지 않는다.
- CTO 회신 turn은 read/ack2도구만 허용한다. 실제 Core request/run과 등록 CTO를 확인하고
  수신 이해를 저장한다. 수신 후 provider 실패에도 확인을 보존하며 개발 완료로 세지 않는다.
- 기존9도구 intake 정책은 유지하고 새 intent만10도구로 확대한다. 일반 Lead/CTO 정책과
  과거 requestId에 새 권한을 붙이지 않는다. 사적 기억/raw provider 출력은 반환하지 않는다.

Core/SDK는 a57f4d9ab0025b98ce4c7f9f5f6bf7db7060f136 /
c69915a518f0eb600f0ace8238144059911f8d04 clean source 그대로이며 이번에 수정하지 않았다.

## 검사

Node24.22.1 격리 타입/빌드, 전체423/423, SDK CLI validate/test 통과. 새 reply domain10개,
서비스8개와 legacy intake 정책 보존 회귀를 포함한다. fake Host에서 실제 내부 저장·전달
서비스를 실행했으며 실제 AI 판단/Core를 통한 질문 회신 성공은 아니다. 초기 테스트 타입
오류는 수정 후 재검사했고 실패를 통과로 세지 않았다.

같은 사본의 no-AI source Desktop 앱도 exit0이다. 실제 Host/UI bridge와 mock Identity로
상태/권한/Workspace 분리/재시작, CTO 질문 필터·미완성 답변 입력 차단을 재검사하고
캡처를 검토했다. 질문 화면은 명시적 DTO fixture이며 실제 모델 저장이 아니다. Main4/4
정상 종료, 출력8개 종료/실패0, 내부 임시 데이터 제거를 확인했다. 기존 로컬 복구 검사는
새 Native LAN 실증이 아니다. 원시 로그·캡처·실제 식별자는 공개 Builder에 올리지 않았다.

시험 사본 source 지문은 c4e012ee1adb5e94ca31c4eef9bd62447345b4f9a742d60fa3f9c1611357888c다.
후속 문서 변경까지 같은 source 지문이라고 주장하지 않는다. 재현은 비공개 Source Desktop에서
Node24/PATH24/npm_execpath/절대 SPS_BUILDER_SOURCE_ROOT 설정 후
`node scripts/smoke-builder-conditional-state-isolated.mjs`, live opt-in 없음이다.

## 사용자 결정과 남은 일

사용자는 허용된 설계 도구만 매 호출 CLI 확인 없이 실행하도록 확정했다. 목록 밖 도구·명령·
파일 작업 차단은 유지한다. 이 설정은 CTO 질문을 사용자 결정으로 분류하는 업무와 별개다.
위 검사 시점에는 아직 MCP 자동 승인 설정을 변경하거나 실제 AI를 재실행하지 않았다.
[공식 Codex 설정](https://developers.openai.com/codex/config-reference)의 서버별 enabled_tools와
개별 도구 approval_mode를 조사했으며 사용자 전역 설정이나 전체 샌드박스 해제를 뜻하지 않는다.

다음은 이 범위의 설정 연결과 실제 CTO→Lead→CTO 검증, 사용자 답변의 질문 ID/공유 기억/
설계 Revision/Workstream 반영이다. Worker/QA/Task Packet/Runner/납품 및 전체 v15는 남아 있다.
DEV PID48300·설치본·계정·데이터·Tailscale을 보존했고 Marketplace·Preview·새 Native LAN은 보류다.
도구 허용 목록·자동 검사·앱 회귀를 OS 격리/실기기/서명/Stable 자격으로 확대하지 않는다.
