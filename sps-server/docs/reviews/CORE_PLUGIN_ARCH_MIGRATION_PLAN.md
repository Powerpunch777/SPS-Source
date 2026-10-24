# Core / Plugin 비파괴 이전 계획

기준일: 2026-10-25 KST. 상태: 사용자 구현 승인, 단계별 진행 중.

이 계획은 [현행 감사](CORE_PLUGIN_ARCH_GAP_AUDIT.md)와
[보안 실현 가능성](CORE_PLUGIN_SECURITY_FEASIBILITY.md)을 기반으로 한다.
새 목표 전체를 구현 완료로 표시하지 않는다. Phase 0 감사는 당시 고정 리비전의
기록으로 유지하고, 후속 구현과 검증은
[진행 기록](CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md)으로 구분한다.

## 1. 우선순위와 적용 원칙

| 순위 | 범위 | 근거 |
| --- | --- | --- |
| P0 | Native 복구 접근, UI/Worker/Vault/파일 범위 보안 실현 가능성 | 필수 Shell을 먼저 없애면 복구를 잃고, 잘못된 sandbox 약속은 피해를 키움 |
| P0 | 공유 Worker와 Workspace stop/실제 종료의 설계 검증 | DB 상태 취소만으로 외부 실행 종료와 B 무영향을 보장할 수 없음 |
| P1 | 빈 Workspace, 선택형 Shell/Agent UI, Primary/Extension, 공개 선택 API | 핵심 제품 방향. 기존 primitive로 구현 가능하므로 전면 재작성 불필요 |
| P1 | 실행 정책 영속화/세대 fence, Workspace-private 데이터/복구 | 중지 후 자동 재시도와 잘못된 범위 초기화 방지 |
| P2 | 다중 창 운영, 관측/공유 자원 표시, 선택 적용 업데이트, 동의 기반 진단 | 신뢰 경계 위에서 운영 편의 완성. 자동 quota/네트워크 제한 추가는 아님 |
| 별도 | 보안 의존성/서명/운영 Identity/Linux CI/실제 두 PC 검증 | 새 아키텍처와 별도의 릴리스 게이트. 보류 중 Zod 전환을 이 작업에 묶지 않음 |

보안 PoC는 기존 제안의 Phase 4까지 미루지 않는다. **조사/실증을 초기 P0에서**
하고, 검증한 launcher/broker의 제품 통합은 후속 단계에서 한다. PoC가 실패하면
후속 PR의 API/프로세스 설계를 바꿔야 하므로 기본 전제로 고정하지 않는다.

## 2. PR 단위 실행 계획

아래 새 파일명/API/테이블명은 제안이다. 구현 착수 전 각 PR의 범위와 계약을
확정한다. 서로 독립적인 문서/Native 작업과 보안 PoC는 병행할 수 있지만,
보안/SDK 확정 전 플러그인 무제한 실행을 안전한 것으로 배포하지 않는다.

