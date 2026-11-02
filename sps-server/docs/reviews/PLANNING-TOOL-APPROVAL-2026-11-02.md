# 허용된 설계 도구의 CLI 확인 처리

2026-11-02 사용자 확정: **허용된 설계 도구는 매번 CLI 확인 없이 실행**한다. 목록 밖
도구·명령·파일 작업의 차단은 유지한다. CTO 질문 중 사용자 결정이 필요한 부분만
미결정사항에 올리는 업무 흐름과는 별개의 실행 설정이다.

## 변경과 검사

Core `6b74d808516e29dc389f784c49e32a4d31d2be71` / `codex/windows-dev-bootstrap` push 완료.
명시적인 `plugin-tools-only-v1` 정책과 정확한 `sps-plugin-session` stdio bridge를
검증한 실행에서만 아래 두 MCP 도구의 개별 approval mode를 approve로 지정했다.

- `list_plugin_tools`
- `execute_plugin_tool`

이것은 모든 도구를 노출하거나 실행하는 설정이 아니다. Core의 실제 run별 도구 허용 목록,
현재 등록 도구와 Workspace 권한, 취소/정책 변경 재검사를 유지한다. Builder는 이 공통
기술 계약에 설계 도구만 지정한다. Core에 Lead/CTO 업무 규칙이나 도구명 목록을 넣지
않았다. 일반 실행이나 사용자 전역 설정 파일은 변경하지 않는다.

기존 readonly, ignore-user-config/rules, shell/앱/브라우저/내장 코드 도구 차단, 외부
실행 대상·추가 인자 거부와 unsafe flag false를 유지한다. 이 도구 허용 목록이 임의
플러그인의 무해함이나 OS 격리 인증을 뜻하지 않는다. SDK/API/저장 schema 변경은 없다.

Node24.22.1에서 adapter 정책/외부 도구 인자/실제 plugin route 허용 목록/session 정책
회귀 **55/55**, adapter `typecheck` 통과. 초기 타입 검사의 테스트 extraArgs unknown
오류는 수정 후 재통과했다. 일반 context에 승인 override가 붙지 않고 두 bridge 도구
외의 approval mode가 생성되지 않는지 검사했다. 전체 Core 검사를 통과했다는 뜻은 아니다.

[공식 Codex 설정](https://developers.openai.com/codex/config-reference)의 서버별
enabled_tools와 개별 tools approval_mode, [공식 MCP 예제](https://developers.openai.com/plugins/build/plugins)의
approve 사용을 확인했다. 계정/모델/전역 승인·샌드박스를 바꾸는 방식은 사용하지 않았다.

## 실제 시험 결과

Builder 회신 구현은 `fe5468efb499054fe1383b45c338ffb4ee6933b8`, 시험 로그 명칭과 후속
기록은 `ee79304182161feb3fe1cebb5081d88ccea9ef4a`에 push했다. 실제 trial 사본 source
지문은 `d5a1e4ac59bd238ae3383f7f5a05b107a62b82126c2dfcab162562977e4314d2`다.

격리 source 앱에서 기존 `--live-workstreams` 시험을 실제 실행했다. 현재 기본 Codex CLI
계정, 명시적 live opt-in 두 개를 사용했고 임시 Workspace의 계획 도구만 허용했다.
Builder423/423·타입/빌드·SDK CLI validate/test와 공통 앱 검사/재시작 뒤 첫 Lead가
`running → failed / provider_quota`로 끝났다. 자동 재시도·새 요청·계정/모델 전환은 없다.
이 결과는 승인 설정이 실제 도구 호출에서 동작했다거나 CTO 수신이 성공했다는 증거가 아니다.
이전 no-AI 앱 통과를 새 Core의 전체 실제 시험 완료로 재사용하지 않는다.

실패 후 Main3/3 정상 종료, 출력6개 종료/실패0, 내부 임시 데이터 제거를 확인했다.
종료 중 closeRequestFailed 플래그는 true였으나 실제 종료는 확인됐고 강제 종료 요청은
false였다. 외부 진단 사본은 보존했다. DEV PID48300과 시작 시각·설치본·로그인·데이터·
의존성·Tailscale은 보존했다. 원시 로그/실제 식별자/사설 소스는 공개 Builder에 올리지 않았다.

재현은 Source Desktop에서 Node24/PATH24/npm_execpath/절대 SPS_BUILDER_SOURCE_ROOT와
`SPS_BUILDER_LIVE_CODEX=1`, `SPS_BUILDER_LIVE_WORKSTREAMS=1`을 지정한
`node scripts/smoke-builder-conditional-state-isolated.mjs --live-workstreams`다.
실제 계정 사용량을 소모하므로 한도 회복을 확인한 뒤 같은 범위로 시험한다. 실패한 요청을
재송신하는 복구로 해석하지 않는다. 테스트 사본은 별도 신규 임시 Workspace다.

## 다음

실제 Lead·CTO 명세 수신과 CTO 질문/Lead 검토/CTO 회신은 아직 모델 증거가 없다.
사용자 답변의 질문 ID·공유 기억·설계 Revision/Workstream 연결과 나머지 전체 Builder
요구는 계속 진행한다. 한도 때문에 가능한 코드/자동 검사 작업을 멈추거나 목표를 축소하지
않는다. Marketplace·Preview·새 Native LAN은 계속 보류한다.
