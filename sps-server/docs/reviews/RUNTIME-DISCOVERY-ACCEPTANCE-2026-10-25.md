# Node Runtime 연결 관측 수용 검증

기준일: 2026-10-25 KST. 상태: Stage 2a 소스 구현 및 격리 source Electron 수용 통과.
Desktop `0.4.137` 미출시 소스이며 설치된 앱 교체나 Stable 증거가 아니다.

## 범위와 계약

- 기존 `sps.runtimes.list` / `sps.runtimes.read`만 재사용한다. 새 RPC, DB 테이블,
  전역 backend registry, 실행 엔진, Secret 읽기나 의존성은 추가하지 않았다.
- optional `connection`은 실행 주체 `node`, 별도 execution grant 필요 여부,
  Host가 마지막으로 관측한 상태·시각만 반환한다. 구 Host가 생략하면 unknown이다.
- active + 키 검증 + 2분 내의 유효한 비미래 heartbeat가 모두 맞아야
  `recently_seen`이다. 나머지는 `inactive` / `unverified` / `offline` / `unknown`이다.
- **기존 `online`은 heartbeat-only 의미를 보존한다.** 승인이나 실행 가능 여부가
  아니므로 철회 직후에도 최근 heartbeat가 있으면 true일 수 있다. 잘못되거나
  미래인 시각이 online/dispatch freshness를 통과하던 동작은 차단했다.
- credential/availability 정보, grant와 dispatch 시 Node/Runner/Source 재검사를
  분리해서 유지한다. 최근 관측은 실제 CLI 로그인, 한도, 프로세스 또는 실행 권한을
  증명하지 않는다. Node/Runner 양쪽 tenant ID를 확인해 잘못 연결된 행도 숨긴다.
- 이번 단계의 대상은 허용된 CLI Runner metadata다. 모델 API, Agent session,
  Gateway/OCE 연결·지원 협상까지 구현한 통합 목록이 아니다. UI 변경도 없다.

## 정확한 소스와 결과

| 항목 | 고정값 / 결과 |
| --- | --- |
| 최종 시험 Source | `8d2b3bfc63a0414d1294bedb91ee844c0e1249f7` |
| Core | `fa16dcc2c63e090a03e392757d8486cf0ff380f9` |
| 공개 SDK 소스 | `da20ec44c3eabb8be92a29df330eb8c6378fec5d`, package `0.11.0` 미출시 추가분 |
| Desktop 전체 | `npm test` **530/530**, 실패/skip 0 |
| 공개 SDK 전체 | `npm test` **157/157**, 외부 packed TypeScript consumer 포함 |
| Core 표적 회귀 | 6파일 **82/82**, 실패/skip 0 |
| Core 서버 | typecheck/build 및 compatibility boundary 통과 |
| source Electron | `test:e2e:runtime-discovery` 한 번의 최종 연속 실행 및 정리/exit 0 |
| Workflow | YAML 파싱 및 Windows 필수 수용 명령 연결 확인 |

이 문서와 후속 기록 커밋은 위 실행 결과만 기록한다. 이후 runtime/harness를 바꾼
후 과거 실행을 최신 tuple의 증거로 자동 재사용하지 않는다.

### 실제 Desktop / 공개 SDK / Core 경로

1. 가짜 로컬 Identity와 임시 userData/Host/DB로 source Electron을 실행한다.
   Agent/모델/Gateway는 등록·설정하지 않는다.
2. 공개 SDK만 사용하는 임시 headless Runtime 조회 Worker를 명시적으로 설치하고
   Workspace A/B에 활성화한다. 이 Worker에는 dispatch/grant/Secret 권한이 없다.
3. 실제 Node 등록 API, 로컬에서 생성한 가짜 키의 서명 heartbeat, Host 승인 API를
   호출한다. 이는 **모의 Node 프로토콜**이며 실제 Member 컴퓨터나 CLI가 아니다.
4. Worker의 data handler에서 공개 Runtime client를 거쳐 Core에 조회한다.
   최근 관측·소유권·grant 필요·unknown credential을 확인하고 B 결과는 빈 목록이다.