| PR | 변경 범위 / 주요 대상 | 난도 / 선행 | 검사와 완료 조건 | 롤백 |
| --- | --- | --- | --- | --- |
| A 문서/수용 기준 | 이 감사 3종 검토 후 Core `doc/SPS-CORE-CONTRACT.md`, Source `PRODUCT-ARCHITECTURE-ko.md`, `WORKFLOW-AND-EXTENSION-PLUGIN-PLAN-ko.md`, `WORKSPACE-PLUGIN-ACTIVATION.md`, `WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md` 정합성 | 낮음 / 사용자 범위 승인 | 현행/목표/호환 상태 구분; Host-only jobs 같은 stale 내용 정리; 버전 증거 유지 | 문서만 revert |
| B Native Recovery v1 | Desktop `main.mjs`, `window-security.mjs`, `workspace-preload.cjs`; 새 settings window/controller/preload 및 작은 Native recovery policy store | 중~높음 / A, 관리자 권한 원칙 확인 | tray/단축키/독립 설정창; Workspace 창 없음·plugin throw·Core start 실패에도 상태/로그/복구 접근; Plugin 코드 미로딩; 제한된 IPC sender/권한 검사 | 기존 Shell 유지, 새 Native 진입만 비활성화 |
| C Security PoC | 별도 throwaway Windows 프로필의 helper/broker/launcher 실험과 지원표. 제품 Vault/ACL/설치 프로그램 변경 금지 | 매우 높음 / A, 시험 권한 승인 | Vault/DB/IPC/파일/자식/CLI/UNC/A-B 격리 canary 검증; 근거 없으면 미지원 판정 | 테스트 프로필/서비스만 지정 경로에서 정리, 제품 코드 영향 없음 |
| D Empty Workspace v1 | Core `App.tsx`, `components/Layout.tsx`, `Sidebar.tsx`, `pages/SpsCoreWorkspaceHome.tsx`, `lib/workspace-shell-route.ts`; Builder 초기 Agent 연결 UX | 중 / B | 0 Agent/terminated-only/0 Primary/0 Extension, Agent 조회 오류와 빈 성공 구분, Builder 비활성 상태, 기존 deep link/API/기억·Agent 설정 보존 | 새 경로 기능 flag 롤백, 기존 저장값 그대로 |
| E Manifest/Primary vNext | Core shared types/validators, `sps-workspace-surfaces.ts`, `plugin-company-activation.ts`, `routes/plugins.ts`; 공개 SDK profile/manifest/ui/dependency | 높음 / C 결과, D | Primary null/최대 1개, Extension 다중/headless/전용 화면, 설정 열기 API 미사용 패키지도 통과; 호환성/의존성 거부/원자적 선택 | additive 계약/필드만; 기존 API adapter 유지, flag 복귀 |
| F-UI Renderer authority | Core `ui/src/plugins/slots.tsx`, Plugin bridge/백엔드 capability transport; Desktop `window-security.mjs`, `workspace-preload.cjs`, Native sender 검증 | 매우 높음 / B/C/E | 비신뢰 Plugin UI를 신뢰된 Core 세션/DOM/관리 preload와 분리. 별도 origin/partition/renderer 또는 검증한 격리 view + 제한 RPC. 악성 UI fixture의 ambient cookie fetch/관리 IPC/다른 Plugin 접근 실패, Native 설정은 정상 | 새 보호 UI 지원 미달 Plugin은 명시적 거부/승인된 legacy lane. same-renderer로 무음 복귀 금지 |
| F Runtime isolation | `plugin-worker-manager.ts`, `plugin-loader.ts`, 내부 SDK host-client/protocol/RPC, Native launcher/broker, Node command-runner/lease/completion | 매우 높음 / C, E 실행 계약 | Host 패키지 1회 설치 유지; Workspace/Plugin execution instance 분리; 동시 A/B·crash·강제 종료·Vault/파일 OS 테스트 | 새 실행 drain 후 이전 trusted lane으로 명시 복귀. 보호된 실행을 무음 downgrade하지 않음 |
| G Workspace execution control | 새 runtime policy service/table, `sps-plugin-execution.ts`, `sps-agent-session-runs.ts`, job scheduler/store/event delivery, Node dispatch, generic SDK | 매우 높음 / F 또는 동등한 lane별 종료 증거 | pause/stop/resume 영속, admission 직전/claim 직전 fence, 취소 acknowledgement, 재시작/오프라인 Node, future schedule만 실행, B 무영향 | pause/drain; 정책/취소 마커 보존. 구 Host가 새 제어 상태를 무시하면 구 버전 실행 금지 |
| H Data lifecycle | `plugin-state-store.ts`, `plugin-database.ts`, `plugin-registry.ts`, `routes/plugins.ts`, `owner-vault-transfer.mjs`, portability/backup 경로; workspace-private data root | 높음 / F/F-UI/G 경계 | A-X reset에 B-X/A-Y/외부 프로젝트/Vault 보존; preview 영향 없음; 중단 일관성; export→빈 Host restore→재연결 검증 | staging/journal/snapshot 복원; 파괴적 down migration 금지 |
| I Generic Preview | 기존 `plugin-preview-runtime.mjs`, developer IPC/controller, 공개 SDK `preview`/diagnostics, Builder transport adapter | 중~높음 / E/F 보안 계약 | Builder 아닌 외부 제작 도구도 start/reload/stop/diagnostics; production 계정/DB/등록 grant 재사용 없음; mock/live 구분; 기존 실제 CLI v9 회귀 | 기존 Desktop 내부 Preview adapter 유지; 새 공개 계약만 비활성화 |
| J Multiwindow/operations | Desktop `main.mjs` 단일 window/profile 상태 분리, 창 registry, runtime 수명주기, Native 설정창 | 높음 / B/F/F-UI/G | A 실행 중 B/같은 A 다중 창, close != stop, 명시적 앱 Quit 시 Host 종료(트레이/앱 메뉴), 계정 전환/세션/초대의 창 문맥 혼선 없음 | 새 창 생성 차단/기존 창 정리; Host 작업 임의 종료 금지 |
| K Updates/diagnostics | `update-service.mjs`, `desktop-update-controller.mjs`, Native settings, Core telemetry config/client 분리 | 중~높음 / B/G/H | 자동 check/download와 apply 분리; Later/quit 설치 금지; 활성 실행 보호/호환/rollback; 동의 off 네트워크 업로드 0, redaction/보존/전송 큐 회귀 | 이전 후보로 가되 사용자 데이터 보존, 자동 설치 재활성화 금지 |
| L Ecosystem | Builder/Preview 공개 준비, Marketplace scan provenance/SDK 문서, 외부 provider 백업 hook | 중 / 앞 단계, 별도 공개 범위 승인 | 공개 source/dependency/secret 검사, exact version/hash scan 증거와 한계; 로컬 미검증 자기 Plugin 허용 정책 유지 | 공개 API compatibility 유지, 검토/배포만 중단 |

