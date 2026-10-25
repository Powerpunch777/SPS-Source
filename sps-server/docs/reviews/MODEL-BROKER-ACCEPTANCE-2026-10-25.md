# 모델 요청 broker 검증

기준일: 2026-10-25 KST. Stage 3b의 mock-first 소스 구현이다. 중간 source Desktop
연속 수용을 통과했고 CI 보완 후 최종 pin 재실행을 앞두고 있다. Desktop 0.4.137 미출시 소스이며 설치본 교체,
실키·유료 호출·실제 제공자 인증 또는 Stable 완료를 뜻하지 않는다.

## 구현과 경계

- Host-only 연결 관리 API와 Workspace/Plugin별 grant를 추가했다. endpoint/model,
  Secret 참조와 limit는 불변이다. 변경 시 새 연결을 만들고 비활성화는 grant를
  철회한다. Plugin의 body로 endpoint/model/키/tools를 바꿀 수 없다.
- 공개 SDK models.list/submit/get/cancel은 인증된 invocation Workspace와 각 read/
  submit/cancel capability를 요구한다. 현재 package, 활성화, dependency, grant,
  목적 binding과 Secret/실제 사용 버전을 재검사한다. 복구 모드도 호출을 차단한다.
- 기존 암호화 Secret 및 binding을 재사용하며 raw 키 RPC는 계속 차단한다. 키는
  Host 내부 resolver와 고정 endpoint Bearer header에서만 사용한다. Plugin 조회에는
  endpoint/Secret ID/키가 없고 readiness는 unknown이다. Host는 HTTP 전송 주체이지
  inference가 Host 로컬에서 실행된다는 뜻이 아니다.
- 새 connection/grant/run 테이블은 additive migration 0163/0164로 생성했다.
  Workspace·Plugin·requestKey와 input hash를 HTTP 전에 저장한다. 같은 키/입력은
  기존 Run을 반환하고 다른 입력은 거부한다. 원문 입력은 DB에 저장/자동 replay하지
  않는다. bounded text/refusal 결과는 소유 데이터로 저장하며 결과 전체의 암호화를
  주장하지 않는다. Secret 버전 회전/철회와 결과 전달 권한은 별도로 확인한다.
- 승인 철회 뒤 결과는 withheld다. 재승인 revision이 달라도 과거 결과가 다시 보이지
  않는다. 실행 중 권한 철회 시 결과는 버리되 이미 얻은 보고 토큰은 남긴다. 토큰
  미제공, 가격과 실제 청구는 unknown이며 업무 성공 여부도 Plugin의 책임이다.
- 취소·timeout·lease 손실·재시작은 기술 상태다. HTTP를 자동 재시도하거나 다른
  backend로 fallback하지 않는다. 동일 프로세스/같은 Db 객체에서 추적 중인 미정리
  작업은 cleanup-only reservation을 유지하고, 실행 lease를 잃으면 재전송/결과 저장
  권한을 되살리지 않는다. 다른 프로세스의 실제 생존이나 upstream 종료/과금 중단을
  증명하는 분산 프로토콜은 아니다. 실제 제품 broker는 Host Db당 singleton이다.
- 복원 sanitizer는 모델 기록/결과/usage를 보존하지만 연결을 비활성화하고 Secret
  참조·grant·lease를 해제하며 queued/running을 host_restored/interrupted로 바꾼다.
  재시작/복원 후 원문 입력이나 요청을 자동 재전송하지 않는다.
- 공통 실행 기록/요약과 기존 Host 진단 UI에 model_request lane을 추가했다. model은
  provider report가 아닌 Host configured로 구분한다. 공통 조회는 prompt/결과/키/
  endpoint를 읽지 않는다. 연결 설정 폼은 아직 만들지 않았으며 현재는 Host API다.

## 검증 상태

| 항목 | 결과 |
| --- | --- |
| Core | 0ba417ad9b0e26ae1cf598edca524b82059d04de |
| 공개 SDK | d4d69208480fc618b2055378b85d183aea422d50; 0.11.0 미출시 추가분 |
| 최종 Runtime 시험 Source | source Electron 재실행 성공 후 고정 |
| Core 표적 단일 회차 | 21파일 387/387, 실패/skip 0. 전체 Core 회귀는 아님 |
| SDK 전체 | 174/174, 실패/skip 0 |
| Desktop 전체 | SDK 수정/새 bundle 및 경로 회귀 포함 535/535. 최종 Core pin 재실행 대기 |
| Core 타입/빌드 | 30개 package typecheck, 서버 build, compatibility boundary 통과 |
| UI 토큰 게이트 | 실패: 기존 다른 화면 79 color + 36 arbitrary-value + 1 font-size. 이번 변경 파일 위반은 목록에 없음. 전체 통과로 취급하지 않음 |
| source Electron | 첫 실행은 SDK 선언 누락으로 실패. 수정 후 f6cd4577 + fe6fc7ad + d4d69208에서 전체 통과/정리 exit 0. 최신 OpenAPI/경로 보완 pin 재실행 대기 |
| GitHub 보안 게이트 | Source 684a596f의 실제 runner에서 production Zod 3 High 1243066 미승인으로 실패. 보류된 major 전환을 무음 수행/예외 처리하지 않음 |

