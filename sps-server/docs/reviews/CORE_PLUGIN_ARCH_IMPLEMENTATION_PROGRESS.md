# Core / Plugin 이전 구현 진행 기록

기준일: 2026-10-25 KST. 사용자 승인 후 진행 중인 소스 변경이다.
설치된 앱 교체, Stable 게시, 기존 사용자 데이터 이전을 뜻하지 않는다.
Desktop 버전 표기는 미출시 `0.4.137` 소스 단계이며, Core pin은
`8c2a4989b32bf6661223df5e0330c68741590d08`다. 이 변경으로 설치본/manifest를
새로 만들지 않았으며 이전 패키지나 E2E를 이 새 Source의 증거로 재사용하지 않는다.

## 결정

- 기존 신뢰 실행은 명시적으로 선택한 경우만 한시 유지한다. 새 보호 실행은
  미지원 Plugin을 차단하며 같은 사용자 실행으로 무음 fallback하지 않는다.
- 실제 데이터와 분리된 시험 계정/helper/서비스/관리자 권한 시험은 승인됐다.
  제품의 필수 관리자 설치 여부는 미정이다.
- Zod/의존성 보안 마이그레이션과 설치본 교체의 별도 보류는 해제하지 않았다.

## 적용 범위

| 계획 | 이번 구현 | 남은 범위 |
| --- | --- | --- |
| A 문서 | 제품 목표/현행 구분, Core 계약, stale Host-only Job 설명 정리 | 후속 PR마다 SDK/API와 함께 갱신 |
| B Native Recovery | 독립 설정창/시작 차단, 복구 전용 실행, 손상·미지원·저장 실패 시 상태 원문 보존과 쓰기 차단, 소유권 보정 금지 | 실제 DB 장애/Plugin hang 조합의 완전한 Host 통합 시험, 선택형 로컬 인증, 세부 진단 UI |
| C OS 실증 | 가짜 파일/자식 명령 canary, timeout 후 cleanup, cleanup walker의 directory symlink 거부 | 실제 CLI, UNC/실행 중 reparse 탈출/다른 드라이브, broker/DB/IPC/메모리, A/B 중지·정책 전환 |
| D1/D2 빈 Workspace | Agent 0개 자동 등록 제거, Primary 미선택 루트를 독립 빈 진입 화면으로 분리 | 선택된 Plugin 페이지의 공통 chrome은 유지; 전체 화면 표현/Primary-Extension 계약과 기본 Plugin 선택 정책 변경은 미구현 |
| K1 업데이트 | 자동 확인/다운로드 유지, Later/일반 종료로 설치하지 않음 | 실행 중 적용 조정/진단 동의/배포·복원 최종 통합 |
| E/F/F-UI/G/H/I/J/L | 이번 단계에서 구현 완료로 표시하지 않음 | Primary/Extension 공개 계약, OS/renderer 보호, Workspace 실행·데이터 수명주기, 공개 Preview, 다중 창, 생태계 |

## Native 복구 동작

`Core settings...`는 앱 메뉴와 tray에 항상 존재한다. 단축키는
`Ctrl+Alt+S`(Windows)이며 등록 충돌은 상태로 표시한다. 개발/관리 진입 인자는
`--sps-core-settings`이다. 창은 로컬 정적 파일과 전용 preload/ephemeral partition만
사용하며 Core HTTP, Plugin 스크립트, Workspace bridge에 의존하지 않는다.

Host 상태 읽기는 로그인/정상 Core 없이 가능하다. 복구 설정 저장과 재시작,
Host export는 기존 로컬 Host 소유권 검사를 유지한다. 현재 제품의 로그인 모델을
우회하는 새 로컬 인증 기능은 아니다. IPC는 이 창의 정확한 main frame만 허용한다.

복구 환경설정은 Desktop userData의 작은 `core-recovery.json`에 저장한다.
없으면 기존 실행을 유지하고, 손상/unsafe 파일이면 Plugin 시작을 차단한다.
저장은 활성 Host를 바꾸지 않으며 별도 확인 후 재시작해야 적용된다. 이미 다른
프로세스가 운영 중인 Host를 강제로 종료하지 않는다. 재시작은 해당 Host의 여러
Workspace에 영향을 줄 수 있으므로 명시적으로 경고한다.

