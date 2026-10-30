# Core / Plugin 보안 실현 가능성 검토

기준일: 2026-10-25 KST. 본문은 Phase 0 감사 기준이다. 이후 구현이 승인됐으며,
제6절과 [진행 기록](CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md)에 후속 실증을 구분한다.

기준 Source `174e7508019a316fd3df0109608d3cff6f4a91ae`, Core
`0574df95db75bff132ef2b7f9704f7bbd73608c6`, SDK
`cfa64ec4f589ea9765661834e1685ef1f2e14453`.
버전과 이번 검증 범위는 [현행 감사](CORE_PLUGIN_ARCH_GAP_AUDIT.md)를 따른다.

## 1. 결론

목표 설계의 Vault 보호와 Workspace 파일 제한은 **현재 구현으로 증명되지 않는다**.
Worker 환경변수 최소화, Source 승인, signed Node command, Electron sandbox는
유효한 별도 통제지만 임의의 플러그인/CLI/자식 프로세스의 Windows 파일 접근을
모두 격리하지는 않는다. 이를 곧바로 현재 인증 우회가 재현됐다는 뜻으로 해석하지
않는다. 새 목표 위협 모델에서 충족하지 못하는 경계라는 판단이다.

OS 격리 연구와 테스트용 PoC를 먼저 승인하고, 결과에 따라 실행 구조를 선택해야
한다. 실제 사용자 Vault/ACL/계정/서비스를 이번 감사에서 변경하거나 공격하지 않았다.

## 2. 위협 모델

| 항목 | 범위 |
| --- | --- |
| 공격 주체 | 설치된 플러그인의 Worker와 UI, AI가 생성한 코드, 실행 CLI/스크립트/손자 프로세스, 악성 또는 손상된 Node |
| 신뢰 기반 | Core broker, 독립 Native 시스템 UI, 승인된 업데이트 경로, Windows 보안 경계 |
| 보호 자산 | OAuth/세션/Node 개인키, DB와 복호 키, Core 관리 권한, 다른 Workspace의 비공개 데이터, 명시적 파일 범위, 실행 중지 상태 |
| 허용 행동 | 승인된 데이터 사용, 업무별 UI, 외부 실행, 기본 자유 네트워크. 허용된 결과 자체의 외부 전송은 Vault 원문 절취와 별도 문제 |
| 보장 한계 | OS 관리자/커널 침해, 사용자가 직접 비밀을 복사해 플러그인에 준 경우까지 절대 방어한다는 약속은 하지 않음 |

손상된 Node는 별도 프로토콜 위협이다. Host는 다른 Workspace 자원에 대한 명령/
grant/lease/완료 서명 범위를 검사할 수 있지만, Node가 자기 OS와 서명키를 지배하면
서명된 완료가 진짜 프로세스 종료를 뜻한다고 보장할 수 없다. 이 경우 원격 실행
격리/종료 보장은 미확인이며 Windows 로컬 launcher PoC로 증명하지 않는다.

플러그인 서명/AI 스캔은 공급 경로와 검토 정보다. 실행 중 파일/메모리/IPC 권한
격리를 대신하지 않는다. 제어 대상 실행과 플러그인이 별도 서비스에 요청한 실행의
귀속 범위도 분리해야 한다.

## 3. 코드에서 확인한 사실

