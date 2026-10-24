# Core / Plugin 목표 아키텍처 현행 감사

기준일: 2026-10-25 KST. 상태: Phase 0, 코드 변경 없는 감사.

## 1. 범위와 기준

사용자가 두 설계 문서의 검토 후 감사를 승인했다. 이번 산출물은 구현 승인이
아니며 실행 코드, DB, Source 매핑, 계정, 설치본, 업데이트 정책은 변경하지 않는다.
새 목표와 충돌하는 기존 문서를 덮어써 이미 구현된 것처럼 만들지도 않는다.

| 항목 | 실제 체크아웃 |
| --- | --- |
| SPS Source | `codex/sps-release-hardening`, `174e7508019a316fd3df0109608d3cff6f4a91ae` |
| Core submodule | `codex/sps-core-release-hardening`, `0574df95db75bff132ef2b7f9704f7bbd73608c6` |
| 공개 SDK submodule | `codex/builder-chat-platform`, `cfa64ec4f589ea9765661834e1685ef1f2e14453` |
| Desktop / SDK / API | `0.4.137` / `@sonparkserver/plugin-sdk@0.11.0` / Plugin API `1`, Profile `1.0`, `2.0` |
| support matrix | `sps-server/release/support-matrix.json`과 submodule/패키지 일치 |
| 최초 작업 트리 | 세 저장소 모두 clean. 이번 변경은 이 감사 문서 세 개만 허용 |

입력 원본은 레포 밖 사용자 첨부 파일이며, 동일 자료 재확인을 위한 SHA-256:

- `SPS_Core_Plugin_Architecture_Handoff_2026-10-25 (1).md`:
  `8e77fb84439ab1f8779cca86bd35cabf2bdee497a706bfa4912f7523e26f9a77`
- `Codex_SPS_Core_Plugin_Audit_Prompt_2026-10-25.md`:
  `2677dee6061c1d83030e639697287180f6f5d94319cfc17106f2f0876821ab3b`

이 문서의 경로는 레포 루트 기준이며, `:번호`는 위 고정 리비전의 코드 줄이다.
문서 변경 커밋은 감사 대상 구현 리비전과 다를 수 있다. 설치된 앱/과거 패키지의
실행 결과를 자동으로 이 체크아웃의 증거로 간주하지 않는다.

## 2. 요약 판단

**전면 재작성보다 기존 primitive 재사용과 경계 재배치가 적절하다.** Host당 패키지
설치, Workspace 활성화, 버전/의존성 검사, Run/Job/상태 저장, Node 서명·lease,
Preview 분리 기반은 있다. 그러나 새 설계 전체를 현재 Core가 충족하지는 않는다.

가장 위험한 충돌 세 가지:

1. 같은 사용자 권한의 Worker/CLI와 Vault 사이에 새 요구 수준의 OS 경계가 없다.
2. Host 공유 Worker 및 상태 중심 Job 취소는 Workspace별 실제 종료와 같지 않다.
3. Native 관리창 기반과 플러그인 renderer 권한을 먼저 분리하지 않고 Core Shell을
   제거하면 복구 접근성과 관리자 경계가 약해질 수 있다.

이는 새 요구사항에 대한 적합성 감사다. 모든 항목을 현재 제품에서 새로 재현한
공격/버그라고 주장하지 않는다. 보안 대안과 실제 Windows 실증은
[보안 실현 가능성](CORE_PLUGIN_SECURITY_FEASIBILITY.md), 변경 순서는
[이전 계획](CORE_PLUGIN_ARCH_MIGRATION_PLAN.md)에 분리한다.

## 3. 이번 목표를 해석하는 기준

- 빈 Workspace, Agent 0개, Primary 0개, UI 없는 Extension은 정상이다.
- Primary는 기본 진입 Shell을 최대 하나 선택하는 정책이다. Extension의 전용 창,
  전체 화면, 헤드리스 기능이나 일반 SDK 접근을 막는 신분 구분이 아니다.