처음에는 **B만 제품 코드 PR로 착수**하고 C는 별도 PoC로 분리하는 편을 권한다.
D에서 화면 제거는 B의 실제 실패 복구 테스트 통과 뒤에만 한다. B의 최소 복구
기능은 플러그인 시작 차단/격리 기동, 진단, 백업 점검을 포함해야 하며, Core DB가
죽었는데 일반 HTTP 설정 페이지를 띄우는 것만으로 완료 처리하지 않는다.
B만으로 기존 same-renderer UI/Worker의 보안 경계가 완성되는 것은 아니다.
과도기의 관리 bridge와 특권 환경변수 전달은 C/F/F-UI의 명시적 검토 대상으로 남긴다.

## 3. API / SDK 변경안

| 계약 | 재사용 | 추가안 / 호환 규칙 |
| --- | --- | --- |
| Native system entry | 기존 Host-only IPC/registry window | 선택적 `openCoreSettings({section})` 유사 API. section allowlist/호출 창/주체 확인; 관리 mutation 권한은 주지 않음 |
| Primary | 기존 single Shell provider/neutral 저장 | null 허용 및 full-shell entry mode, 화면 default만 선택. Extension 권한과 분리. 설치/활성화/선택은 각각 다른 동작 |
| Plugin dependencies | 기존 required/optional/services/conflicts/impact report | Workspace 활성 여부 재검증. 검색/선택을 자동 설치/활성화로 해석하지 않음 |
| Execution | 기존 Run/Job/Event/Artifact/취소/usage DTO | 실행 instance/권한 문맥/정책 세대/종료 증거, Workspace 기술 상태 read/control. Task/Lead/Worker 정책 없음 |
| Data | scoped state/Plugin DB/Host transfer | Core-managed `(Workspace, Plugin)` private root/backup manifest/reset scope, shared 영역 별도 opt-in |
| Preview | fixture-v1/diagnostics/독립 Host manager | 인증된 create/start/reload/stop/status transport; runtime isolation 지원표. Builder는 소비자 중 하나 |
| Plugin IPC | scoped RPC/event primitives | 같은 Workspace 호출의 caller/target/capability 검증, cross-Workspace는 명시적 grant/대상/audience/취소 정책 추가 |
| Version compatibility | API 1/최소 Host/legacy profile | additive host feature negotiation과 공개/내부 SDK 동시 반영. 오래된 Host는 모르는 필수 기능을 거부하고 무음 무시하지 않음 |

Native 관리 권한은 Plugin SDK의 일반 capability처럼 배포하지 않는다. UI를 여는
권한과 실제로 설치/초기화/보안 정책을 바꾸는 권한을 구분한다. Header/sidebar나
설정 버튼의 존재를 패키지 합격 조건으로 만들지 않는다.

## 4. DB / 파일 저장과 이전

### 추가 저장 후보

- Workspace runtime policy: `running/paused/stopped`, policy generation,
  filesystem mode/허용 경로 식별자, 변경 주체/시각. 기존 Company `status`를
  무작정 새 stop 의미로 재해석하지 않는다.
- Execution instance/admission: Run/Job/Agent-session lane, Workspace/Plugin/Node,
  admitted generation, cancellation/termination evidence, retry lineage와 schedule
  occurrence. 기존 행은 nullable/legacy 표기로 두고 안전성을 소급 주장하지 않는다.
- Workspace Plugin data inventory: 전용 root/스키마/backup format version,
  외부 provider hook, shared 여부, reset/restore journal.
- Primary selection은 기존 Shell 테이블을 먼저 재사용할 수 있는지 검토한다.
  두 선택값을 무기한 dual-write하는 새 테이블은 피한다.