| 증거 | 현재 통제 | 새 목표와의 차이 |
| --- | --- | --- |
| `external/sps-core/server/src/services/plugin-worker-manager.ts:723` | 환경변수 allowlist로 `fork`; `detached:false` | 다른 Windows 보안 주체/AppContainer를 지정하지 않음. 환경변수 숨김은 파일 권한 분리가 아님 |
| `external/sps-core/server/src/services/plugin-loader.ts:147`, `:200` | 특권 capability에 따라 Host 환경의 공급자 API key, memory token, loopback access token을 선별 전달 | 해당 값이 Host 환경에 실제 존재하고 capability 조건이 맞을 때 원문 전달 경로가 있음. 모든 Plugin에 원문 비밀을 주지 않는 새 목표와 조정 필요; 실제 운영 값은 확인하지 않음 |
| `sps-server/desktop-node/src/command-runner.mjs:195`, `:537`, `:552` | Host-issued cwd/UNC Source, lease, `shell:false`, 프로세스 트리 종료 | cwd와 승인된 실행 파일 이름은 실행 후 임의 경로 읽기/쓰기를 막는 OS sandbox가 아님 |
| `sps-server/desktop/src/developer-command-runner.mjs:93`, `:174` | 고정 SDK 명령과 최소 환경으로 build/validate/test 실행 | 해당 명령이 처리하는 사용자 코드의 모든 하위 프로세스에 파일 제한을 부여한 증거는 아님 |
| `external/sps-core/server/src/secrets/local-encrypted-provider.ts:48`, `:83` | DB 비밀은 AES-GCM, 로컬 master key. Windows에서 POSIX 권한 보정은 생략 | 같은 사용자 Worker와 키 파일 사이의 별도 OS 주체가 없음. live 키 내용/ACL은 이번 감사에서 열람하지 않음 |
| `sps-server/desktop/src/owner-host-config.mjs:89`, `sps-server/desktop/src/main.mjs:353` | Owner Vault 아래 DB/키/로그/작업 데이터, Desktop 계정 값은 `safeStorage` | 디렉터리 이름과 저장 시 암호화만으로 같은 사용자 임의 코드에 대한 원문 비노출을 보장할 수 없음 |
| `external/sps-core/server/src/services/plugin-secrets-handler.ts:235` | `secrets.resolve`는 명시적으로 fail-closed | 파일/메모리/프로세스 우회 방어 또는 연결 핸들 기반 대리 호출의 완성은 아님. 주석의 평문 반환 설명만 읽고 활성화됐다고 판단하면 안 됨 |
| `external/sps-core/ui/src/plugins/slots.tsx:455`, `:476`, `:897` | 플러그인 ESM을 현재 renderer에서 로딩, React error boundary | crash fallback은 보안 격리가 아님. 현재 DOM/window/세션을 공유하는 코드의 권한을 별도로 조사해야 함 |
| `sps-server/desktop/src/workspace-preload.cjs:5`, `sps-server/desktop/src/main.mjs:4490` | 로컬 Host 창에 관리용 bridge, sender WebContents 검사. Member 창에는 없음 | 같은 Host renderer 안의 Core UI와 플러그인 UI를 sender ID만으로 구분하지 못함. 실제 권한 상승 공격은 이번에 수행하지 않음 |
| `external/sps-core/server/src/services/plugin-worker-manager.ts:1366` | Worker map/stop이 Plugin ID 기준 | 같은 Plugin의 Workspace A/B가 프로세스와 메모리를 공유. 프로세스 강제 종료/리소스 측정으로 A만 분리할 수 없음 |

`plugin-runtime-sandbox.ts`의 VM loader는 발견했지만 정상 Worker 시작 경로의
OS launcher 대체로 연결된 증거는 찾지 못했다. VM/import allowlist도 Windows
보안 주체 분리와 같지 않다. `sandbox:true` Electron renderer 설정은 유지해야
하지만 Node Worker/외부 CLI sandbox로 확대 해석하지 않는다.

## 4. Windows 대안 비교

아래는 검토 대안이지 채택된 구현이 아니다.

| 대안 | 장점 | 제약 / 판정 |
| --- | --- | --- |
| 현행 사용자 + 환경변수/SDK 검사만 보강 | 기존 CLI 계정과 도구 호환성이 높음 | 임의 코드가 동일 사용자 파일/복호 수단을 사용할 가능성을 제거하지 못함. 새 Vault/파일 보장에는 부적합 |
| 별도 OS 보안 주체의 Vault broker + 제한된 Worker launcher | Vault ACL/프로세스 권한을 실제로 분리하고 secret-use 대리 호출 가능 | Native helper/설치 권한/IPC peer 인증/업데이트/제거 필요. broker 토큰을 읽을 수 있는 일반 사용자 파일에 두면 경계가 다시 무너짐 |
| Workspace별 AppContainer/restricted-token 실행 + 파일/인증 broker | Workspace별 파일/프로세스 접근을 OS 정책에 묶을 후보 | Codex/Git/Python/Unity, UNC/네트워크/자식 프로세스/로그인 호환성은 미검증. 모든 CLI 지원을 약속하면 안 됨 |
| VM/별도 실행 Node | 더 명확한 별도 OS 경계의 후보, 특정 도구 격리 가능 | 메모리/설치/파일 공유/장치 통합 부담. Docker/WSL이라는 이름만으로 호스트 mount와 Vault가 보호되는 것은 아님 |
| 파일 API만 broker 처리, 나머지 프로세스는 동일 사용자로 실행 | 관리 API의 접근 경로는 좁힐 수 있음 | 임의 CLI가 broker를 거치지 않고 파일을 열면 무효. 일반 프로그램까지 자동 집행하는 대안으로 부적합 |