- Core 관리/복구는 Plugin UI 밖 트레이·단축키·독립 설정창에서 접근한다.
- Plugin UI에 Core 메뉴를 강제하지 않는다. 기존 Dashboard/Inbox/Agent API와
  데이터는 즉시 삭제하지 않고 선택적/호환 서비스로 남긴다.
- 패키지 설치는 Host 범위, 사용·설정·데이터·중지는 Workspace 범위다.
- 파일 범위 미설정은 OS 권한 한도지만 Vault/보호 자원 예외는 유지한다. 제한한
  경우 Worker·CLI·자식까지 실제 집행해야 하며, 불가능하면 미지원이다.
- pause는 신규 차단, stop은 신규 차단과 관리 실행 취소, resume은 미래 신규 허용이다.
  취소된 실행의 자동 부활은 허용하지 않는다. 업무 재배정/성공 판단은 Plugin 소유다.
- 로컬 단독 이용, 사용자 선택 업데이트 적용, 선택형 인증/원격 연결이라는 새
  목표는 기존 로그인 우선/자동 설치 동작과 구분해야 한다.

## 4. 소유권과 신뢰 경계

```text
현재
Desktop main (Host 자격, 계정, Native 파일/관리 IPC)
  +-- setup/registry/preview BrowserWindow
  +-- 단일 Workspace BrowserWindow (Core Layout + Plugin UI ESM)
  +-- Owner Host/Core (인증, DB, Plugin host services)
       +-- Plugin별 공유 Node Worker -- 여러 Workspace 문맥
       +-- Run / Job / Event / State / Plugin DB
       +-- Agent adapter / Node dispatch -- CLI/자식 프로세스

목표
신뢰된 Core broker + Native System UI (Plugin 코드 비로딩)
  +-- Workspace별 실행/데이터/정책 경계
  +-- 여러 Plugin UI/헤드리스 실행 -- 제한된 capability transport
  +-- 선택적 Primary 기본 Shell / 여러 Extension
  +-- 공통 Preview 서비스 -- 별도 테스트 데이터/권한
```

| 층위 | 현행 소유 경로 | 목표에서 유지 / 재배치 |
| --- | --- | --- |
| Core Runtime | `external/sps-core/server/src/services/plugin-loader.ts`, `plugin-host-services.ts`, `sps-plugin-execution.ts` | lifecycle/인증/실행/기술 기록 유지. workflow 의미 추가 금지 |
| Core UI | `external/sps-core/ui/src/App.tsx`, `components/Layout.tsx`, `pages/SpsCoreWorkspaceHome.tsx` | 필수 업무 Shell 대신 시스템 UI/선택적 호환 화면으로 재배치 |
| Desktop Native | `sps-server/desktop/src/main.mjs`, `workspace-preload.cjs` | 독립 관리/복구와 다중 창 broker. 현재 Host renderer bridge를 비신뢰 UI와 분리 필요 |
| Plugin SDK | `external/sps-plugin-sdk`, Core 내부 `packages/plugins/sdk` | 공개 계약과 내부 RPC 양쪽 동기화. 선택적 사용, additive version negotiation |
| Builder | `sps-server/sps-plugin-discovery/src/builder-chat.js`, `src/ui` | Lead/Worker/제작 흐름은 Plugin 유지. 필수 첫 화면/Agent 강요 제거 대상 |
| Preview | `sps-server/desktop/src/plugin-preview-runtime.mjs`, Native developer IPC | 기존 DB/포트/fixture 분리를 재사용. 공개 수명주기 API와 악성 코드 sandbox는 미완성 |
| 외부 Plugin | manifest worker/UI + Core capability | 업무 자유 유지. Core 관리 권한/타 Workspace 자원은 직접 부여하지 않음 |

## 5. GAP-01~15 매트릭스

상태: `구현됨`은 적힌 좁은 기능의 존재, `일부`는 목표 일부만 충족,
`없음`은 열람·검색 범위에서 목표 계약을 찾지 못함, `충돌`은 기존 동작과 목표가
다름, `미확인`은 실증/운영 확인이 필요함을 뜻한다. 테스트 보유와 이번 실행은 구분한다.

