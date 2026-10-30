# 안전한 Agent 실행 정보 수용 검증

기준일: 2026-10-25 KST. 상태: Stage 2c 소스/공개 SDK/격리 source Desktop 수용 통과.
Desktop `0.4.137` 미출시 소스이며 설치된 앱의 UI 교체나 Stable 증거가 아니다.

## 변경과 경계

기존 Agent list/get의 호환 shape는 변경하지 않았다. 별도
`agents.describeExecution` RPC를 기존 `agents.read`에 연결하고 공개 Worker의
`platform.agents.describeExecution(agentId, companyId)`로 노출했다. Host API 등록
snapshot에도 정확한 method 이름을 추가했다. 구 Host에서 새 API를 지원한다고
추정하거나 legacy 전체 Agent 조회로 무음 대체하지 않는다.

| 필드 | 의미 / 한계 |
| --- | --- |
| agentId / adapterType | 같은 Workspace의 Agent 및 등록 어댑터 식별자. 미등록·과도한 길이·제어문자·경로/URL 유사 표시는 unknown으로 가림 |
| state | 저장된 상태의 configured / disabled / unknown. error도 설정은 존재하므로 configured이며 정상 실행 보장이 아님 |
| adapterRegistration | 실제 기존 레지스트리의 registered / unavailable. 외부 dotted/scoped/공백 포함 이름에 새 slug 제한을 강제하지 않으며 표시 가림과 독립 |
| executionOwner | 기존 binding이 있으면 node, 없으면 adapter. adapter는 환경/실행 장소를 기존 어댑터에 위임한다는 뜻이지 Host 로컬 실행 증명이 아님 |
| node | 같은 tenant의 ID와 기존 cached Node state/observedAt만. 다른 Workspace를 가리키는 행은 ID 없이 unknown |
| authorization / readiness | recheck_on_dispatch / unknown. 사용자 권한, Runner/Source grant, 로그인, quota, 실제 backend 준비를 인증하지 않음 |

서비스는 Agent ID/status/adapterType 및 Node binding/관측 컬럼만 조회한다.
adapter/runtime config, cwd, 환경, 키, prompt, 업무 역할, 내부 오류/출력은 읽어
반환하지 않는다. 기존 legacy 읽기 API가 같은 최소 정보만 준다는 주장은 하지 않는다.
조회는 세션·grant·run·외부 probe를 생성하지 않는다. 공개 Worker는 인자를 160자
이내의 비어 있지 않은 문자열로 제한하고 현재 invocation Workspace에 고정한다.
Core capability/scope 검사와 실제 dispatch 재검사는 그대로 남는다.

Agent의 Node dispatch에 남아 있던 별도 느슨한 heartbeat 판정도 기존 Stage 2a의
엄격한 helper로 교체했다. 미래 heartbeat는 명령 생성 전에 거부된다. Node 없는
실행을 임의로 추가하거나 grant/Source/Runner 선택 정책을 바꾸지 않았다.
내부 fake test harness는 새 연결 조회를 모델링하지 않는다고 명시적으로 오류를
반환한다. fake 성공이나 실행 가능 상태를 만들어내지 않는다.

## 최종 고정값과 검증

| 항목 | 고정값 / 결과 |
| --- | --- |
| 최종 시험 Source | `367999d156b7d5aebfa924133f4cbd15934c6a18` |
| Core | `33f59c0730eb694e9c7b48f58ce673675dd17c91` |
| 공개 SDK | `3feb5c4289718857e068f482ad22a49f925c4ae1`, package 0.11.0 미출시 추가분 |
| Desktop 전체 | **532/532**, 실패/skip 0 |
| SDK 전체 | **166/166**, 외부 packed TypeScript consumer 및 Worker RPC/권한/tenant 시험 포함 |
| Core 관련 회귀 | 9파일 **85/85**, 실패/skip 0. 전체 Core 회귀는 아님 |
| 타입/빌드 | 최종 Core 30개 package typecheck, 서버 typecheck/build, compatibility boundary 통과 |
| 실제 source Electron | 아래 전체 흐름의 최종 단일 연속 실행 및 cleanup/exit 0 통과 |

후속 기록 커밋은 위 증거와 계획만 갱신한다. 이후 runtime/harness를 바꾼 뒤 과거
실행을 최신 tuple의 증거로 자동 재사용하지 않는다. 전체 타입 검사의 최종 회차는
Electron 정리 후 실행했고, 실제 앱 검증 중 산출물을 덮어쓰지 않았다.

## 실제 Desktop 수용

임시 userData/Host/DB와 가짜 로컬 Identity를 사용했다. 별도 임시 Workspace C에
interval/on-demand heartbeat가 꺼진 시험 Agent를 등록했으며 CLI는 실행하지 않았다.
기존 No-AI reference의 A/B Workspace는 마지막까지 Agent 0개를 유지했다.

1. 공개 SDK로 bundle한 Worker가 초기화 API snapshot의 새 method를 확인한다.
2. C의 Agent를 실제 Worker→Core 경로로 조회해 정확한 최소 필드와 경로 미노출,
   registered/configured이지만 readiness는 unknown인 점을 확인한다.