### 발견 후 수정한 것

1. lease가 만료됐지만 로컬 fetch/cleanup이 미완료인 실행이 정리 완료로 보이던
   경로를 막고 경쟁 broker/동시성 회귀를 추가했다. 외부 작업 종료는 여전히 unknown이다.
2. Host-only 관리 API에서 validation보다 기술 Host 권한을 먼저 확인한다. revoke
   body의 array/primitive/필드, 잘못된 query/ID를 거부하고 no-store와 grant 감사 유형을
   정렬했다. audit details에는 endpoint/model/Secret 참조/원문을 넣지 않는다.
3. Desktop의 두 번째 Host 증명 허용 목록에 새 API의 정확한 UUID/HTTP method와
   model_request 기록 경로를 추가했다. 다른 origin/Member나 임의 경로에는 보내지 않는다.
4. 실제 Electron의 생성 Worker가 공통 sps.executions.read를 platform 선언에서
   거부하는 SDK 누락을 발견했다. 허용 목록/타입과 결합 회귀를 수정했다. 최초 실패를
   성공으로 덮지 않고 최종 pin에서 다시 실행한다.
5. 기존 복구 모드와 empty-Host restore 규칙에 새 실행 경로/테이블을 연결했다.
6. 실제 CI는 더 이상 runner 진입 전 막히지 않았다. OpenAPI의 새 모델/기록 9개
   operation 등록 누락, Linux path delimiter에 Windows fixture를 넣은 오류,
   Windows runner의 8.3 임시 경로와 실제 경로 표기 차이를 고쳤다. coverage 예외나
   약한 경로 검사를 추가하지 않았다. 아래 최종 시험은 해당 보완까지 포함한다.

## 재현

Core에서 다음 단일 표적 명령을 사용했다. 서로 겹치는 집중 회차를 합산하지 않는다.

```powershell
pnpm exec vitest run server/src/__tests__/sps-model-response.test.ts server/src/__tests__/sps-model-transport.test.ts server/src/__tests__/sps-model-bound-transport.test.ts server/src/__tests__/sps-model-connections.test.ts server/src/__tests__/sps-model-connection-routes.test.ts server/src/__tests__/sps-model-broker.test.ts server/src/__tests__/sps-plugin-availability.test.ts packages/plugins/sdk/tests/model-host-client.test.ts packages/plugins/sdk/tests/host-client-factory.test.ts packages/plugins/sdk/tests/worker-rpc-host.test.ts server/src/__tests__/sps-host-support.test.ts server/src/__tests__/sps-execution-observation.test.ts server/src/__tests__/sps-execution-summary.test.ts server/src/__tests__/sps-executions-routes.test.ts server/src/__tests__/plugin-secrets-handler.test.ts server/src/__tests__/plugin-job-workspace-scheduler.test.ts packages/db/src/post-restore-sanitizer.test.ts ui/src/components/SpsPluginExecutions.test.tsx ui/src/api/sps-executions.test.ts server/src/__tests__/openapi-routes.test.ts server/src/__tests__/plugin-recovery-startup-contract.test.ts
pnpm -r typecheck
pnpm --filter @paperclipai/server build
pnpm check:sps-compat-boundary
pnpm check:token-gates
```

공개 SDK에서 npm test, Desktop에서 npm test와 다음을 실행한다. 실행 중 Core build를
동시에 하지 않고, 시나리오 중간 로그뿐 아니라 정상 종료·임시 Host/userData 정리까지 확인한다.

```powershell
$env:SPS_DESKTOP_E2E_SOURCE = '1'
$env:SPS_DESKTOP_E2E_SCREENSHOT = Join-Path $PWD '.tmp-model-broker/acceptance.png'
npm run test:e2e:runtime-discovery
```

## 未完了と次

Host 설정 UI, 실제 제공자/실키, CLI 실행 reference, Gateway 고정판/OCE, Builder의
선택 UI, OS/renderer 보호, 전체 Core/Linux CI, 의존성 보류, Identity 운영, 서명·동일
서명본 두 PC, main 통합/독립 리뷰는 별도 범위다. 옛 Source나 부분 shard를 최종 tuple의
증거로 쓰지 않는다. Luna gpt-6-luna/xhigh에 제한된 구현/회귀/감사를 위임하고 총괄이
통합·수정·실제 앱을 검증했다. delegation tool에 Fast 강제 parameter가 없어 강제 적용을
보증하지 않는다. 롤백은 연결 비활성화/grant 철회와 호환 pin 조정이며 이용자 DB의
down migration은 하지 않는다.