현행 Plugin 전체 SQL schema에서 Core가 임의 업무 테이블의 Workspace 경계를
추측해 삭제해서는 안 된다. 새 private 저장소는 `(Workspace, Plugin)` 단위의
root/schema/DB 자격 중 검증한 방식을 쓴다. 기존 공유 schema는 Plugin migration
hook 또는 명시적인 공유 데이터 분류가 필요하다. 다른 Workspace 행이 들어 있는
전체 schema를 한 Workspace export에 넣거나 단일 Workspace reset에서 지우지 않는다.

### 이전 절차

1. 임시 fixture에서 현재 DB/설정/manifest/Source/Builder 프로젝트/Preview 데이터를
   inventory한다. 실제 사용자 데이터의 원문을 감사 문서에 복사하지 않는다.
2. 패키지/데이터 위치와 민감 정보 영역을 분리하는 버전형 manifest를 만든다.
   기존 `owner-vault` 전체 이동이나 일괄 삭제부터 하지 않는다.
3. 기존 Agent/프로젝트/Room/Inbox/대화 기록을 유지한다. Workspace ID를 재발급하거나
   workflow 역할을 Core 권한으로 승격하지 않는다.
4. 새 capability/정책은 versioned additive migration으로 생성하고 구 API는 adapter를
   통해 읽는다. 기존 `companyActivation.defaultEnabled` fallback을 일괄 false로
   바꿔 설치된 Plugin을 조용히 끄지 않는다.
5. 새 Workspace는 Agent/Primary 없이 시작할 수 있게 하되 기존 Builder 연결은
   유지한다. 기존 Shell 선택을 Primary 후보로 preview하고 Host가 확인한다.
6. 변경 전 백업을 검증하고 staging copy로 migrate→validate→promote한다. promotion
   실패/전원 손실/중복 실행은 journal로 복구한다. 비밀/외부 경로는 dump에 무음 포함하지 않는다.
7. 구 버전이 새 보안/stop 정책을 무시할 수 있으면 downgrade를 거부한다. 예전
   설치본으로 돌아가는 것과 안전한 데이터 rollback은 동일하지 않다.

Workspace portable export, 전체 Host SQL transfer, 외부 프로젝트 백업은 서로
다르다. Host dump가 Plugin DB 행을 포함할 수 있어도 임의 Plugin 파일과 외부
provider까지 복원한다는 뜻은 아니다. 새 백업 포맷은 포함/제외/재연결 대상을
사용자가 확인하고, 기존 '빈 Host에만 restore' 계약은 별도 승인 없이 넓히지 않는다.

## 5. 실행 제어 상세

```text
running --pause--> paused   : 신규 admission 거부, 기존 실행 유지
running/paused --stop--> stopped : 신규 거부 + 해당 Workspace 관리 실행 취소 요청
paused/stopped --resume--> running : 앞으로의 신규 허용, 과거 취소 실행 복제 금지
```

- policy 변경을 DB에 먼저 확정하고 dispatch/claim/Worker 호출/Node lease에서 다시
  검사한다. 이미 admitted 된 작업의 race, 오프라인 Node와 Host 재시작을 포함한다.
- HTTP 취소 성공/DB cancelled와 OS 종료 확인을 분리한다. Job RPC에는 현재
  cooperative cancel이 없으므로 새 토큰/ack 또는 전용 instance 종료가 필요하다.
- retry ID를 새로 만들었다는 이유로 이전 취소 작업을 허용하지 않는다. admission
  generation/신뢰된 실행 문맥/lineage를 적용한다. Plugin이 성공 여부를 판단하거나
  향후 업무를 배정하는 선택은 그대로 Plugin에 남긴다.
- 중지 기간의 cron backlog를 resume 때 쏟아내지 않는다. 정책 watermark 이후의
  정규 occurrence만 새로 허용하는 방식과 수동 재개를 시험한다.
- 공유 Worker/외부 daemon에서 완전한 A-only 종료가 안 되면 pending/unsupported를
  표시하고 안전한 실행 경로로 제한한다. 단순 timer로 종료 확인을 꾸미지 않는다.
- 전용 프로세스/Run 측정과 Core/공유 Worker 사용량은 분리 표시한다. quota나
  CPU/RAM 고사용 자동 중지는 이번 설계에 추가하지 않는다.

## 6. 검증 게이트

각 PR은 영향 범위 focused tests부터 실행하고 최종 통합 시 기존 전체 typecheck /
test / build와 격리 Electron E2E를 수행한다. 작은 PR이 단독으로 새 전체 설계의
완료/Stable 증거가 되지 않는다.

