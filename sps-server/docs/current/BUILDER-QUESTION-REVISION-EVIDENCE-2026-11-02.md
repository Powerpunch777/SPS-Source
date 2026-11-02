# Builder 질문 답변 Revision 검증

구현 Builder `0ec7b5e`, 검증 문서 `3381c36`, Core `55b5d5b`, 공개 SDK `316c56f`.
제품 목표는 계속 전체 v15 Builder이며 이 기록으로 Core/Builder 완료나 AC 전체 통과를
주장하지 않는다. 업무 질문/해석/Graph는 Builder에 두고 Core/SDK API를 추가하지 않았다.

## 이번 변경

질문 답변에 프로젝트·초안 Revision·질문 ID를 저장하고 현재 준비된 decisions Lead만
실제 사용자 출처를 확인해 새 명세/Graph와 해석을 같은 불변 journal에 게시한다.
기존 CAS/세션/실행 영수증을 재사용한다. 오래된 질문·잘못된 Lead/세션·출처·승인 필드는
거부하고, 전송 완료만으로 업무 답변 완료를 만들지 않는다. 충돌/응답 유실은 읽어 확인한다.
일반 제안 도구로 해결된 질문 이력을 삭제하거나 질문 의미를 바꿀 수도 없다.

## 검증을 구분한 결과

- Node24.22.1 격리 타입/빌드/전체 **202/202**, SDK CLI validate/test 통과.
- 컴파일된 Worker JSONL의 새 도구·DTO·거부·중복 처리는 가짜 Host 검사다.
- 허용된 기본 Codex CLI 계정으로 실제 UI main 초안 작성1회, 실제 UI decisions 답변
  반영1회, 각각 실제 Host 저장과 재시작 보존을 확인했다. source Desktop/Host이며
  Identity는 mock이다. 다른 Workspace 불변, CTO 사용자 입력0, 명령/코드/파일 편집0.
- 실제 AI 이후 표시 오류를 고친 UI는 별도 no-AI source 앱에서 검증했다. 전송할 질문
  연결·저장 답변 표시는 DTO/action fixture이며 실제 AI 저장 근거와 합치지 않는다.
  미결정0·완료 이유·상세 높이 제한과 캡처를 확인했다.
- 실제 AI 시험 Main6/6·출력12개 정상 종료, 후속 no-AI Main4/4·출력8개 정상 종료,
  각각 임시 데이터 정리와 exit0이다. 두 명령 모두 사용자 DEV/의존성/설치본은 보존했다.
- Source 연산자 가드1개가 실계정 opt-in 누락/혼합 등 **30개 거부 사례**를 검사했다.
  --live-question과 CODEX=1/QUESTION=1을 함께 요구하고 API 키·다른 제공자·다른
  실계정 시험·설치 바이너리 혼합을 시작 전에 막는다. 실제 계정 사용은 기본값이 아니다.

실제 AI 시험 fingerprint는
`7f4c71daa458e392a426802c9fa0b9bcbb9c02948df63d2cf6413fa448138835`,
후속 UI 시험은 `99ce44b6406f17dc98ab15903434a2d58e917c5318451984a6b3ff5168b287b8`다.
두 시험의 Worker는
`fe314c6018c907135db289d71b973572020cbb3e0e760513c0ab9959f9d64f77`로 같지만
UI bytes는 다르다. 전체 식별자와 시행착오는 공개 Builder의
[해당 검증 문서](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/3381c36/docs/implementation/LEAD-QUESTION-REVISION-2026-11-02.md)에 있다.
문서 포함 HEAD 전체를 이전 시험 복사본의 지문으로 표시하지 않는다.

Source Desktop 폴더에서 실행한 명령:

```powershell
$env:SPS_BUILDER_SOURCE_ROOT = '<Builder checkout absolute path>'
$env:SPS_BUILDER_LIVE_CODEX = '1'
$env:SPS_BUILDER_LIVE_QUESTION = '1'
node scripts/smoke-builder-conditional-state-isolated.mjs --live-question
```

실제 AI 뒤 CODEX/QUESTION opt-in 없이 기본 연산자로 최종 UI를 검사했다.
원본 로그 `sps-builder-live-question-verified.log`, `sps-builder-question-ui-final.log`와
캡처는 로컬에 보관한다. 계정·원시 로그·사용자 경로를 공개 저장소에 올리지 않는다.

## 남은 범위

공유 기억 갱신/CTO 전파는 이번 단일 journal의 원자적 게시에 들어 있지 않다.
승인 명세·계약 승격, 영향 분석·변경 전파, 실제 CTO intake/인계, 프로젝트별 구성,
Worker/QA·Task Packet·GitHub/Runner 실행 근거·납품과 나머지 v15 요구는 남는다.
일반 Agent 기본 승인 UX, 실제 Google OAuth·설치본·서명·두 PC·Stable 증거도 아니다.
기존 공통 E2E의 legacy native-recovery 표기는 자체 LAN 개발/추가 인증을 뜻하지 않는다.
Marketplace·Preview·자체 LAN 보류와 기존 Tailscale 유지는 바뀌지 않았다.