| GAP | 상태 | 코드 근거와 현재 동작 | 영향 / 난도 |
| --- | --- | --- | --- |
| 01 고정 메뉴 | 충돌 | `external/sps-core/ui/src/components/Sidebar.tsx:175`, `:201` baseline에도 Dashboard/Inbox 고정 렌더 | Plugin 전용 Shell 불가. Native 복구 확보 후 선택화 / 중 |
| 02 초기 진입 | 일부·충돌 | `external/sps-core/ui/src/App.tsx:190`, `:210`, `external/sps-core/ui/src/lib/workspace-shell-route.ts:8` Shell 경로 선택은 있으나 기본 fallback은 Dashboard | 빈 정상 시작 화면으로 fallback 분리, deep link 보존 / 중 |
| 03 Agent 강제 | 충돌 | `external/sps-core/ui/src/pages/SpsCoreWorkspaceHome.tsx:138` Home/Dashboard가 열린 상태에서 Agent 조회 성공·refetch 종료·미종료 Agent 0개이면 등록으로 이동. terminated-only도 포함. `SpsCoreWorkspaceHome.test.tsx:223`도 그 동작 보호 | Plugin 기본 경로 등 모든 진입에서 발생하는 것은 아님. 단순 버그 수정이 아니라 수용 기준 변경 / 낮음~중 |
| 04 Core 도메인 UI | 충돌 | `external/sps-core/ui/src/pages/SpsCoreWorkspaceHome.tsx:225`, `:261` Agent 목록/추가와 Dashboard; `components/Layout.tsx:578` Core rail 유지 | 기술 Agent backend는 유지하고 UI 의무성만 제거 / 중 |
| 05 Primary/Extension | 일부 | `external/sps-core/server/src/services/sps-workspace-surfaces.ts:186`, `:245` 한 Shell/neutral 선택 저장은 이미 존재. `plugin-company-activation.ts:29` 활성화 독립. `packages/shared/src/types/plugin.ts:768` Worker 필수/UI 선택 | 분류/독립 창/전체 Shell/Primary 없음의 완성은 없음. 헤드리스 기반은 있으므로 전부 미구현 아님 / 높음 |
| 06 기존 Shell 계약 | 충돌·재사용 | `external/sps-core/server/src/services/sps-workspace-surfaces.ts:162`; `ui/src/components/Layout.tsx:138`, `:578`. 기존 문서 `WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md:20`은 공통 Shell/고정 복구 메뉴 전제 | 기존 UI capability/API/DB 유지, vNext 선택 계약 추가 / 높음 |
| 07 Worker 공유 | 구현됨·목표 충돌 | `external/sps-core/server/src/services/plugin-worker-manager.ts:1366`, `:1382`, `:1427` Plugin ID 기준 1 worker. SDK `host-client-factory.ts:640` invocation scope 검사 있음 | 논리 RPC 경계와 OS/메모리/종료 경계는 다름 / 매우 높음 |
| 08 Preview | 일부 | `sps-server/desktop/src/plugin-preview-runtime.mjs:342`, `:394` build별 Vault/포트/DB; `main.mjs:2560` 별도 창. 공개 SDK `preview/fixtures-v1.mjs:154`는 fixture 계약 | reusable 내부 기반은 있음. 범용 공개 create/start/stop API·악성 코드 OS 격리는 아님 / 중~높음 |
| 09 Native 복구/다중 창 | 일부 | `sps-server/desktop/src/main.mjs:3982`, `:5086`, `:4878` tray/background/autostart 있음. `:241`, `:3759` Workspace 창 단일 변수/재사용; registry 별도 창 `:3666` | 전체 Core 독립 설정창/Workspace 다중 창/항상 가능한 전역 설정 단축키는 미완성. 메뉴 accelerator를 globalShortcut과 혼동 금지 / 높음 |
| 10 Vault | 충돌·미확인 | `external/sps-core/server/src/services/plugin-worker-manager.ts:736`, `external/sps-core/server/src/secrets/local-encrypted-provider.ts:48`; Desktop `main.mjs:353` safeStorage. `external/sps-core/server/src/services/plugin-secrets-handler.ts:235` 원문 resolve는 비활성 | 새 OS 위협 모델 보호 증거 없음. 실제 사용자 비밀은 읽지 않음 / 매우 높음 |
| 11 최대 파일 범위 | 일부·충돌 | `external/sps-core/server/src/routes/sps-workspace-sources.ts:47` Host Source 관리; `sps-server/desktop-node/src/command-runner.mjs:195`, `:552` cwd/승인/실행. 최대 allow-roots OS 정책은 찾지 못함 | Source grant/cwd를 sandbox로 재명명하면 안 됨. 미지원 runtime 거부 계약 필요 / 매우 높음 |
| 12 Plugin 데이터 | 일부 | `external/sps-core/server/src/services/plugin-state-store.ts:22`, `:229` scoped KV/Plugin 전체 삭제. `plugin-database.ts:429` Plugin schema. `plugin-registry.ts:263` uninstall 보존/삭제. Desktop `owner-vault-transfer.mjs:199` 고정 allowlist Host transfer | Workspace+Plugin 단위 범용 private 파일 reset/일관된 backup/restore는 미완성. Host SQL dump와 portable Workspace export 구분 / 높음 |
| 13 실행 제어 | 일부·중요 충돌 | `external/sps-core/server/src/services/plugin-job-scheduler.ts:375`, `:662`, `:815` Workspace job/상태 취소/재시작 보정. `sps-agent-session-runs.ts:68` durable 취소, `sps-plugin-execution.ts:433` Run 취소 | 모든 실행 종류의 Workspace pause/stop 저장·admission fence·실제 종료·resume no-replay 통합은 없음. Job 취소는 OS 종료 아님 / 매우 높음 |
| 14 진단/동의 | 일부·미확인 | `sps-server/desktop/src/owner-host-config.mjs:136` local logs/telemetry off. `external/sps-core/server/src/telemetry.ts:13`, `external/sps-core/packages/shared/src/telemetry/client.ts:12` legacy telemetry. `external/sps-core/packages/db/src/schema/companies.ts:23` feedback consent 필드 | SPS 동의 UI·영속 전송 큐·redaction·개발자 집계의 통합 완료 근거 없음. standalone Core 기본 telemetry도 별도 점검 / 중~높음 |
| 15 SDK/업데이트/통신 | 일부 | `external/sps-core/packages/shared/src/validators/plugin.ts:994`, `:1015` host 최소 버전/의존성, `server/src/services/plugin-dependencies.ts:129` 검증. 공개 `ui/bridge.mjs:37` hook, `preview/fixtures-v1.mjs:154` fixture | Native open-settings/public Preview lifecycle/승인된 cross-Workspace 호출은 별도 계약 필요. Desktop `update-service.mjs:2`, `:150` 자동 종료 설치는 새 선택 적용 목표와 충돌 / 높음 |