Core는 `SPS_PLUGIN_RECOVERY_MODE=all-disabled`에서 실행 가능한 manifest import,
설치/upgrade build·migration, Worker loading, Plugin jobs/tools/subscriptions,
dev watcher와 UI asset을 시작하지 않는다. 비어 있지 않은 잘못된 값도 차단한다.
기존 권한 검사를 거친 package 상태 조회/disable만 남기며 다른 Plugin API는
`423 / plugin_recovery_active`로 거부한다. 활성화 설정/Plugin 데이터는 삭제하지 않는다.
이 기능은 Workspace stop, OS sandbox, 원격 프로세스 종료 증거가 아니다.

## Windows canary 결과

실행: `sps-server/desktop`에서 `npm run test:security:appcontainer-canary`.
Windows `10.0.26200`에서 임시 AppContainer 프로필, 임시 가짜 공개 파일과 가짜
Vault 파일만 사용했다. helper 및 시험 디렉터리/프로필 정리를 확인했다.
실제 계정/CLI 자격/사용자 Vault/제품 ACL/서비스/설치 프로그램은 변경하지 않았다.

| 관측 | 결과 |
| --- | --- |
| 같은 일반 사용자 권한의 가짜 Vault 읽기 대조군 | 성공 |
| exact AppContainer SID에 허용한 폴더 읽기/쓰기 | 성공 |
| 권한을 주지 않은 가짜 Vault 읽기/쓰기 | 명령 실패 및 원문 불변 |
| 제한 프로세스가 띄운 nested cmd의 허용 폴더 읽기 | 성공 |
| nested cmd의 가짜 Vault 읽기 | 명령 실패 |
| 시험 프로필/파일/helper 정리 | 성공 |

실행 helper source SHA-256:
`f0f06ffd91fb57fc00432e07205de00eced28f072618df05aee9ecf13ea86e8f`.
helper는 suspended 생성 직후 `TokenIsAppContainer`를 검사하고 Job Object에 넣은
뒤 실행한다. 자식 명령은 고정된 canary 동작이며 출력/개인 경로는 보고하지 않는다.
`LOCALAPPDATA`는 Windows 프로필 해석용으로만 전달하며 해당 폴더의 접근 권한을
부여하지 않는다. PATH는 Windows System32뿐이며 실제 provider secret은 상속하지 않는다.
시험 경로의 reparse ancestor/tree를 거부한다. wrapper가 helper를 시간 초과로
종료하는 경우 같은 임의 시험 ID만 받는 cleanup 경로를 별도로 호출한다. 첫 묶음은
정상 정리만 확인했으며, 아래 후속 실증에서 timeout 실패 주입과 cleanup을 검증했다.
동일 사용자 악성 프로세스의 동시 경로 교체까지 방어하는 제품 launcher는 아니다.

이는 개발용 양성/음성 대조 시험이다. `productIsolationImplemented:false`로 보고한다.
실제 Plugin/Node launcher에 연결하지 않았고 모든 악성 코드, 메모리·IPC 접근,
third-party CLI 로그인/네트워크/자식 트리, 무제한 파일 모드의 Vault 예외를
증명하지 않는다. 제품 보호 모드나 두 PC/서명된 릴리스 증거로 재사용하지 않는다.

