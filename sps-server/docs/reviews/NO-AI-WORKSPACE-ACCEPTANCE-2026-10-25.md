# No-AI Workspace 수용 검증

기준일: 2026-10-25 KST. 상태: 소스 구현 완료 / 최종 Electron 연속 검증 진행 중.
Desktop `0.4.137` 미출시 소스이며 설치된 앱 교체나 릴리스 게시가 아니다.

## 변경

- 임시 체크리스트 reference를 공개 SDK만으로 구현했다. 추가/완료/새로고침,
  Workspace-scoped 데이터, 별도 이벤트 카운터와 수동 Job을 사용한다.
- UI 없는 Worker, 읽기/쓰기 capability 누락, 다른 Workspace 접근을 시도하는
  negative fixture를 같은 임시 Host에서 설치한다. 기본 번들은 변경하지 않는다.
- Desktop의 설치된 SDK 복사본이 동일 package version이어도 오래될 수 있음을
  재현했다. 실제로 `performAction`을 지원하지 않는 복사본이 발견됐다. 개발·시작·
  테스트·패키징·Electron 검증 전에 소스 fingerprint 동기화를 추가했다.
  node_modules 밖의 링크와 의존성 그래프 변경은 자동 덮어쓰지 않고 거부한다.
- Core의 Workspace Job이 `job.companyId`를 invocation scope로 유도하지 않아
  A Job에서 B Host 호출이 통과하는 실패 테스트를 먼저 재현했다. 이를 고쳤으며
  회사 정보가 없는 기존 Host Job은 instance scope 동작을 보존한다.
- 공개 SDK에 이미 Core가 보내던 `PluginJobContext.companyId?: string` 타입을
  추가했다. Host Job에서는 생략 가능하며 runtime API·DB·package version은 불변이다.

## 고정값과 시험

- Core: `02b3da6f42d5c53159a3eb2e14b6575326f8a946`.
- SDK: `3ee0a3acd9badd881c13e91b29eac13569c036b3`, package `0.11.0`의 미출시 고정 소스.
- Core 회귀: worker-manager / Workspace scheduler / Host client factory 3파일
  **36/36**, 서버 typecheck 통과. 악의적 nested company 요청 거부와 legacy Host Job을 포함한다.
- 공개 SDK 전체 `npm test`: **157/157**, 외부 TypeScript consumer 검증 포함.
- Desktop Worker/package/sync 새 검사: **15/15**. 전체 527개 최종 검사는 pin 고정 후 재실행한다.
- 첫 개발 Electron 실행들은 성공 증거가 아니다. 비활성 거부 메시지에 대한 시험
  assertion 누락, fixture 이벤트 접두사 중복, negative UI variant 경로 충돌을
  발견하고 고쳤다. 최종 연속 실행의 성공 결과만 후속 기록한다.

재현 (`external/sps-core`):

```sh
pnpm exec vitest run server/src/__tests__/plugin-worker-manager.test.ts server/src/__tests__/plugin-job-workspace-scheduler.test.ts packages/plugins/sdk/tests/host-client-factory.test.ts
pnpm --filter @paperclipai/server typecheck
```

재현 (`sps-server/desktop`, Windows PowerShell):

```powershell
npm test
$env:SPS_DESKTOP_E2E_SOURCE = '1'
npm run test:e2e:no-ai-checklist
```

## 범위와 복귀

현재 로그인·Windows/Tailscale·기술 권한 계약, 사용자 Vault/DB/기본 활성화를
바꾸지 않는다. 데이터/스키마 migration, 실키·고객 자료·유료 호출, 설치본 생성,
실제 Member PC·Gateway/OCE 또는 전체 Core/Linux 검증은 하지 않았다.
Agent 없는 실행과 API 거부는 논리적 경계 증거이며 임의 Plugin/renderer의 OS 격리나
전체 네트워크 egress 차단 보증이 아니다. 기존 Stable·보안 보류 게이트는 유지한다.

시험 플러그인은 임시 Host 정리로 제거된다. Source 회귀 시 test/sync 변경을 revert할
수 있고 SDK 타입은 additive다. Core Job 범위 보정은 보안 수정이므로 이전 취약 동작으로
되돌리기보다는 해당 Workspace Job을 비활성화하는 것을 우선한다. 기존 사용자 데이터
삭제나 DB down migration은 필요 없다.
