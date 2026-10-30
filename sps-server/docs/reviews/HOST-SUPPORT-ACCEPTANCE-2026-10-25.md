# Host API 등록 확인 수용 검증

기준일: 2026-10-25 KST. 상태: Stage 2b 소스/공개 SDK/실제 source Desktop 수용 통과.
Desktop `0.4.137` 미출시 소스다. 설치본이나 Stable 자격 증거가 아니다.

## 제공한 것과 제공하지 않는 것

Worker 초기화 메시지에 optional `spsHost: { contractVersion: "1.0", operations }`를
추가했다. 실제 등록된 own handler 중 공개 Runtime 15개와 Agent API 6개만 고른다.
Worker가 반환하는 callback `supportedMethods`와 반대 방향의 정보다. 호출이나 외부
probe 없이 고정 method 이름만 보내며 Worker 재시작 때 snapshot을 다시 만든다.

공개 `readSpsHostSupport(initializeParams)`는 이 정보를 검증해 복사한다. 구 Host의
미제공/상속/accessor 속성과 모르는 계약 버전은 `unknown`이다. v1 보고는 정확한 키,
own data descriptor, 중복 없는 dense 배열, 128개/각 80자 제한, dotted identifier를
검증한다. 알려지지 않은 미래 method는 인식 목록에서 제외한다. 출력과 배열은 새
불변 값이며 정렬은 locale에 의존하지 않는다. 미래 계약의 필드/접근자는 해석하지 않는다.

이는 **Host API 등록 정보**이지 Plugin에 부여된 capability나 Workspace/Agent/Node
접근권, 실제 backend 설정/로그인/health/readiness가 아니다. 등록된 API여도 해당
Plugin은 권한이 없으면 호출할 수 없다. 기존 매 호출의 scope·activation·grant 검사는
그대로 유지한다. SDK/제품/protocol 버전으로 지원을 추정하거나 다른 backend로
자동 재실행하지 않는다. model/OCE/secret API는 광고하지 않는다.

새 RPC/HTTP endpoint, capability, DB, 의존성, 실행 엔진, UI, 계정·기본 Plugin 선택은
없다. backend별 지원 협상·연결 설정·모델 broker 전체를 구현한 것은 아니다.

## 최종 고정값과 검증

| 항목 | 고정값 / 결과 |
| --- | --- |
| 시험 Source | `2ae95596b4985744340dfe69bb333cc041595250` |
| Core | `282df9384783eed0e04703471e3dd39c01de0d64` |
| SDK | `555ad7575862d84a28e2575427254a8878268670`, package 0.11.0 미출시 추가분 |
| Desktop 전체 | **531/531**, 실패/skip 0 |
| SDK 전체 | **163/163**, 외부 packed TypeScript/runtime consumer 포함 |
| Core 변경부 | 6파일 **49/49** |
| Core 복구/설치/권한 회귀 | 추가 3파일 **88/88**; 전체 Core 회귀가 아님 |
| 타입/빌드 | Core 30개 package typecheck, 서버 build, compatibility boundary 통과 |
| 실제 source Electron | Runtime/Host support + No-AI 연속 실행 및 정리/exit 0 통과 |

후속 커밋은 위 결과/계획 기록만 추가한다. 런타임이나 harness 변경 후 이 실행을
최신 후보 증거로 자동 재사용하지 않는다. SDK package version은 새 tag나 배포를 뜻하지 않는다.

## 실제 Desktop 경로

- 임시 userData/Host/DB와 가짜 로컬 Identity를 사용했다. 실제 사용자 Vault/계정이나
  프로젝트, 설치된 앱, Tailscale Serve 설정은 바꾸지 않았다.
- 공개 SDK로 bundle한 headless Worker가 실제 Host 초기화 snapshot을 reader로
  해석하고 data handler로 조회했다. Runtime/Agent 등록은 보이고 모델/키/OCE/설치
  API는 보고하지 않는 점을 확인했다.
- `sps.runtimes.read`와 해당 primitive가 없는 별도 정상 설치 fixture도 같은 등록
  이름을 읽지만 실제 Runtime 조회는 Core capability gate에서 거부됐다. 권한을
  우회한 것도, fixture를 설치 가능하게 하려고 검사를 완화한 것도 아니다.
