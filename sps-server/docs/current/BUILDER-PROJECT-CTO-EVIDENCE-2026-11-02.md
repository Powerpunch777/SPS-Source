# Builder 프로젝트 CTO 등록 근거

Builder 구현 `8e9ee89`, 기록 `a53eb75`, Core `55b5d5b`, 공개 SDK `316c56f`.
프로젝트별 논리 CTO와 독립 세션 등록만 다룬다. CTO 업무·질문 intake·Worker/QA·
전체 Builder 완료나 Core 출시 인증은 아니다. 업무 역할은 Builder에 유지한다.

## 확인한 범위

현재 준비된 Lead가 기존 실행 Agent 설정을 재사용해 CTO를 등록한다. Core Agent/
계정은 추가하지 않고 CTO마다 별도 plugin-owned keyed session을 만든다. 생성 의도와
세션 연결은 CAS로 기록하며 응답 유실 때 같은 ID/key로 명시적으로 복구한다. 일반
set/create/list fallback이나 기존 세션 삭제 후 자동 교체는 없다. 같은 실행 Agent를
쓰더라도 CTO 세션은 Lead 도구를 사용할 수 없으며 사적 기억/대화는 자동 공유하지 않는다.

실제 사용자 허용 기본 Codex CLI 계정으로 source Desktop/Host/UI에서 Lead2회 실행,
CTO2명 등록과 첫 ID 재등록·목록 조회를 확인했다. 세션은 정확히 Lead3+CTO2=5개,
CTO 자체 실행0회다. 조직도·재시작 후 기록과 다른 Workspace 불변도 확인했다.
Main6/6·출력12개 정상 종료/실패0·임시 데이터 정리와 exit0이다. Identity는 mock이다.
코드 생성·명령/파일 편집/웹 실행, 사용자 DEV/설치본/기존 Agent 설정 변경은 없었다.

후속 전체225/225·타입/빌드·SDK CLI validate/test가 통과했다. 실제 AI 시험 시221개에
추가 부정검사4개를 더한 것이며 runtime Worker/UI bytes는 동일하다. Source opt-in
가드1개는48개 거부 사례를 검사했다. 새 CTOS 범위를 다른 시험 모드에 섞는 누락은
부정검사가 발견해 수정 후 통과했다. 가짜 Host 검사와 실제 AI 결과를 합치지 않는다.

| 근거 | SHA-256 |
| --- | --- |
| 실제 시험 fingerprint | `08e69cc68b6030058472f9ae13532c9992ebdd9c26e6a1f2ea8b24ebd19af49c` |
| 후속225개 검사 fingerprint | `89e78a2c9932e1c36af8e3a8f2868ae07a6c7e069e6b687290479a44fd96c1bb` |
| Worker | `3f13bbf05671915a9edde72a6933d8665ee700c5e799b904a2acbeed4cc4043c` |
| 실제 레지스트리 DTO | `b8ea95812b0263f5f85ad841a6fd7388e696ccd586e32a90211b718020c34062` |

전체 식별자/한계는 Builder의
[기록](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/a53eb75/docs/implementation/PROJECT-CTO-REGISTRATION-2026-11-02.md)에 있다.
원시 로그·계정·경로·캡처는 로컬에서 보관하고 공개 업로드하지 않는다.
문서 포함 HEAD를 시험 복사본 지문과 동일하다고 표시하지 않는다.

## 미완료

기술 선정/승인 명세·Workstream 배정, CTO 기억과 지시/변경 수신, 질문 상향과
내부 Lead intake, Worker/QA·Task Packet·GitHub/Runner 근거·납품은 남아 있다.
일반 Agent 기본 도구 승인 UX, 실제 Google OAuth·설치본·서명·두 PC·Stable 인증도
이번 근거가 아니다. Core/SDK API/DB migration은 추가하지 않았다. 기존 Tailscale과
사용자 DEV·설치본·계정·데이터를 유지하고 Marketplace·Preview·자체 LAN은 보류한다.