5. 실제 철회 API 후 같은 Runtime의 connection이 inactive가 되는지 확인한다.
   기존 heartbeat-only online과 철회 상태를 혼동하지 않는 assertion을 포함한다.
6. 이어 기존 No-AI UI/action/state/event/Workspace Job, A/B 거부, 미선언 read/write
   거부, headless health, 새로고침·실제 정상 종료/Host 재시작·재활성화 데이터 보존,
   독립 Native 복구를 모두 한 번의 연속 실행에서 통과했다.
7. 620/1000px 체크리스트와 Native 복구 캡처를 확인했다. 전체 시나리오 뒤 임시
   Host/userData 정리가 끝나고 명령 exit 0을 확인했다. 강제 종료를 재시작 성공으로
   대신하지 않는다. 원본 캡처는 ignored 개발 산출물에만 둔다.

Core의 별도 실제 임시 DB 시험은 조회가 grant/run을 생성하지 않는 점, 인증 필요·
quota-limited Runner의 별도 거부, 철회/미검증/오래된·누락·미래 heartbeat, 잘못된
Workspace Node/Runner 연결 및 API-only/custom profile 미노출을 포함한다.

초기 구현의 `online`에 approval 상태를 섞은 호환성 변화를 Luna 읽기 전용 검토가
발견했다. 이를 기존 의미로 되돌린 뒤 전체 530/157/82와 source Electron을 다시
실행했다. 초기 Source `76c44e8` / Core `6cafaf8`의 성공을 최종 수정의 증거로
대신하지 않았다. Luna는 bounded SDK 타입/consumer 작업과 독립 검토를 담당했고
총괄이 실제 통합·수정·수용을 수행했다. delegation의 Fast 적용은 도구로 강제할 수 없다.

## 재현

Core (`external/sps-core`):

```powershell
pnpm exec vitest run server/src/__tests__/sps-runtime-connection.test.ts server/src/__tests__/sps-runtime-discovery.test.ts server/src/__tests__/sps-nodes-routes.test.ts packages/plugins/sdk/tests/host-client-factory.test.ts server/src/services/sps-node-execution.test.ts server/src/__tests__/sps-execution-timeout.test.ts
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/server build
pnpm check:sps-compat-boundary
```

SDK (`external/sps-plugin-sdk`): `npm test`.

Desktop (`sps-server/desktop`, Windows):

```powershell
npm test
$env:SPS_DESKTOP_E2E_SOURCE = '1'
$env:SPS_DESKTOP_E2E_SCREENSHOT = Join-Path $PWD '.tmp-runtime-discovery/acceptance.png'
npm run test:e2e:runtime-discovery
```

서버 build는 최종 Electron 정리가 끝난 뒤 실행했다. 실행 중인 Core UI/runtime
산출물을 별도 build로 덮어쓰지 않는다. CI의 기존 No-AI source 단계는 이 superset
명령을 필수 실행하도록 연결했으며 원격 CI 성공을 주장하지 않는다.

## 한계와 롤백

실키/고객 데이터/유료 호출, 실제 CLI 명령, 물리 Host/Member PC, 실제 Tailscale
Serve/Gateway/OCE, 패키지 생성/설치/업데이트는 수행하지 않았다. 논리적 scope와
서명 프로토콜 시험이지 OS/renderer 격리나 전체 egress 방어 증거가 아니다.
전체 Core/Linux 회귀·최신 보안 감사·보호 모드·Identity 운영·서명/동일 바이트 두 PC
게이트와 사용자가 보류한 의존성/설치본 변경은 그대로 남는다.

DB와 기존 저장값 migration은 없다. optional DTO를 이전 consumer가 무시해도 기존
필드는 남는다. 회귀 시 조회 추가와 해당 Source/SDK pin을 함께 revert할 수 있으나,
미래 heartbeat 허용이나 교차 Workspace 누출 차단을 되돌리는 대신 관련 Runtime을
비활성화하는 것을 우선한다. 시험 Plugin은 임시 Host와 함께 제거된다.