기술 근거: [Microsoft AppContainer 실행](https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer),
[CreateAppContainerProfile](https://learn.microsoft.com/en-us/windows/win32/api/userenv/nf-userenv-createappcontainerprofile).

## 후속 B2 / C2

### 시작 실패와 소유권 복구

- `--sps-core-settings`로 새 앱 프로세스를 시작하면 자동 Host bootstrap과 Node
  heartbeat를 보류한다. 숨긴 로그인/설정 renderer도 Workspace를 자동으로 열지 않는다.
  이미 실행 중인 앱의 메뉴/두 번째 인스턴스로 설정을 열 때 기존 Host를 중지하지 않는다.
- Desktop 연결 설정을 읽거나 초기 atomic save를 완료하지 못하면 원문을 덮어쓰지
  않고 읽기 전용 복구창을 연다. 로그인·Node 연결·Host 시작·상태 저장을 차단하고
  기존 계정/파일을 임의 초기화하지 않는다. 파일을 자동으로 복구했다는 뜻은 아니다.
- 지원하지 않는 버전뿐 아니라 소유권/계정 라우팅/credential 필드의 잘못된 타입과
  충돌하는 Owner 매핑도 strict startup에서 거부한다. 현재 버전의 top-level 프로필을
  현재 로그인 계정의 소유권으로 추정하는 코드를 제거했다.
- 실제 v1-v4 로드에만 직렬화되지 않는 일회용 연결 이전 표시를 붙인다. 이 경로로
  Owner subject를 새로 지정하지 않는다. Owner adoption도 실제 v1-v4의 인증된
  로컬 기록과 Vault config를 함께 확인해 만든 별도 메모리상의 표시를 요구한다.
  현재 버전 파일의 `legacyOwnerHostAdoptionPending:true`만으로는 자동 귀속하지
  않고 읽기 전용 복구로 보낸다. genuine legacy adoption이 끝나기 전에는 원본
  설정의 쓰기와 새 로그인 자격 저장을 보류하므로 실패/재시작 시 원본으로 재시도한다.
  과거에 이미 v11 pending 형태로 저장된 모호한 기록은 수동 복구가 필요할 수 있다.
  이는 같은 OS 사용자의 악성 파일 위조를 암호학적으로 방어한다는 주장은 아니다.
- 명시적인 Native Workspace 열기는 기존 권한 검사 후 Host 시작을 시도할 수 있다.
  실패는 Host 진단 상태에 남긴다. 전역 Workspace stop이나 새 로컬 인증은 아니다.

실제 source Electron 시나리오 7종: fresh, 손상된 recovery preference, 비정상 JSON
연결 상태, atomic-save 임시 경로 충돌, 문법은 유효하지만 소유권이 손상된 v11,
출처를 확인할 수 없는 현재 버전 legacy-pending 표시, 기존 잘못된 Host config의
복구 전용 시작. 새 임시 userData만 사용했으며 원문
보존·관리 동작 거부·Core DB/runtime 미생성·상태 표시·1000/620px 레이아웃을 확인했다.
저장 실패는 디스크 전체를 채우지 않고 고유 시험 폴더의 `.tmp` 경로 충돌로 재현했다.
Core Settings의 실제 Native 화면도 관찰했다. 별도 정상 source sign-in bootstrap
E2E 역시 통과했다. 실제 Google/Host 인증이나 설치본 증거는 아니다.

Core의 새 `createApp` 조립 시험은 시작 의존성을 mock으로 관찰하여 번들
설치/refresh/load, scheduler/coordinator, tool init, memory observer, watcher가
복구 모드에서 호출되지 않고 정상 모드에서 유지됨을 확인한다. 차단된 API가
package/Workspace 활성화 저장 서비스를 호출하지 않는지도 확인한다. 실제 DB에
Plugin hang을 일으킨 실증이나 별도 OS sandbox 증명은 아니다.

### 실패 주입 canary

`node scripts/security-poc/run-appcontainer-canary.mjs --inject-timeout`은 고유
시험 프로필/가짜 파일 생성 marker 이후 helper를 의도적으로 정지시킨다. timeout
관측 후 동일 임의 ID의 cleanup을 실행했고 fixture/helper 잔여가 없음을 확인했다.
`--check-reparse`는 동일 시험 root 안의 directory symbolic link를 cleanup walker가
거부하고 링크 자체만 제거한 뒤 시험 root를 정리하는 것을 확인했다. 실제 AppContainer
프로그램의 reparse 경유 파일 읽기/쓰기 실증과 혼동하지 않는다.

세 모드(normal/timeout/reparse)를 최신 helper에서 재실행했다. Windows `10.0.26200`,
source SHA-256 `234dfa152ac292d18737f9e1c4ebf18dd0a835378074bc22f0ead8748fa65484`.
모든 보고에 `productIsolationImplemented:false`를 명시한다. symbolic-link API의
BOOLEAN 반환은 1-byte로 marshal하며 OS의 Developer Mode/권한을 변경하지 않는다.
링크 생성이 미지원인 환경은 해당 negative case를 명시적으로 skip한다.
[CreateSymbolicLinkW 계약](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createsymboliclinkw).

## 검증

아래는 첫 묶음의 고정된 검증 이력이다. 후속 변경에 자동 재사용하지 않는다.

- 독립 설정창 source Electron E2E: 새 프로필/손상된 recovery 설정 2종 통과.
  새 임시 userData, Core/계정 없음, 관리 mutation 차단, 손상 시 Plugin 차단 표시,
  1000/620px 가로 넘침 없음, 로컬 폰트 로드, 새로고침 확인.
  같은 명령을 Windows CI 필수 job에도 연결했으나 원격 실행 성공은 아직 확인하지 않았다.
- Core recovery/authz/routing/upgrade/autobuild + 빈 Workspace: 6파일, 103개 통과.
  Windows의 `pnpm` 직접 spawn 실패도 Node로 JS entrypoint를 실행하도록 수정했다.
  shell 실행은 추가하지 않았고 기존 3개 실패 autobuild 경로의 성공을 재확인했다.
- Desktop 전체 `npm test`: 501/501 통과. Core gitlink와 support matrix를 같은
  Source 커밋에 고정한 뒤 재실행한 결과다. Native main frame/다른 renderer 거부,
  저장과 적용 분리, 확인창 중 계정 변경 재검사, 수동 업데이트 정책을 포함한다.
- Core 전체 30개 package typecheck, 전체 build, compatibility boundary: 통과.
- UI token gate: 실패. 기존 다른 화면/테스트 파일의 색상 79개, bracket 36개,
  font-size 1개를 보고했다. 이번 변경의 home 파일은 보고 목록에 없다. 통과로
  숨기거나 무관한 UI 전체를 이번 복구 변경에 묶어 고치지 않았다.
- Windows AppContainer canary: 위 범위 통과.
- 전체 Core 회귀, Linux CI, 서명 설치본 E2E와 두 PC 실증, 운영 Identity 배포는
  이 기록으로 완료 처리하지 않는다. 보안 감사의 과거 성공도 현재 결과로 인용하지 않는다.

후속 검증: Desktop 전체 511/511, Core focused 7파일 106/106, server typecheck와
compatibility boundary 통과. 구현 커밋 `0c9b54b6ad46e26ac971be83cb936010abaecb5f`
고정 후 Desktop 전체와 Electron Core Settings 최종 7종, 정상 bootstrap을 재실행해
모두 통과했다. 이후 변경은 검증 기록과 기존 legacy-positive 시험의 strict 옵션뿐이다.
canary 테스트 4/4, 정상/timeout/reparse 실행과 정리도 통과했다. 전체 Core build/typecheck는 위 첫 묶음
이력이고 이번 Core 변경은 테스트뿐이다. 전역 UI token gate의 기존 실패, 전체 Core/
Linux CI, Zod/의존성 보류, 서명/운영 Identity/두 PC 게이트는 그대로 남는다.

## 후속 D2 / 독립 빈 진입 화면

SPS basic + Core baseline이고 기존 Workplane 모드가 아닌 경우, Workspace 루트는
선택한 Shell이 없으면 공통 `Layout`을 mount하지 않는다. Agent/위젯/Dashboard/
Plugin UI 목록을 그 화면에서 조회하지 않고, Workspace 이름과 플러그인 관리의
명시적 진입점만 표시한다. 선택된 사용 가능한 기존 Shell은 이전 기본 경로로
이동하며 해당 Plugin 페이지의 chrome은 아직 유지한다. 새 Workspace의 번들
활성화/기본 선택을 일괄 변경하거나 기존 데이터를 초기화하지 않는다.

라우트 prefix로 Workspace를 먼저 결정하여 이전에 선택했던 다른 Workspace의
Shell/설정 링크를 사용하지 않는다. 모르는 prefix는 다른 Workspace로 자동 귀속하지
않고, 진행 중인 수동 Workspace 전환도 기존 선택 동기화 규칙으로 보존한다.
조회 중/오류와 빈 성공을 구분한다. cached selection은 서버 재검증 전 Plugin UI로
이동하지 않고, 오류는 민감 진단 원문 없이 수동 재시도를 제공한다. 저장된 root/
unsafe 기본 경로는 기존 명시적 Dashboard로 복귀해 루프/Workspace 경로 이탈을
막는다. `/dashboard`, `/inbox`, Agent 등록/상세, 설정 deep link/API는 남겨 둔다.

Core 변경부 9파일 회귀 91/91, 전체 30개 package typecheck와 전체 build,
compatibility boundary 및 UI entry bundle 검사 통과. entry JS 1,295,378 bytes로
기존 1,500,000-byte budget 이하다. 전역 UI token gate는 기존 color 79/bracket
36/font-size 1개로 여전히 실패하며 새 파일은 보고되지 않았다. 전체 Core 회귀,
Linux, Storybook 시각 baseline, 설치본/물리 두 PC 증거는 이 검사로 주장하지 않는다.

Source Electron Workspace Surfaces harness에 Agent/활성 Plugin 0개, 독립 루트,
실제 Manage plugins 링크, 620/1000px 레이아웃, 기존 선택 Shell과 비활성 후 복귀
검사를 추가했다. 첫 실행은 실제 빈 화면까지 도달했지만 harness의 cooked template
정규식이 잘못되어 중단됐다. 그 실패는 성공 증거로 재사용하지 않으며 수정 후 전체
연속 실행 결과는 아래 후속 검증에 기록한다. 실제 사용자 Host/계정과 분리된 임시
userData/가짜 Identity/프로세스 fixture만 사용한다.

구현 Source `aef40e7ba57d1ac731972b4b0d650c156c78924b`, Core
`df26bea0148e163cd05efaa62aba6a2959d89870`, SDK 기존 `cfa64ec4...`에서 Desktop
전체 512/512를 통과했다. 첫 테스트 중간의 staged/gitlink 불일치 및 harness 정적
검사 실패는 pin/본문을 같은 Source 커밋에 반영한 뒤 전체 재실행으로 해소했다.
후속 보안/의존성 조치를 면제하거나 최신 감사 통과로 바꾼 것은 아니다.

수정 후 Workspace Surfaces source Electron 전체가 한 번의 연속 실행에서 통과하고
정리까지 완료됐다. Agent/활성 Plugin 0개, Agent 자동 생성/Agent·Dashboard fetch
없음, 공통 chrome 없음, 실제 플러그인 관리 왕복, 620/1000px fit를 확인했다.
기존 Dashboard/Agent 등록 Cancel, 선택된 Team Shell 기본 경로, 비활성 Shell의
독립 빈 화면 복귀도 유지했다. Builder의 가짜 process 실행/실제 종료 확인, 대화별
미전송 text/attachment 보존, 안전한 usage/history 상세 및 lane 변경, 내부 Room과
Plugin Settings 반응형 검증도 같은 실행에서 통과했다. 원본 스크린샷은 ignored
개발 산출물에만 보관하고 620px 빈 화면을 직접 검토했다. 실제 Google/유료 AI 호출,
패키지 설치본, 원격 Member/물리 두 PC 및 Stable 검증은 아니다.

재현: `sps-server/desktop`에서 `SPS_DESKTOP_E2E_SOURCE=1` 및 임시 개발 screenshot
출력 경로를 설정하고 `npm run test:e2e:workspace-surfaces` 실행. 해당 실행 중에는
같은 Core UI output을 덮어쓰는 build를 동시에 수행하지 않는다. 되돌리기는 이
entry/router commit을 revert하는 범위이며, 새 DB migration이나 사용자 저장값
변환은 없다. 이번 Source 후속 커밋은 이 검증 기록만 추가한다.

## 다중 백엔드 Stage 0 / 조사와 문서 정렬

제품 방향은 AI 선택형 범용 워크스테이션으로 정렬했다. Core 비공개 / SDK 공개,
현재 Windows/Tailscale/로그인, 기존 데이터와 보호 미지원 차단은 그대로 유지한다.
[계획](../current/MULTI-BACKEND-WORKSTATION-PLAN-ko.md)과
[재사용 감사](MULTI-BACKEND-REUSE-AUDIT-2026-10-25.md)를 추가했다.
Core 후속 커밋은 README/계약 문서만 바꾸며 D2 런타임은 변경하지 않는다.

공개 SDK의 `platform`에는 이미 Agent session API가 있다. 현재 pinned source와
공개 `v0.11.0` tag의 차이를 구분하고 API를 중복 설계하지 않는다. 일반 Node 실행은
grant/Runner 범위이며 임의 CLI 명령 API가 아니다. `secrets.resolve` 현행 handler는
실패 폐쇄이고 handle-only broker, 범용 모델 요청, OCE 전용 Connector는 미구현이다.
OpenClaw adapter의 mock 시험과 최신 실제 Gateway 호환성도 별도다.

이번 SDK `npm test` 157/157, Core Gateway/session/job/Node 표적 4파일 40/40은
모델/실제 Gateway/OCE/물리 Node를 호출하지 않는 소스 시험이다. 조사 baseline과
정확한 재현 명령은 위 계획/감사에 기록한다. 전체 Core 회귀·실제 Electron·최신
의존성 감사·설치본·두 PC 증거를 새로 확보한 것으로 표시하지 않는다.

다음 최소 구현은 기존 ui/platform/state/events/jobs로 만드는 임시 No-AI 체크리스트
reference와 격리 Desktop 수용 시험이다. 이번 문서 변경으로 그 Plugin이 구현됐거나
실제 사용자 환경에 설치된 것은 아니다. API/SDK/DB/의존성/실제 키 변경은 없다.

## 다음 게이트

독립 복구 경로의 장애 조합 검증을 보강하고 OS/renderer 실행 계약을 구체화한다.
기존 Core 관리 UI와 직접 주소는 보존하며, 보호 모드를 사용할 수 있다고 노출하지 않는다.
선택된 Plugin 화면의 전체 화면 표현과 Primary/Extension 공개 계약은 다음 별도 단계다.
단계별 테스트/롤백 근거를 남기며 기존 데이터/API/deep link를 보존한다.