3. 다른 Workspace에서 같은 Agent ID 조회를 시도해 거부됨을 확인한다.
4. agents.read가 없는 별도 Worker는 SDK의 선언 검사에서 호출이 거부된다.
   Core 자체 capability/invocation 거부는 별도 Host-client 시험에서 확인했다.
5. 별도의 모의 Node를 실제 API로 등록·서명 heartbeat·승인하고 Agent grant를
   부여한다. 자동 primary binding이 조회에 반영되지만 readiness는 unknown이다.
6. 실제 일시중지 후 disabled 상태, Node 철회 후 binding 삭제와 adapter routing을
   확인한다. 조회로 fallback 실행이 발생하지 않고 C의 Agent run 기록은 빈 목록이다.
7. 이어 기존 Node Runtime/Host support와 No-AI UI/action/state/events/Workspace Job,
   A/B/capability 거부, UI-less Worker, reload, 정상 Desktop 종료·Host 재시작,
   재활성화 데이터 보존 및 독립 Native 복구를 모두 연속 통과했다.
8. 620/1000px와 Native 캡처를 검토했다. 최종 명령 exit 0 및 임시 Host/userData 제거를
   확인했다. 원본 캡처는 ignored 개발 산출물이며 공개/물리 증거로 업로드하지 않았다.

이는 실제 CLI/Member PC나 Provider 연결 검증이 아니다. 가짜 키의 Node 프로토콜과
실제 로컬 Desktop/Core/공개 SDK 경로를 검증한 것이다. 사용자의 Vault/프로젝트/실제
CLI 계정·설치본이나 Tailscale 설정을 변경하지 않았다.

## 발견과 재검증

- 초기 DB 시험의 FK cleanup 순서를 고쳐 child Agent부터 삭제하도록 했다.
- 첫 Electron 시도는 deprecated promptTemplate을 사용한 시험 입력을 Core가
  422로 올바르게 거부했다. 생성 지침 검사를 완화하지 않고 fixture를 고쳤다.
- Luna와 총괄 검토는 새 descriptor의 slug 정규식이 등록된 `vendor.adapter` 등을
  unavailable로 오판하는 호환성 문제를 확인했다. 기존 레지스트리를 권위로 두고
  표시 식별자 가림을 분리한 뒤 dotted/scoped/non-slug 회귀를 추가했다.
- 초기 Source da6ccc2의 실패와 Source 1b3bc641/Core a46d9ac의 성공은 최종 증거가
  아니다. 수정 후 최종 532/166/85 및 Electron을 다시 실행했다.
- Luna(`gpt-6-luna`, xhigh)는 bounded SDK 구현과 읽기 전용 검토를, 총괄은 통합·
  호환성 보정·재검증을 수행했다. delegation은 Fast를 강제할 파라미터가 없으며
  이 검토는 독립 GitHub 리뷰나 출시 승인을 대신하지 않는다.

## 재현

Core (`external/sps-core`):

```powershell
pnpm exec vitest run server/src/__tests__/sps-agent-execution-descriptor.test.ts packages/plugins/sdk/tests/host-client-factory.test.ts server/src/services/sps-node-execution.test.ts server/src/__tests__/plugin-agent-session-context.test.ts server/src/__tests__/sps-host-support.test.ts server/src/__tests__/plugin-worker-manager.test.ts server/src/__tests__/plugin-job-workspace-scheduler.test.ts server/src/__tests__/sps-runtime-connection.test.ts server/src/__tests__/sps-runtime-discovery.test.ts
pnpm -r typecheck
pnpm --filter @paperclipai/server build
pnpm check:sps-compat-boundary
```

SDK (`external/sps-plugin-sdk`): `npm test`.

Desktop (`sps-server/desktop`, Windows):

```powershell
npm test
$env:SPS_DESKTOP_E2E_SOURCE = '1'
$env:SPS_DESKTOP_E2E_SCREENSHOT = Join-Path $PWD '.tmp-agent-descriptor/acceptance.png'
npm run test:e2e:runtime-discovery
```

기존 Windows CI 필수 명령의 superset에 포함되며 새 원격 CI 성공을 주장하지 않는다.

## 남은 것과 롤백

범용 모델 API/handle broker, 실제 Agent/backend 능력과 연결 협상, 최신 Gateway/OCE,
Primary/Extension 전체 UI 및 production 보호 실행은 후속 범위다. 이 조회 기능으로
완료 처리하지 않는다. full Core/Linux 회귀, 최신 보안/의존성 감사, Identity 운영,
서명/동일 바이트 두 PC 및 저장소 보호·독립 리뷰 게이트도 별도로 남는다.
사용자가 보류한 의존성 major 전환과 설치본 교체는 수행하지 않았다.

새 DB migration이나 저장값 변환은 없다. 새 API와 SDK/Source pin은 함께 되돌릴 수
있고 기존 list/get/session은 그대로다. 미래 heartbeat를 허용하던 동작으로 되돌리기보다
영향받는 Node를 비활성화한다. 시험 Agent/Node/Plugin은 임시 Host와 함께 제거한다.
