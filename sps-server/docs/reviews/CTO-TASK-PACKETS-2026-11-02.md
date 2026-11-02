# 장기 자율 CTO와 Task Packet 기반

2026-11-02. 사용자는 Lead에게 반복해서 "계속해"라고 말하지 않아도 명세를 받은 CTO가
Worker 생성·배정·검수·QA·수정을 완료까지 이어가기를 원한다. 이는 상주 모델이나
무한 CLI 루프가 아니라 저장된 목표와 기존 이벤트/실행 경로를 통한 재개다. 최신 v15
2G.6과 Builder 완료 계획에 이를 명문화했다. 이 문서로 자율 실행 완료를 선언하지 않는다.

## 이번 구현

Builder `8ec2092902b1ab92c54b505f45e6929b35e4fbeb` / `codex/builder-foundation` push 완료.
Lead는 Workstream 명세·범위·인수 기준을 정하고, CTO는 자기 범위를 Worker/QA용
Task Packet으로 세분화한다. 새 read/publish 도구는 정확한 Core-bound CTO의 현재
전달 명세와 활성·미취소 run에 묶였다. 다른 CTO/Lead/Workspace·퇴직·구판 실행은 거부한다.

- 작업 지시서에 목표/범위/제약/요구사항/선행 작업/인수 기준/증거/재사용 근거를 저장한다.
  QA에는 CTO Test Plan을 요구한다. 저장은 실제 조사·라이선스·호환성 검증이 아니다.
- 기존 scoped state/CAS 불변 journal을 재사용하고 충돌/응답 유실을 보존한다. URL을
  저장할 뿐 네트워크 호출·다운로드·Worker 생성·명령·파일·QA 실행을 하지 않는다.
- 의존성은 정확한 Task revision과 canonical record SHA-256으로 고정한다. 선행 작업이
  바뀌어도 종속 지시서 출처를 바꾸지 않고 조회에서 dependencies changed로 구분한다.
- 구판 명세의 계획은 historical로 표시한다. CAS 직후 명세 변경으로 호출이 실패해도
  저장 이력이 남을 수 있음을 인정한다. 미래 실행 경로도 다시 권한/명세/pin을 검사해야 한다.
- 기존2/4/6도구 CTO intent는 보존하고 새 intent만8도구로 저장한다. 과거 정책을 확장하거나
  같은 requestId를 새 정책으로 재송신하지 않는다. Core/SDK의 업무 모델은 바꾸지 않았다.

## 검증

Node24.22.1 격리 타입/빌드, 전체449/449, SDK CLI validate/test 통과. Task Packet
domain10개·서비스10개와 정책/manifest 회귀를 포함한다. compiled Worker JSONL fake Host
왕복으로 도구 조회/게시·정확한 출처·권한 거부를 확인했다. 이는 실제 AI나 실제 Core DB에서
CTO가 작업 지시서를 작성했다는 증거가 아니다.

초기 fixture 타입 오류, 구판 root dist의 미등록/타임아웃, pin 추가 후 active run 보호와
새 조회 DTO를 반영하지 않은 테스트 실패는 수정 뒤 재검사했다. running CTO를 강제로
덮는 식으로 보호를 완화하지 않았다. 과거446개 통과를 pin 보강 후 코드에 재사용하지
않고 최종449개를 새로 실행했다. 상세 시점은 Builder 구현 기록에 구분했다.

마지막 no-AI source Desktop 앱도 exit0이다. mock Identity/실제 Host/UI bridge로 기존
권한·상태·Workspace 분리·재시작·질문 필터/읽기 전용 표시를 확인하고 캡처를 검토했다.
표시 질문은 명시적 DTO fixture다. Main4/4 정상 종료, 출력8개 종료/실패0 및 내부 임시
데이터 제거를 확인했다. 기존 로컬 복구 harness는 새 Native LAN 검증이 아니다.

| 최종 시험 사본 | SHA-256 |
| --- | --- |
| source | `15a43f10192d85a41490abf7623ca4cebc9f33ab12e36bb25cb994a8bac9839a` |
| manifest | `5c54ac9cc9fb0f25b98aec14eeb5f87a61c6ea7d9b828543f8de514d613863ad` |
| Worker | `5d513159194cdfb4f944a4e6bcdab9a0e284a472d6bdf3d4c355721c8045f1ab` |
| SDK CLI UI 집계 | `49e2fc6c143e5f605c0ea328716a28c2fffcca9cbd25784ac5a2abd145a4933f` |
| 실제 Host UI index | `4974fa46d56889756d2835f0060e0a96744939bbac3012f31d1fa452c1736a0e` |

문서 후속 기록까지 시험 사본과 같은 source 지문이라고 주장하지 않는다. Core는
`6b74d808516e29dc389f784c49e32a4d31d2be71`, SDK는
`c69915a518f0eb600f0ace8238144059911f8d04` clean source이며 이번에 수정하지 않았다.
Source Desktop에서 Node24/PATH24/npm_execpath/절대 SPS_BUILDER_SOURCE_ROOT를 지정한
`node scripts/smoke-builder-conditional-state-isolated.mjs`로 재현한다. live opt-in은 없다.
원시 로그·실제 식별자·사설 소스는 공개 Builder에 올리지 않았다.

## 남은 자율 실행

실제 Codex native Worker 생성·독립 권한/세션·Task Packet 전달·결과/취소·재시작 복구는
아직 미검증이다. 기존 Core 이벤트/실행 조회·저장 경로로 Worker 종료와 CTO의 다음
실행을 연결하고, 명시적 중지·불확실한 전송·질문 대기/무관 작업 계속을 검증해야 한다.
새 Task Packet 저장으로 자동 루프나 전체 장기 목표 기능을 완성했다고 표시하지 않는다.

이전 provider_quota 실패 후 실제 AI를 재시도하지 않았다. 계정/모델/한도 우회도 없다.
DEV 의존성·설치본·실제 데이터·Tailscale은 변경하지 않았다. 예전 DEV PID48300이 현재
존재하지 않는 것은 관측했으며 원인을 추측하거나 실행 중이라고 표시하지 않았다. 다른
Electron 프로세스는 종료하지 않았다. 사용자 환경과 시험 앱을 혼동하지 않는다.

사용자 질문 답변의 공유 기억·설계 Revision·Workstream 연결, Worker/QA·실제 GitHub/
Runner 증거·Graph 실행 상태·납품 및 나머지 v15는 계속 남는다. 보류된 Marketplace·
Preview·새 Native LAN을 선행 조건으로 되살리지 않고, 보호가 입증되지 않은 생성 코드를
자동 실행하지 않는다. 전체 AC/실기기/OS 격리/서명/Stable 완료로 확대하지 않는다.

[Builder 구현 기록](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/8ec2092902b1ab92c54b505f45e6929b35e4fbeb/docs/implementation/CTO-TASK-PACKETS-2026-11-02.md),
[MCP 도구 계약](https://modelcontextprotocol.io/specification/2025-06-18/server/tools),
[SQLite transaction 설명](https://www.sqlite.org/lang_transaction.html)을 참고했다. 기존
Core CAS를 재사용했으며 새 DB/스케줄러/큐를 도입하지 않았다.
