# Builder 내부 설계 기준 검증

기록일 2026-11-02. Builder 전용 업무 기능이며 Core의 역할/승인 모델을 추가하지 않았다.
Builder 구현/기록 revision은 `e7dac3b`이며 상세 내용은 별도 공개 Builder 레포의
[기록](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/e7dac3b/docs/implementation/DESIGN-BASELINE-2026-11-02.md)을 따른다.

## 범위

현재 준비된 Lead의 실제 사용자 Run/세션 입력을 근거로 현재 초안의 명세와 Graph를
불변 기준 하나에 저장한다. 해석은 AI가 하며 문장 탐지 하드코딩은 없다. 기존 공개 SDK
CAS journal을 재사용한다. Core API/DB migration은 없고 Core/SDK revision은
각각 `55b5d5b` / `316c56f`로 유지했다. 읽기 전용 문서와 solution 조회를 연결했다.

내부 설계 기록이지 법적 서명이나 코드 실행 권한이 아니다. 초안/Lead 선택/기준은
다중 키 transaction이 아니며, CAS 도중 Lead가 교체되면 저장 후 오류가 반환될 수 있다.
기록을 삭제/재시도하지 않고 재조회한다. 이 한계는 미해결이며 이후 실행은 현행 권한을
따로 검증해야 한다. 현재 기록을 실행 capability로 사용하지 않는다.

## 검증

- Node24.22.1 격리 타입/빌드/전체244개/SDK CLI 후 실제 no-AI source 앱 exit0.
- 문서 표시 fixture를 검사하고 제거한 뒤 실제 Host 기준 값 null을 확인했다.
  이것은 실제 AI 저장 근거가 아니다. Main4/4·출력8개 정상 종료/실패0·임시 데이터 제거.
- 후속 동시 권한 변경 회귀 1개를 추가한 전체245/245·타입/빌드/SDK CLI exit0.
- Source operator 73개 부정 opt-in 사례와 7가지 실행 요약 분기 검사, 2/2 exit0.
  새 baseline 모드가 liveAi:false로 표시될 수 있던 누락을 수정했다.
- `--live-baseline`은 CODEX/BASELINE 두 명시 opt-in과 별도 사용자 동의가 필요한
  준비된 시험이다. 이 기록 시점에는 실행하지 않았다. 기존 CTO 시험 동의로 대체하지 않는다.

no-AI 앱 지문 `fbf4c5eec4c8c1ddef159f1e189eb2e2d4d3fd2ade13c2f7acc4e0962f9825f8`,
후속245개 검사 지문 `4fdf128c2aabea1c36b11daffe2a8bc119bc02955537f8dcf1bebb13ea18c883`.
공통 Worker SHA `eb6310a6811b87f4e54e21cae84c1d0724b67aed7d59e4b23efca5e2cf4b9616`.
원시 로그/캡처는 로컬에만 보관하고 문서 포함 HEAD를 시험 지문과 동일시하지 않는다.

## 미완료

실제 기준 저장 시험, 기술 선정 Register/Workstream, CTO 업무와 기억/질문 intake,
Worker/QA·Task Packet·GitHub/Runner 근거·납품은 남아 있다. Core/Builder 전체 완료나
일반 Agent 기본 도구 승인·실제 Google OAuth·설치본·두 PC·서명·Stable 검증이 아니다.
기존 사용자 DEV/설치본/계정/데이터와 Tailscale을 유지한다. Marketplace·Preview·자체 LAN은 보류다.