**권장:** Windows 지원표를 만들고 AppContainer/restricted token 및 별도 보안
주체 broker를 시험용 프로필에서 비교한다. Vault broker만 분리해도 전체 파일
범위/renderer 관리자 권한이 자동 해결되는 것은 아니다. 별도 프로세스로 나눈
뒤에도 같은 권한이면 보안 경계는 생기지 않는다.

`파일 범위 미설정 = OS 권한 내 전체 접근`의 의미도 PoC에서 확인해야 한다.
격리 토큰으로 프로그램을 실행하면 원래 사용자의 파일/CLI 계정 접근 범위를
그대로 재현하지 못할 수 있다. 필요한 broker/지원 불가 표시를 사용자에게
설명하고 선택받아야 하며, 조용히 무제한 동일 사용자 실행으로 되돌리지 않는다.

Core Vault와 사용자의 별도 CLI 로그인 홈도 구분한다. Vault를 보호했다고 해서
외부 프로그램이 사용하는 계정 파일까지 보호되는 것은 아니다. 기존 로그인 공유를
계속 허용하려면 공급자별 대리 실행/자격 전달 방식과 남는 위험을 따로 검증한다.

## 5. 필요한 기술 계약

- 보호 영역을 명시적으로 분리: Core secrets/키/DB/세션, Workspace Plugin 데이터,
  설치 패키지, Preview 데이터, 사용자 외부 작업물. 현재 `owner-vault` 전체가
  비밀 저장소만은 아니므로 디렉터리명 하나로 삭제/거부 범위를 정하지 않는다.
- 실행 principal은 Host/Workspace/Plugin/Run/Node/정책 세대에 결속한다. 임의 경로,
  환경변수, renderer가 전달한 Workspace ID만 신뢰하지 않는다.
- broker의 연결 handle은 원문 대신 작업 자격을 나타낸다. audience/operation/
  Workspace/Plugin/만료/회수를 검사하며, 임의 URL 요청에 Core Authorization
  header를 붙이는 범용 프록시로 만들지 않는다.
- 기존 환경변수 passthrough도 검토 범위다. 비활성 `secrets.resolve`만 바꾸고
  provider/sidecar/Host token을 계속 Worker에 넘기면 새 목표를 충족하지 않는다.
  승인된 구 특권 Plugin의 호환 경로와 새 보호 실행의 자격 계약을 구분한다.
- Native 설정창에는 비신뢰 플러그인 스크립트를 로딩하지 않는다. 플러그인 창은
  관리 bridge/Host 세션 대신 제한된 capability transport를 사용한다. UI 없는
  Extension과 전용 창도 동일 원칙을 적용한다.
- 전역 자유 네트워크 정책과 credential broker의 SSRF/credential audience 방어는
  별개다. 기존 안전한 HTTP helper의 사설 IP 차단을 무조건 제거하지 않는다.
- 파일 허용 범위를 줄일 때 기존 handle/실행/자식 프로세스를 포함한 정책 전환이
  필요하다. 지원되지 않는 runtime에는 `restricted_execution_unsupported`처럼
  명확한 실패를 반환한다. 이 이름은 예시이며 새 API로 확정하지 않았다.
- Job Object는 실행 트리 종료/관찰 후보다. 파일 ACL/토큰, breakaway/외부 daemon,
  OS 자원 회계는 별도로 검증한다. Workspace A의 취소를 이유로 공유 Worker를
  죽여 B까지 중단시키지 않는다.