### 신규 목표와 별도로 발견한 불일치

- **로컬 인증:** `sps-server/desktop/src/main.mjs:1698`, `:3740`, `:4670`은 loopback
  Host도 SPS Identity 계정을 요구한다. 첫 Workspace 자동 생성은 `:3182`에 있지만
  로그인/Host 생성 뒤다. 새 목표의 로컬 단독/인증 선택을 구현 완료로 볼 수 없다.
- **업데이트:** `mandatory:false`여도 `automaticInstall:true`이다. 강제 업데이트가
  아니라는 것과 사용자가 적용을 선택한다는 것은 다르다. `Later`도 종료 시 자동
  설치하는 현재 동작(`desktop-update-controller.mjs:97`)을 바꿀 계획이 필요하다.
- **문서 드리프트:** `WORKSPACE-PLUGIN-ACTIVATION.md`의 Host-only jobs 제한은
  `plugin-job-scheduler.ts:375`의 현재 Workspace jobs와 불일치한다. Workflow 문서의
  단계별 미구현 표도 기존 Shell 선택 API/활성화 primitive와 구분해 갱신해야 한다.
- **공유 DB:** Plugin schema는 Plugin별이지 자동 Workspace별 별도 DB는 아니다.
  플러그인 임의 SQL/파일에 Workspace 경계를 Core가 강제하려면 추가 계약이 필요하다.
