# CTO Workstream 전달 연결과 실제 시험

2026-11-02. 첫 목표는 별도 Builder v15/UI v9 완성이다. 이번 단계는 Builder 업무
도구와 source-test operator만 추가하며, Core 전체 완성이나 Stable 증거가 아니다.

## 구현 경계

Builder가 이미 저장한 정확한 명세를 등록된 독립 CTO 세션으로 전달한다. 기존 Core의
keyed session admission/getRequest/getRun/cancel과 Workspace state CAS를 재사용한다.
새 scheduler, DB migration, 업무 역할이나 CTO 기억을 Core에 추가하지 않았다.
한 Graph 노드의 책임 CTO는 한 명이며 Worker 분배·QA·납품은 별도 후속 범위다.

결정적 요청 ID와 불변 delivery journal로 중복 요청/유실 응답을 조회한다. Core 전송
호출 뒤의 불확실성은 자동 재송신하지 않는다. 호출 전임을 확실히 아는 경우만 현재
Lead 권한과 이번 호출의 정확한 dispatch marker를 확인해 미송신으로 폐기한다.
다른 head나 권한 회수에 대해 추측해서 정리하지 않는다. 취소 요청과 실제 종료 확인,
provider 종료와 업무 완료, CTO 준비도 보고와 독립 검증을 구분한다.

`--live-workstreams`는 현재 CLI 계정의 계획 도구 시험을 위한 명시적 운영자 opt-in이다.
설계 초안/내부 기준/기술 명세/등록된 CTO 전달 순서를 준비하지만, 명령·코드·Worker·
QA 실행, 설치본 사용, 다른 provider/API 키, 다른 live scope 혼합은 허용하지 않는다.
원래 DEV 의존성을 바꾸지 않고 임시 Builder와 고정 공개 SDK 사본으로 검사한다.

## 자동 검사

- Node24.22.1 격리 Builder 타입/빌드/전체 **330/330**, SDK CLI validate/test 통과.
- CTO service15개: stable identity, 응답 유실, 미송신 복구/폐기, 명세/CTO 변경, 다른
  Workspace/project, 취소/종료, 과대 응답과 CAS 경합. fake Host이며 실제 AI가 아니다.
- Source operator guard2개 통과. 누락/혼합/설치본/provider 치환은 fixture/계정 사용 전에
  거부한다. 기존 live mode도 새로운 Workstreams opt-in과 섞이지 않게 검사했다.
- 별도 Luna 검수에서 구 root node_modules에 근거한 SDK 불일치 지적을 현재 package/lock
  pin과 격리 방식으로 재확인해 정정했다. 실제 stale DEV 의존성은 보존했다. 검수 중 발견한
  전송 전 소스 변경의 영구 uncertain 문제는 exact-marker 미송신 폐기로 수정/재검사했다.

## 실제 시험 결과

사용자가 허용한 범위로 격리 source Desktop/Host + 실제 기본 Codex CLI 계정을 실행했다.
기본 no-AI 앱 검사 뒤 첫 Lead run은 기술적으로 succeeded였지만, 설계 도구 조회4건이
`user cancelled MCP tool call`로 실패했다. 사람이 직접 취소했다는 근거는 아니다.
Lead는 초안 미작성/미검증을 답했고 전체 시험은 exit1로 실패 처리됐다.

설계 기준·기술/Workstream 저장, CTO 모델 실행/수신은 시작되지 않았다. MCP 자동 승인을
새로 적용하거나 새 요청 ID로 다시 시도하지 않았다. 허용된 계획 도구의 추가 CLI 승인
정책은 사용자에게 확인 중이다. Provider succeeded만으로 업무 성공을 선언하지 않는다.

시험 Main3/3 정상 종료, 출력6개 종료/실패0, 내부 임시 데이터 제거를 확인했다. 진단용
외부 Builder 복사본과 원시 로그는 로컬에만 남겼다. 별도 no-AI source 앱 재검사는
exit0이다. mock Identity와 실제 UI/state/권한/재시작, 미지원 전송의 Run0건과 입력
보존을 확인했다. 문서 표시 fixture는 실제 AI 자료가 아니다. Main4/4 정상 종료, 출력8개
종료/실패0, 내부/외부 임시 데이터 제거와 캡처 검토를 확인했다. 공통 harness의 기존
로컬 복구 점검은 새 Native LAN 시험이 아니다. 기존 DEV/설치본/계정/데이터는 보존했다.

## 식별과 남은 범위

- Builder: `6bd6ccda7e18bc6d76867984cf9cbf440cd21f10`, `codex/builder-foundation`, push 완료.
- Core: `a57f4d9ab0025b98ce4c7f9f5f6bf7db7060f136` clean.
- SDK: `c69915a518f0eb600f0ace8238144059911f8d04` clean. 새 tag/publish 없음.
- 실패한 live 복사본 source: `046f66cb7fc12f69ef3cad89caae609012842aebe75b302ce2c0d760d3fc13ec`.
- Worker: `41f05253a4ae8f4e81890201d5c36c7c387472139290b01c232635a41785c023`.
- manifest: `7233a6a72bed085414f668215fa6ee6b6068944c3a8cb095ef101b2c86eaea16`.
- SDK CLI UI 집계: `03e22db0357490d4ed311c7afabf568b4f453e8087b5e01774409aea77e950b6`.
- 성공한 no-AI 복사본 source: `d9481cc0338c842d520ba8b435913008636408992e39562190b21ebf0fa328f9`.
- 실제 Host UI index: `95b5facb82a52ce459f0eb48ca77106e2dd580ea86b3d279ec99c2ba59963f97`.

문서를 나중에 고친 HEAD를 위 복사본 지문과 동일하게 주장하지 않는다. release matrix와
Source gitlink를 자동 승격하지 않았고 실제 OAuth/설치본/서명/두 PC 검증도 하지 않았다.
Marketplace·Preview·자체 LAN은 계속 보류다. CTO memory/questions, Worker/QA·Task
Packet·GitHub/Runner·납품과 전체 v15 AC는 미완료다. 다중 키의 최종 재검사와 Core
admission 사이를 원자적 transaction이나 OS 인증 경계라고 주장하지 않는다.

[Builder 구현 기록](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/codex/builder-foundation/docs/implementation/CTO-WORKSTREAM-DELIVERY-2026-11-02.md),
[공식 MCP Tools 계약](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)을 참고했다.
외부 코드·비공개 Core·비밀·사용자 원문을 공개 Builder에 복사하지 않았다.