## 6. 승인 후 실증 계획

모두 새 테스트 계정/가짜 비밀/canary/격리된 Workspace A/B를 사용한다.

| 실증 | 합격 조건 | 실패 시 |
| --- | --- | --- |
| Vault 원문 | 일반 Worker, UI가 요청한 CLI, 자식/손자 프로세스에서 canary 파일/키/DB/브로커 토큰/프로세스 메모리 접근 실패 | 해당 경로 격리 완료 표기 금지, launcher 지원 불가 |
| 파일 범위 | A 허용 폴더 read/write만 성공; 형제 폴더, junction/reparse/UNC/다른 드라이브/임시 경로 탈출 실패 | API path check 통과만으로 승인 금지 |
| 정책 변경 | 실행 중 범위 축소/Node revoke 후 기존 handle과 새 프로세스 사용에 일관된 처리 | 변경 적용 대기 또는 안전 종료, 무음 허용 금지 |
| 프로세스 | 자식이 다시 프로세스를 생성해도 추적되고 취소 후 종료 확인. 독립 서비스/Docker daemon 요청도 한계가 표시됨 | `termination=pending/unsupported`; 취소 성공과 실제 종료 혼동 금지 |
| UI 권한 | Plugin 화면에서 Core 관리 API/IPC, 다른 창 세션, Native settings 자격 직접 사용 실패 | same-origin UI를 비신뢰 sandbox로 취급하지 않음 |
| A/B 격리 | 지정 시나리오에서 A 취소/프로세스 종료/reset이 B 실행/데이터를 바꾸지 않음; Host 재시작 후 stop/pause 유지 | 공유 Worker 모델로 합격 선언 금지. 공유 자원 고갈의 가용성 보장으로 확대 금지 |
| CLI 호환 | 각 지원 Windows/CLI 버전에서 로그인 handle, 파일, 네트워크, 취소 동작을 실검증 | 특정 runtime/version 미지원으로 명시 |

Phase 0 감사에서는 이 Windows 보안 PoC를 실행하지 않았다. 이후 사용자 승인으로
임시 AppContainer 프로필의 가짜 파일 canary 일부를 실행했다. 정확한 범위와
미검증 항목은 [구현 진행 기록](CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md)을
따른다. 해당 좁은 실험을 위 표 전체의 합격이나 제품 sandbox 구현으로 확대하지
않는다. Core 네트워크 allowlist나 CPU/RAM 자동 제한은 추가하지 않았다.

별도 Node 프로토콜 검증에서는 타 Workspace 서명/만료 lease/회수 grant/위조 완료를
거부하는지 확인한다. 정상 서명키를 탈취한 Node의 거짓 종료 보고까지 로컬 파일
canary 실험으로 차단했다고 주장하지 않는다.

## 7. 공식 근거와 추론 범위

- DPAPI의 기본 보호 범위는 사용자/컴퓨터다. SPS의 같은 사용자 임의 코드에 대한
  충분조건이 아니라는 판단은 현재 launcher 구조와 이 범위를 결합한 추론이다.
  [CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
- Job Objects는 프로세스 그룹의 종료/회계를 제공한다. 파일 보안은 별도 검토
  대상이다. [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- restricted token은 SID/privilege에 의한 접근 제한의 후보이며 단순 PID 그룹과
  다르다. SPS 도구 호환성은 문서만으로 확정하지 않는다.
  [Restricted Tokens](https://learn.microsoft.com/en-us/windows/win32/secauthz/restricted-tokens)
- AppContainer는 자격/파일/네트워크/프로세스 격리를 제공하는 후보다. SPS의
  무제한 파일 옵션과 모든 외부 CLI가 그대로 동작한다는 뜻은 아니다.
  [AppContainer isolation](https://learn.microsoft.com/en-us/windows/win32/secauthz/appcontainer-isolation)

공식 문서는 2026-10-25 조회. 기술 방식 선택과 관리자 설치 허용 여부는
[이전 계획의 승인 항목](CORE_PLUGIN_ARCH_MIGRATION_PLAN.md)을 따른다.