- 이어 Stage 2a의 모의 Node 서명 heartbeat/승인/철회·A/B 분리를 같은 실행에서
  확인했다. 실제 CLI 명령이나 execution grant는 만들지 않았다.
- 기존 No-AI UI/action/state/event/Job, capability/cross-Workspace 거부, headless
  health, 새로고침, 정상 Desktop 종료/Host 재시작, 데이터 보존/재활성화, 독립
  Native 복구까지 모두 연속 통과했다. 620/1000px 및 Native 캡처를 확인했다.
- 명령의 최종 exit 0과 임시 Host/userData 제거를 확인했다. 원본 캡처는 ignored
  개발 디렉터리에만 남긴다. cleanup 대기 중에는 프로세스를 재시작하지 않았다.

SDK에서는 malformed/duplicate/symbol/accessor/custom prototype/sparse/oversize와
미래 method/계약을 검증했다. Core에서는 임의 legacy/secret API나 상속/accessor
handler를 노출하지 않는 점, 실행하지 않고 등록만 읽는 점, 실제 child Worker로
전달하고 재시작 후 handler 제거가 반영되는 점을 확인했다.

Luna(`gpt-6-luna`, xhigh)가 SDK의 bounded reader/consumer 구현과 별도 읽기 전용
검토를 맡았다. 총괄은 미래 계약의 새 형식을 먼저 해석하지 않도록 보완하고 전체
SDK/통합 검증을 다시 수행했다. 범위 검토의 추가 발견은 없었으나 실제 구/미래
Core 실행은 하지 않았고 정적 fixture로 확인했다. Fast 적용은 delegation에서
강제할 수 없다. 이 검토는 독립 GitHub 리뷰나 릴리스 승인을 대신하지 않는다.

## 재현

Core (`external/sps-core`):

```powershell
pnpm exec vitest run server/src/__tests__/sps-host-support.test.ts server/src/__tests__/plugin-worker-manager.test.ts packages/plugins/sdk/tests/host-client-factory.test.ts server/src/__tests__/plugin-job-workspace-scheduler.test.ts server/src/__tests__/sps-runtime-connection.test.ts server/src/__tests__/sps-runtime-discovery.test.ts
pnpm exec vitest run server/src/__tests__/plugin-recovery-startup-contract.test.ts server/src/__tests__/plugin-install-autobuild.test.ts server/src/__tests__/plugin-routes-authz.test.ts
pnpm -r typecheck
pnpm --filter @paperclipai/server build
pnpm check:sps-compat-boundary
```

공개 SDK (`external/sps-plugin-sdk`): `npm test`.

Desktop (`sps-server/desktop`, Windows):

```powershell
npm test
$env:SPS_DESKTOP_E2E_SOURCE = '1'
$env:SPS_DESKTOP_E2E_SCREENSHOT = Join-Path $PWD '.tmp-host-support/acceptance.png'
npm run test:e2e:runtime-discovery
```

Electron 실행 전에 타입/서버 build를 끝냈고 실행 중 산출물을 덮어쓰지 않았다.
기존 Windows CI 필수 명령의 superset에 포함되나 원격 CI 성공은 새로 주장하지 않는다.

## 남은 것과 롤백

실제 CLI/Provider/Gateway/OCE·물리 Member PC, full Core/Linux 회귀, 최신 의존성 감사,
운영 Identity, 서명/동일 바이트 두 PC 및 OS/renderer 보호 게이트는 별도다.
Agent/backend 자원별 지원·연결과 handle broker는 후속 구현이다. 사용자가 보류한
보안 의존성 전환/설치본 교체는 진행하지 않았다.

optional 초기화 필드를 이전 Worker는 무시할 수 있다. 이 기능이 없는 Host는 새
reader에서 unknown이다. 회귀 시 Core 초기화 추가와 SDK/Source pin을 함께 되돌릴
수 있고 DB down migration이나 사용자 데이터 삭제가 필요 없다. 등록 snapshot을
실행 권한으로 바꾸는 fallback은 만들지 않는다.
