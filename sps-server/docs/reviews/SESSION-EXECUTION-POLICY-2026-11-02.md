# 실행별 Plugin 세션 도구 제한

2026-11-02 개발 증거. 첫 목표는 별도 Builder v15/UI v9 완성이며, 이 단계는 안전한
계획 도구 실행에 실제 필요한 좁은 Core/SDK 계약이다. Core 전체 완성, OS containment,
설치본·서명·Stable 검증이나 실제 Lead/CTO 실행 완료가 아니다.

## 정확한 소스

- Core `a57f4d9ab0025b98ce4c7f9f5f6bf7db7060f136`,
  `codex/windows-dev-bootstrap`, 원격 push 완료.
- 공개 SDK `c69915a518f0eb600f0ace8238144059911f8d04`,
  `codex/workspace-agent-session-output`, 원격 push 완료. 패키지 버전0.11.0 유지,
  새 태그/정식 발행은 하지 않았다.
- Builder는 위 SDK 전체 SHA를 package/lockfile에 고정하며 원래 DEV 의존성을
  교체하지 않는 격리 operator를 사용한다. 릴리스 매트릭스와 Source gitlink를
  임의 승격하지 않았으며 이 worktree의 외부 checkout SHA를 별도 기록한다.

## 구현

`agents.sessions.describePolicySupport`는 기존 `agent.sessions.read`와 현재
Workspace 호출 권한을 쓴다. 별도 비밀이나 CLI 접속을 조회하지 않고, 해당 Plugin의
활성 세션/Agent/경로 설정만 확인한다. `modes: []` 또는
`["plugin-tools-only-v1"]`, `readiness: unknown`, `osIsolation: not-certified`다.

명시적인 `executionPolicy`는 원시 도구 이름1~32개를 복사/정렬/고정하고 현재
manifest에 선언된 도구만 받는다. requestId가 필요하다. 기존 무제한 요청의 digest는
그대로 두고 새 제한 요청에는 버전형 digest를 사용한다. 접수 응답 유실 복구 시 실제
scheduler run의 제한·본문·사유를 재검사한다. 정책 제거/변경이나 다른 본문은 복구하지
않으며 불명확한 요청을 재전송하지 않는다. 저장된 세션 metadata로 이번 run의 신원·
본문·제한을 덮어쓰는 경로도 막았다.

첫 지원은 로컬 Codex CLI와 호출별 권한을 재검사하는 Workspace Worker다. 다른
adapter/Node/원격, legacy Host Worker, 사용자 명령/추가 CLI 인수는 거부한다.
Adapter는 저장 설정을 바꾸지 않고 해당 run의 read-only/명령·웹·앱 등 제한을
적용한다. CLI 기능별 실제 격리 효력은 별도 실증이 필요하다. Core 도구 API도 DB의
활성 run/session에 고정된 허용 목록을 검사하며 요청 본문의 가짜 정책이나 프로젝트로
우회할 수 없다. Worker 권한은 run 취소·활성화·grant·도구/정책 변경을 다시 확인한다.

이 계약은 업무 역할·기억 전략·재배정·승인을 Core에 넣지 않는다. Builder가 Lead용
계획 도구와 CTO 명세 조회/수신 도구를 구분한다. 일반 MCP 자동 승인 정책은 아직
새로 적용하지 않았다. 사용자 동의가 있는 실제 Lead/CTO 시험 자체는 허용됐지만,
보호 경로와 CTO 전송 연결 검증은 실제 모델 실행과 구분해 진행한다.

## 자동 검사

Node24.22.1에서 Core 관련12개 파일 **206/206** 통과. 실제 임시 PostgreSQL의
Host 서비스·접수/응답 유실/재시작과 정책 downgrade 차단을 포함한다. DB suite의
scheduler는 mock이며 provider를 실행하지 않았다. Server와 Codex adapter 타입 검사,
내부 SDK 빌드/배선 검사도 통과했다.

재현 명령은 Core 루트에서 `node node_modules/vitest/vitest.mjs run` 뒤 다음 파일들이다.

```text
server/src/__tests__/sps-session-policy.test.ts
server/src/__tests__/sps-workspace-plugin-tools.test.ts
server/src/services/plugin-session-tool-scope.test.ts
server/src/services/plugin-conversation-runtime.test.ts
server/src/__tests__/plugin-agent-session-context.test.ts
packages/adapters/codex-local/src/server/plugin-session-policy.test.ts
packages/plugins/sdk/tests/agent-session-policy-plumbing.test.ts
packages/plugins/sdk/tests/worker-rpc-host.test.ts
packages/plugins/sdk/tests/host-client-factory.test.ts
server/src/__tests__/sps-host-support.test.ts
server/src/__tests__/sps-workspace-agent-sessions.test.ts
server/src/__tests__/sps-session-dispatch-context.test.ts
```

공개 SDK 전체 **195/195**도 부모가 재실행해 확인했다. 처음 Node24의 `node --run test`
호출에서는 npm 위치 환경값이 없어 consumer5개가 실패했다. 올바른
`npm_execpath`를 지정한 재실행은195개 모두 통과했다. 단순 환경 실패를 숨기거나
실패 결과를 제품 기능 통과로 바꾸지 않았다.

기존 SDK의 Preview/Native 계약 회귀를 실행한 사실은 해당 보류 기능의 신규 개발이나
실기기 자격 확인이 아니다. 새로운 DB schema/migration은 없다.

## 남은 범위

Builder `75cfd33fe97bc9be421acf5e5416a0d3142b8a6e`에서 새 Lead 대화의 허용 목록
고정과 지원 전송 전 확인을 연결했다. 격리 타입/빌드/전체308개/SDK CLI validate/test와
실제 source Desktop no-AI 시험이 통과했다. 실제 미지원 Process 요청은 Run/turn0건,
입력 보존, 같은 ID 재요청 무실행, 재시작 후 상태 보존을 확인했다. 기존의 실행 후
실패 기대와 plain bridge error 안내 문제를 수정했다. 중간에 재시작 초기 문서의
Uncaught1회가 있었고 원인은 미확정이며, 같은 최종 코드 재실행은 exit0이었다.
최종 Main4/4·출력8개 정상종료/실패0·임시 데이터 제거, 사용자 DEV PID48300의 기존
시작 시각 보존을 확인했다. 시험 소스 지문은
`589106f57e7a2e73845548f53bd796fca8f6df84bccb2011a6837570653dd7d0`이고,
Worker는 `62cd4f1738c7c0d2c93ad2d8687aa57d9fec462fd9e07b1479fb0c4fd90bdbfe`다.
원시 로그·캡처는 로컬에 보관하고 공개하지 않는다. 이후 문서 변경까지 이 지문과
동일하다고 하지 않는다.

CTO 전달 큐와 실제 계획 도구 수신은 아직 연결/검증해야 한다. 현재 결과는 전체
Builder, Worker/QA·Task Packet·GitHub/Runner·납품,
OS 인증, 두 PC 또는 Stable 요건을 대신하지 않는다. Marketplace·Preview·자체 LAN은
계속 보류하고 기존 Tailscale/DEV/설치본/사용자 데이터는 보존한다. 이번에 production
dependency audit나 전체 Core 회귀를 수행하지 않았으며 보안 취약점0건을 주장하지 않는다.

공식 참고: [Codex 비대화형 실행 권한](https://learn.chatgpt.com/docs/non-interactive-mode#permissions-and-safety).