| 단계 | 필수 시나리오 |
| --- | --- |
| B/D | Plugin throw/hang/crash, Host 미기동, Workspace 창 닫힘, 전역 단축키 충돌, safe-mode 복구, zero-Agent 성공과 조회 오류 분리 |
| E | Primary 없음/교체/삭제/호환 불가, Extension 여러 개/headless/전용 창, settings API 미사용, 오래된 manifest/SDK 소비자 |
| F/G | 실제 Windows Worker→CLI→손자 실행; canary Vault/파일 우회, A stop·B 유지, restart 후 pause 유지, offline cancellation, old-run 자동 재실행 금지 |
| F-UI | Plugin JS에서 Core 관리 bridge/세션/DOM/다른 창에 직접 접근 실패. 허용된 선택 SDK RPC는 성공. iframe/CSS 격리라는 이름만으로 보안 통과 판정 금지 |
| H | A-X만 reset, 모든 Workspace-X 별도 확인, disable/update 보존, uninstall retain/delete, 외부 프로젝트 제외, backup/restore interruption/재연결 |
| I/J | 기존 Builder 실제 Lead→Worker→Preview→repair→Host 수동 설치; 동일 archive hash, 별도 UI 실패에 main 생존; 같은/다른 Workspace 창 문맥 |
| K | Later 후 Quit 설치 안 함, 일하는 동안 apply 대기/명시 취소, consent 없음 요청 0, secret/path redaction, queued report 취소/삭제 |
| 배포 | 최신 의존성 감사, 정확한 Source/Core/SDK와 설치본 SHA, 서명, 동일 바이트의 실 Host/Member 두 PC, Linux 전체 회귀/Identity 운영 조건 별도 검증 |

A/B 무영향은 지정 시나리오에서 취소·프로세스 종료·데이터 변경이 다른 Workspace로
전파되지 않는다는 기준이다. quota 없는 공유 Host에서 악성 CPU/RAM/디스크 고갈에
대한 가용성까지 보장하는 것으로 넓히지 않는다. 악성 Node의 OS/서명키가 침해된
경우 로컬 PoC만으로 원격 실제 종료를 보장할 수 없다. Host 측 서명/주체/lease/
grant 범위 검증과 원격 ack의 신뢰 한계는 별도 프로토콜 게이트로 검사한다.

이번 Phase 0에서 수행한 검사는 현행 감사의 표만 해당한다. 이후 테스트 계획을
과거 테스트 결과로 표시하지 않는다.

## 7. 승인된 결정과 후속 확인

이미 확정된 Plugin 자유도/Primary 0개/Native 복구/파일 제한 목표를 다시
질문하지 않는다. 아직 선택하지 않은 실현 방식과 구현 범위만 확인한다.

1. **최초 구현 범위 승인:** 전체 계획을 순차 진행한다. B(Native 복구 v1)와
   별도 C(격리 PoC)를 먼저 수행하고, 기존 Shell 제거는 복구 검증 뒤로 둔다.
2. **격리 실증 권한 승인:** 실제 데이터와 분리된 시험용 환경에 한해 계정,
   native helper, 서비스 및 관리자 권한 시험을 허용한다. 제품의 필수 관리자
   설치 여부는 아직 결정하지 않는다. 첫 실험은 임시 AppContainer 프로필과
   가짜 canary만 사용하며 실제 사용자 Vault/CLI 계정을 건드리지 않는다.
3. **기존 Plugin 전환 승인:** 기존 신뢰 실행을 명시적으로 선택한 경우에만
   한시 유지한다. 새 보호 모드는 미지원 Plugin을 차단한다. 이 정책은 F/F-UI의
   수용 기준이며, 현재 recovery flag나 AppContainer canary가 이미 보호 모드를
   구현한 것은 아니다. 무음 downgrade는 금지한다.

로컬 단독 인증의 기존 계정 매핑/나중 원격 계정 연결, 교차 Workspace grant UI,
단축키 실제 조합, 공개 Preview/Builder 라이선스는 관련 PR/실증 시점에 구체화한다.
라이선스/마켓 판매 정책은 이번 기술 감사에서 결정하지 않는다.

## 8. 이번 단계의 종료 조건

- GAP-01~15를 경로·줄·현재 동작으로 분류하고 미확인을 숨기지 않는다.
- 가장 위험한 충돌, 재사용할 기능, OS 대안/한계/실증, 작은 PR 순서를 남긴다.
- 현재 테스트와 과거 이력/미실행 항목을 구분한다.
- 실행 코드/사용자 데이터/버전 tuple은 보존한다.
- 이 보고 후 구현은 사용자 범위 승인 뒤 시작한다.