- **UI 권한:** 현재 Plugin ESM이 Host renderer와 같은 JS world에 로딩된다.
  Electron context isolation이 Plugin JS와 Core UI를 서로 분리하는 것은 아니다.
  악의적 Plugin UI의 관리 API/IPC 접근 실증은 미수행이며 P0 PoC 대상이다.
- **비밀 전달:** `external/sps-core/server/src/services/plugin-loader.ts:147`, `:200`은
  선언된 특권 capability와 실제 Host 환경값에 따라 공급자 key/memory token/local
  Host access token을 전달한다. `secrets.resolve`가 비활성이라는 사실만으로 모든
  원문 전달 경로가 사라진 것은 아니다. 실제 운영 비밀은 열람하지 않았다.

## 6. 재사용할 기반과 새로 필요한 것

| 구분 | 판단 |
| --- | --- |
| 좁은 기능이 이미 존재 | 패키지/manifest 검증, Workspace 활성화, 의존성 충돌 검사, optional UI Worker, namespace state/DB, job scope, 실행 기록/사용량 근거 구분, Run 단위 취소, tray/Host transfer/Preview |
| 개선 필요 | Native 독립 관리, 기본 라우팅, UI 권한, 공개 Preview, data reset/백업, 작업 중 업데이트, SDK 협상/다중 창 |
| 목표 계약을 찾지 못함 | OS 단위 Workspace 파일 sandbox/Vault broker, 전체 실행 lane admission/stop epoch, 범용 Workspace-private 파일 root/초기화, 명시적 cross-Workspace RPC grant |
| 계속 Plugin 책임 | Lead/Worker/조직 역할/업무 승인/재배정/프로젝트 작업 폴더 UI/도메인 기억·평가·Dashboard·Inbox 의미 |

기존 Run/Event/Artifact/usage summary를 다른 Task 시스템으로 교체하지 않는다.
CPU/RAM 고사용이나 업무 오류 횟수에 의한 자동 Workspace 중지는 새로 도입하지
않는다. Worker 프로세스 crash backoff/재시작 제한은 기술 안정성 통제이므로 업무
실패 재시도와 별도로 유지·정의한다.

## 7. 테스트와 증거

이번 실행 결과만 현재 감사의 직접 검증으로 표시한다. 테스트는 기존 임시 fixture를
사용하며 사용자 Host/계정/프로젝트에 연결하지 않았다.

Luna `gpt-6-luna` / `xhigh`에 읽기 전용 UI·Native 교차 감사를 맡기고 총괄이 코드
근거와 문서 수정안을 검수했다. 초기 사용량 한도 후 재시도한 좁은 감사/문서 검토는
완료됐다. 위임 도구에 Fast/service-tier 지정 항목이 없어 Fast 적용을 보장하지 않는다.

| 실행 위치 | 정확한 명령 | 이번 결과 |
| --- | --- | --- |
| `sps-server/desktop` | `node --test test/window-security.test.mjs test/workspace-sources.test.mjs test/developer-command-runner.test.mjs test/owner-vault-transfer.test.mjs test/plugin-preview-runtime.test.mjs test/plugin-preview-main-contract.test.mjs test/release-baseline.test.mjs` | 46/46, skip 0 |
| `external/sps-plugin-sdk` | `node --test profile/extension-profile-v1.test.mjs profile/extension-profile-v2.test.mjs manifest/index.test.mjs dependency/v1.test.mjs ui/bridge.test.mjs preview/fixtures-v1.test.mjs` | 35/35, skip 0 |
| `external/sps-core` | `pnpm exec vitest run server/src/__tests__/plugin-secrets-handler.test.ts server/src/__tests__/plugin-worker-manager.test.ts --maxWorkers=1` | 14/14 |
| `external/sps-core` | `pnpm exec vitest run server/src/__tests__/sps-workspace-surfaces.test.ts server/src/__tests__/plugin-dependencies.test.ts server/src/services/plugin-company-activation.test.ts ui/src/pages/SpsCoreWorkspaceHome.test.tsx ui/src/components/Sidebar.test.tsx ui/src/lib/workspace-shell-route.test.ts --maxWorkers=1` | 56/56, 6 files. Node localStorage experimental warning 있음, 실패/skip 없음 |

현재 테스트가 Agent 0개 리다이렉트/고정 메뉴를 보호한다는 점이 중요하다. 현행
테스트 통과는 새 설계 충족 증거가 아니다. 수용 기준 변경과 호환 회귀를 함께
추가해야 한다.

### 과거 이력과 이번에 하지 않은 것

- `BUILDER-TEAM-VERIFICATION-2026-10-24.md`의 실 CLI v9 성공은 runtime Source
  `c235c481a159a860ffbd69e0e721b8573d48714c`와 동일 Core/SDK에 결속된 개발
  fixture 검증이다. 이후 `174e7508`까지 문서 변경 이력이 있으며, 이번에 재실행하지
  않았다. 새 OS 격리/Primary/다중 창 계약의 증거로 재사용하지 않는다.
- 과거 Desktop 487/Builder 46/Core React bridge 17 결과도 이번 전체 재실행은 아니다.
- 전체 Core `pnpm -r typecheck`, `pnpm test:run`, `pnpm build`, 전체 Desktop/SDK,
  실제 Electron 조작, 설치본 E2E, 온라인 Member, OS 보안 PoC, 현재 의존성 감사,
  Identity 운영 배포, GitHub CI/보호 규칙/Stable/코드 서명은 이번에 실행하지 않았다.
- Zod 및 빌드 공급망 보안 문제는 `ZOD-MIGRATION-IMPACT-2026-10-24.md`의 별도
  보류 사안이다. 정책/자문은 변할 수 있어 이 감사로 현재 보안 게이트 통과를
  주장하지 않는다. 릴리스 전 별도 최신 재실행이 필요하다.

### 승인 후 사용 가능한 기존 명령

- Desktop: `npm test`, `npm run test:e2e:bootstrap`,
  `npm run test:e2e:workspace-surfaces`, `npm run test:e2e:plugin-preview:team`,
  `npm run test:e2e:host-plugin-lifecycle`.
- Core: `pnpm -r typecheck`, `pnpm test:run:general`,
  `pnpm test:run:serialized`, `pnpm build`, `pnpm check:sps-compat-boundary`.
- Builder: `npm run check`는 build도 수행한다. 이번 read-only 감사에서는 실행하지 않음.
- SDK: `npm test`. 새 API는 공개 SDK와 내부 SDK/Host RPC를 같이 검사해야 한다.

문서 검사와 Git 상태 확인을 제외하고 위 목록 전체를 실행했다고 해석하면 안 된다.

## 8. 첫 구현 제안

**최초 PR은 Native 복구 접근만 추가하고 기존 Shell은 유지**한다. 동시에 별도
테스트 프로필에서 격리 PoC를 승인받는다. 이후 Agent 0개/빈 Workspace를 먼저
정상화하고 Primary/Extension의 선택형 화면으로 옮긴다. Vault/실행 격리를 검증하지
않은 상태에서 '안전한 임의 Plugin 실행'으로 배포하지 않는다.

세부 변경 파일/API/DB/호환성/롤백/승인 질문은
[CORE_PLUGIN_ARCH_MIGRATION_PLAN.md](CORE_PLUGIN_ARCH_MIGRATION_PLAN.md)에 있다.
