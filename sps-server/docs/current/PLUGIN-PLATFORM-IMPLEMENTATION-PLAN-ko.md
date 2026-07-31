# SPS Core 플러그인 제작 기반 완성 계획

상태: 구현 중 (1~6단계 완료, 7단계 진행)

최종 갱신: 2026-07-31

기준 설치본: SPS Desktop `0.4.96`

## 목적

SPS Core를 외부 개발자와 Plugin Builder가 실제 플러그인을 설계, 제작, 시험,
패키징하고, Host가 검토·설치·활성화할 수 있는 안정적인 플랫폼으로 완성한다.
Marketplace 검색과 Marketplace Assistant는 Core 기본 기능으로 제공한다.

Core의 모든 제품 기능이 끝날 때까지 플러그인 제작을 미루는 것이 목표가 아니다.
플러그인이 의존하는 공개 계약을 먼저 안정화하고, reference plugin을 함께
만들면서 계약을 검증한다.

이 계획은 Room, Task, Lead, Worker, 승인, 기억 전략을 Core에 넣지 않는다.
Core는 기술 기반과 안전 경계를 제공하고 플러그인은 작업 방식을 정의한다.

## 확정된 제품 원칙

1. Core는 특정 조직도, 프로젝트 방식, Task, Room, 역할, 승인, 기억 정책을
   기본값으로 강요하지 않는다.
2. Marketplace와 Marketplace Assistant는 Core 기본 기능이다. Plugin Builder는
   제작이 필요할 때 Host가 활성화하는 별도 번들 플러그인이다.
3. 설치, 활성화, 업데이트, 비활성화, 삭제는 위험도에 맞는 Core 검토 절차를
   통과한다.
4. 검색이나 추천은 설치를 의미하지 않는다.
5. Marketplace Assistant와 Plugin Builder에는 설치, 활성화, 업데이트, 비활성화,
   삭제 도구를 제공하지 않는다. 실제 변경은 Host가 `Settings > Plugins`에서
   직접 실행한다.
6. 자연어 요청의 의미를 키워드 Controller나 하드코딩된 문장으로 분류하지 않는다.
   AI가 판단하고 typed tool을 선택하며, Core는 요청된 기술 동작만 검증한다.
7. 한 Workspace는 하나의 Workspace Shell Provider를 선택할 수 있고, 여러 활성
   플러그인은 Dashboard와 Inbox에 함께 기여할 수 있다.
8. 플러그인은 Core의 Plugins, Safe mode, Diagnostics, Update, Export/Import,
   Host settings 경로를 숨기거나 비활성화할 수 없다.
9. 플러그인 프로젝트는 SPS 설치 폴더가 아닌 별도 폴더 또는 Git 저장소에 둔다.
10. Marketplace Assistant의 UI, 대화 생명주기, 읽기 전용 도구 broker는 Core가
    소유하고, 실제 추론은 사용자가 접근할 수 있는 AI 어댑터가 담당한다.
11. AI 어댑터가 없어도 일반 Marketplace 검색과 상세 조회는 항상 작동한다.
12. Host와 Member는 같은 Windows 설치본을 사용한다.

## 현재 기준 상태

| 영역 | 0.4.96 상태 | 이 계획의 목표 |
| --- | --- | --- |
| 패키지 생명주기 | 구현 | 위험 검토, migration, rollback 흐름을 개발자 도구와 통합 |
| Workspace별 활성화 | 구현 | Shell 선택과 contribution 상태까지 Workspace별 분리 |
| UI contribution | page, sidebar, settings, detail tab 구현 | Shell, Dashboard widget, Inbox 추가 |
| Worker·Tool·Event·Job | Workspace Job 격리·복구·취소·retry 계약 구현 | reference plugin 운영 회귀 확장 |
| Source·Runtime·Run·Artifact | 구현 | 공개 SDK와 Test Kit에서 직접 사용 가능하게 고정 |
| Connector·MCP | 기반 구현 | scoped handle, 상태, 테스트 fixture 표준화 |
| 공개 SDK | Runtime·UI·Worker·Registry·Developer Build·Preview fixture 계약 구현 | Test Kit와 이전 SDK 호환 회귀 확장 |
| Developer Mode | 외부 폴더 연결, 3-gate build, staging, LKG, rollback 구현 | 실제 reference plugin 반복 검증 |
| Plugin Preview | 격리 Vault·DB·Workspace·별도 창·fixture·Preview 진단과 패키지 E2E 구현 | Diagnostics·Test Kit의 통합 진단 계약으로 연결 |
| Diagnostics | 공개 v1 계약, Core 상태 snapshot, Desktop 개발 진단 원장과 UI 구현 | 실제 reference plugin 운영 진단 확장 |
| Test Kit·Conformance | 결정적 in-memory fixture와 불변 검증 보고서 구현 | reference plugin 회귀 집합 확장 |
| Plugin dependency | 필수·선택·버전·충돌·영향 검토·blocked 복구 계약 구현 | Host 수동 설치 상세와 Builder 검사에 연결 |
| Marketplace 검색 | 검증된 Catalog snapshot 검색 구현 | Core 검색·상세 조회·Assistant 도구로 승격 |
| Plugin Builder | 초안·개발 기반 구현 중 | 외부 프로젝트 생성부터 Preview·package까지 연결 |

## Core 완성 Gate

다음 Gate를 통과해야 제3자 플러그인 제작 기반이 완성된 것으로 본다.

### Gate A. 공개 계약

- 외부 플러그인이 SPS Core 소스 checkout 없이 설치 가능한 공개 Runtime SDK 사용
- workflow-neutral Extension Profile `2.0`
- capability, lifecycle, data scope, compatibility, deprecation 계약 문서화
- 공개 타입과 실제 packaged Core의 계약 일치
- 한 버전 이전 SDK로 만든 reference plugin의 호환성 회귀 통과

### Gate B. 개발과 Preview

- 별도 프로젝트 폴더에서 init, validate, test, pack 실행
- Developer Mode에서 개발 패키지를 production Workspace와 분리
- 변경 후 안전 reload, 실패 시 마지막 정상 버전 유지
- 별도 Plugin Preview 창에서 UI와 행동 확인
- Preview 종료가 SPS 본체나 플러그인 프로젝트에 영향을 주지 않음

### Gate C. 운영 안전

- capability 변경과 migration plan을 Host가 검토
- 위험한 외부 API, 대량 실행, 데이터 삭제는 강한 확인과 감사 기록 적용
- 비활성화, rollback, 완전 삭제, 백업, 복구 동작 검증
- Shell Provider 실패 시 Neutral Core Shell로 복귀
- Safe mode에서 플러그인 worker와 job 없이 복구 가능

### Gate D. Host·Member 실제 검증

- 실제 Windows Host와 Member Desktop
- Tailscale 연결, Node 승인, Runtime 공개, Workspace Source route
- 플러그인 Tool·Run·Artifact·Dashboard·Inbox 전 과정
- Member 제거와 Node 철회 후 접근 중단
- 재시작, 업데이트, 네트워크 단절 후 상태 복구

## 구현 단계

## 1단계. 공개 Runtime SDK 분리와 계약 고정

### 목표

플러그인이 SPS Core 내부 경로에 의존하지 않고 공개 패키지만으로 worker, UI,
tool, job, event, storage, Source, Runtime, Run, Artifact를 사용할 수 있게 한다.

### 작업

1. `sps-plugin-sdk`에 Runtime SDK와 타입 패키지를 추가한다.
2. 현재 Core 내부 SDK export를 공개 SPS 이름과 workflow-neutral 용어로 매핑한다.
3. 기존 `@paperclipai/*` 이름은 compatibility adapter 안으로 격리한다.
4. UI SDK, worker context, typed tool, event, job, stream, store 타입을 공개한다.
5. Extension Profile `2.0` manifest 생성기를 기본값으로 한다.
6. Desktop packaged runtime과 공개 SDK revision을 release baseline에 고정한다.
7. SDK의 지원·폐기·호환 기간과 Plugin API 변경 정책을 문서화한다.

### 완료 조건

- 빈 외부 폴더에서 `npm install` 후 Core checkout 없이 example plugin 빌드
- `init -> validate -> test -> pack -> inspect -> local publish` 전체 통과
- Team Workplane 또는 축소 reference plugin이 내부 SDK file dependency 없이 동작
- 공개 타입과 packaged Host의 conformance test 통과

### 현재 구현 상태

- 공개 SDK `@sonparkserver/plugin-sdk` `v0.3.0`을 릴리스하고 제품의 pinned
  submodule과 Desktop 의존성을 같은 revision으로 고정했다.
- `@sonparkserver/plugin-sdk/runtime` 공개 facade와 TypeScript 타입을 추가했다.
- Source, Runtime, execution grant, Run, Artifact 요청은 현재 Host의 `sps.*`
  RPC 이름과 payload를 그대로 사용한다.
- 외부 임시 프로젝트에서 tarball 설치, JavaScript import·실행, TypeScript 타입
  검사를 자동 검증한다.
- raw command, 작업 폴더, Host 경로는 공개 facade 입력에 포함하지 않는다.
- Desktop Worker의 `ctx.sps`·`ctx.spsTransport`는 Host의 capability 및 회사 범위
  검증을 거치는 `sps.*` RPC에 연결되어 있다. SDK RPC 테스트로 이 연결을 확인했다.
- packaged Owner Host runtime의 컴파일된 `PluginWorkerManager`로 공개 SDK가
  bundle한 self-contained `dist/worker.js`를 직접 spawn하는 conformance를 추가했다.
  Host `initialize` 중 Worker의 `sps.runtimes.list` 요청을 실제 Host handler로
  왕복시키고, `health`, `shutdown`, Windows clean exit(code 0)까지 검증한다.
- public `worker`, `platform`, `ui`, `ui/bridge` export와 self-contained Node 22
  worker bundler를 공개했다. Tool, event, job, state, UI contribution은 Core 내부
  경로를 import하지 않고 공개 SDK만으로 작성하고 시험할 수 있다.
- `sps-plugin build`, `sps-plugin test`, 외부 JavaScript/TypeScript consumer,
  notification 기반 event dispatch, invocation 격리, UI bridge 계약을 자동 검증한다.
- conformance의 기본 SDK 경로는 release baseline과 같은 Desktop 설치 의존성이다.
  `initialize -> Host RPC -> health -> shutdown`과 Windows clean exit를 통과했다.
- packaged Owner Host에서 Registry authoring, build, publish, install, update,
  rollback 및 공개 Worker Host conformance를 한 번에 통과했다.
- Core의 native `spsPlugin` metadata, `ctx.spsTransport`, SPS UI bridge 계약은
  `302bb77`에 고정했다. 기존 Paperclip 이름은 compatibility alias로만 남겼다.
- 최신 공개 SDK 전체 테스트는 126개, Core 진단·route·UI 집중 회귀는 65개
  통과했다. Core Shared·Server·UI 타입 검사도 통과했다.
- 1단계 완료 조건을 충족했다. 다음 구현 기준선은 2단계 Workspace Shell,
  Dashboard, Inbox contribution이다.

## 2단계. Workspace Shell, Dashboard, Inbox

세부 계약은
[WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md](WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md)를
따른다.

### 작업

1. `ui.workspaceShell.provide`, `ui.dashboard.contribute`,
   `inbox.items.publish`, `inbox.items.update`, `inbox.actions.register`
   capability와 schema를 추가한다.
2. Neutral Core Shell과 숨길 수 없는 Recovery navigation을 구현한다.
3. Workspace별 Shell Provider 선택, fallback, 충돌 규칙을 구현한다.
4. Dashboard grid, widget lifecycle, 오류 격리, 사용자 배치 저장을 구현한다.
5. Inbox envelope 저장, 읽음, 보관, 필터, action dispatch를 구현한다.
6. action 실행 시 플러그인 업무 권한과 Core capability를 다시 검증한다.
7. Core 서버·Node·Source·플러그인 이상 상태를 고정 Attention 영역에 표시한다.

### 완료 조건

- 플러그인 없이 Neutral Core Shell 동작
- 한 Workspace의 Shell 선택이 다른 Workspace에 영향을 주지 않음
- 여러 플러그인의 widget과 Inbox item 동시 표시
- Shell 플러그인 비활성화·삭제·오류 시 즉시 Neutral Core Shell 복구
- 플러그인이 Recovery navigation 또는 Core API를 숨기거나 우회하지 못함

### 현재 구현 상태

- Core `25be48f1a9b9879b440ad3e9bc2f6bf4e03f76f1`에서 Native capability,
  manifest 검증, Workspace별 Shell 선택, Neutral fallback, Dashboard 배치,
  Inbox 저장·읽음·보관·검색·action 재검증과 개발 플러그인 원자적 upgrade·rollback을 구현했다.
- 공개 SDK `d6ac165a0b714dfbd35b0f2958579425548875bf` (`0.6.0`)에서 Core checkout 없이
  사용하는 Runtime·UI·Worker·Registry·Developer Build·Preview fixture 계약을 제공한다.
- Plugin Discovery & Builder `0.3.3`과 SPS Team Workplane `0.3.91`을 서로 다른
  reference contribution으로 연결했다.
- SPS Desktop `0.4.95` 설치 후보에서 로그인부터 Provider 비활성화 fallback까지
  실제 UI와 API를 함께 조작하는 격리 E2E를 통과했다.
- Core plugin upgrade 집중 회귀 73개와 Desktop 전체 회귀 237개를 통과했으며,
  실제 패키지 Core Preview smoke에서 production Workspace sentinel이 유지됨을 확인했다.
- 1~5단계 완료 조건을 충족했다. 현재 구현 기준선은 6단계 Workspace Job과
  Plugin Dependency다.

## 3단계. Developer Mode와 Local Development Registry

### 목표

개발 패키지를 production 플러그인과 혼동하지 않고 빠르게 시험한다.

### 작업

1. Host가 별도 플러그인 프로젝트 폴더를 Local Development Registry에 연결한다.
2. source hash와 build output을 추적하고 변경 상태를 표시한다.
3. validate와 test가 성공한 build만 staging할 수 있게 한다.
4. UI와 worker를 독립적으로 reload하고 실패한 build는 활성화하지 않는다.
5. 마지막 정상 build로 돌아가는 개발 rollback을 제공한다.
6. 개발 패키지, 공식 패키지, 개인 패키지를 UI에서 명확히 구분한다.
7. production Workspace에 직접 연결하지 않고 개발 Workspace를 기본 대상으로 한다.

### 완료 조건

- 설치 폴더를 수정하지 않고 외부 프로젝트 변경을 SPS에서 감지
- 문법·manifest·capability 오류가 기존 정상 플러그인을 중단하지 않음
- Host가 development build의 출처와 위험을 항상 확인 가능
- SPS 재시작 후 연결된 개발 프로젝트와 마지막 정상 build 복구

### 현재 구현 상태

- 외부 프로젝트의 canonical path와 source/output SHA-256을 Owner Vault에 저장하며
  renderer에는 실제 경로를 노출하지 않는다.
- SDK CLI의 build, validate, test가 동일한 source/output tuple에 성공한 경우에만
  immutable `.spsplugin` 후보를 만든다.
- 후보는 production Workspace가 아닌 격리 Preview에만 stage·activate하고,
  Preview UI 로드 성공 뒤에만 Last Known Good로 승격한다.
- 실패한 후보는 기존 정상 build를 바꾸지 않으며, 마지막 정상 archive로 rollback할 수 있다.

## 4단계. Plugin Preview와 격리 개발 Workspace

### 목표

메인 SPS 창에서 AI와 개발하고 별도 창에서 실제 결과를 확인한다.

### 사용자 흐름

```text
메인 SPS 창
  -> Assistant 대화
  -> 파일 변경, 로그, 테스트, 패키지 상태 확인

Plugin Preview 창
  -> 격리 개발 Workspace
  -> 실제 plugin page, sidebar, settings, Dashboard, Inbox 확인
  -> Host/Member, empty/loading/error 상태 전환
```

### 작업

1. Core는 plugin ID, build ID, preview Workspace의 headless runtime 계약을 제공하고
   Desktop이 별도 격리 창의 생명주기를 소유한다.
2. Preview 전용 DB namespace와 임시 Workspace를 만든다.
3. production Source, secret, Node grant는 기본적으로 전달하지 않는다.
4. Test fixture로 Host, Member, Node, Runtime, Source 상태를 주입한다.
5. desktop, 좁은 창, 빈 상태, 오류 상태를 전환할 수 있게 한다.
6. Preview에서 발생한 action과 오류를 메인 SPS Diagnostics로 보낸다.
7. Preview 종료 시 임시 실행과 데이터 정리 여부를 사용자가 선택한다.

### 완료 조건

- 메인 SPS와 Preview를 동시에 사용 가능
- Preview가 production Workspace와 Host 프로젝트 파일을 변경하지 않음
- 같은 build ID로 재현 가능한 Preview 세션 생성
- Preview renderer 실패가 메인 SPS를 종료시키지 않음

### 현재 구현 상태

- build별 Preview Vault, embedded DB, storage, secret key, 로그, 임시 Workspace와
  loopback access token을 production Owner Vault 실행과 분리했다.
- Preview 프로세스는 허용된 최소 환경변수만 받고 production secret, Source path,
  Node grant를 상속하지 않는다.
- 공개 SDK의 읽기 전용 fixture 계약으로 Host/Member, Node/Runtime/Source,
  desktop/mobile, live/empty/loading/error 상태를 저장·주입한다.
- Preview 시작, Workspace, stage, activation, renderer, worker, fixture, cleanup 이벤트를
  최대 200개 보관하며 자격증명과 로컬 경로를 저장 전에 제거한다.
- Keep/Delete/Cancel 종료 선택과 안전한 프로세스 종료 후 build별 데이터 삭제를 구현했다.
- 실제 패키지 Core를 사용한 isolation·access-control·plugin activation smoke는 통과했다.
- 최신 `0.4.95` Windows 후보 앱에서 SPS Identity 로그인, Owner Host 생성, 메인 Workspace,
  Local Development Registry, 외부 SDK 플러그인의 build·validate·test, 격리 Preview,
  Host/Member·desktop/mobile·live/error 전환을 실제 UI와 IPC로 검증했다.
- Preview renderer를 독립적으로 중단한 뒤에도 메인 Workspace가 유지되고,
  오류 진단에 자격증명과 외부 플러그인 로컬 경로가 남지 않으며 임시 프로세스와 데이터가
  정리되는 실제 패키지 Electron E2E를 통과했다.

## 5단계. Diagnostics와 Test Kit

### Diagnostics 작업

- Manifest·compatibility·capability 상태
- Worker 시작, 중단, crash, restart 상태
- Tool 호출과 capability 거부 이유
- Event, Job, Run, Stream 상태
- UI contribution 렌더링 오류
- Connector·MCP 건강 상태
- migration plan, backup, rollback 상태
- Host와 Member에게 다르게 보이는 이유

Diagnostics는 raw secret, CLI credential, Host 실제 경로를 노출하지 않는다.

### Test Kit 작업

- mock Workspace, Host, Member, Node, Runtime, Source
- capability 허용·거부
- 네트워크 단절·재연결
- plugin enable·disable·update·rollback·delete
- migration 성공·실패
- Shell·Dashboard·Inbox contribution 충돌
- restart 후 state와 job 복구
- UI empty·loading·error·permission 상태

### 완료 조건

- 플러그인 repo에서 SPS Desktop 없이 대부분의 계약 테스트 실행
- 실패 원인을 개발자 콘솔이나 DB 조회 없이 Diagnostics에서 확인
- conformance 결과를 package metadata와 release 검토에 첨부 가능

### 현재 구현 상태

- 공개 SDK `0.6.0`에 `diagnostics/v1`, `testing/v1`, `conformance/v1`을
  추가했다. 플러그인 저장소는 SPS Desktop이나 Core checkout 없이 안전한 구조형
  진단, 결정적 in-memory Host·Member·Workspace fixture, 불변 conformance
  보고서를 사용할 수 있다.
- SDK는 raw command 출력, 자격증명, secret, 로컬 절대 경로, accessor와 순환
  객체를 진단·보고서에서 거부한다. 전체 공개 SDK 회귀 126개를 통과했다.
- Core는 plugin 상태와 최근 사실을 `sps-plugin-diagnostic/v1`로 정규화하고
  Host와 Member의 가시성을 분리한다. migration·backup·rollback 사실은 Host에게만
  보이며, 진단 서비스·API·설정 UI 집중 회귀 65개와 Shared·Server·UI 타입 검사를
  통과했다.
- Desktop Developer Mode는 build·validate·test·Preview 생명주기를 같은 표준
  원장에 기록하고 origin·category·level로 필터링한다. 후보 카드에는 conformance
  통과 수와 상태를 표시하며, 실패한 gate는 command·stdout·stderr 없이 안전한
  원인만 보여준다.
- Desktop 전체 회귀 242개를 통과했다. `0.4.95` Windows 후보 앱에서 로그인,
  Owner Host 생성, 외부 SDK 플러그인 연결과 세 gate, 격리 Preview, Host·Member,
  desktop·mobile, live·error 전환, Preview renderer 단독 crash를 실제로 조작했다.
  `PREVIEW_RENDERER_GONE` 진단을 프로젝트별로 조회하고 자격증명·외부 경로가
  노출되지 않으며 메인 Workspace와 정리 절차가 유지됨을 확인했다.
- 5단계 완료 조건을 충족했다. 다음 구현 기준선은 Workspace별 Job 격리와
  명시적 Plugin Dependency 계약이다.

## 6단계. Workspace Job과 Plugin Dependency

### Workspace Job

- Job이 대상 Workspace를 명시한다.
- 플러그인이 해당 Workspace에서 비활성화되면 실행하지 않는다.
- 재시작 복구, 중복 실행 방지, 취소, retry 상태를 Core가 관리한다.
- Host-global 유지보수 Job은 별도 유형으로 명시한다.

### Plugin Dependency

- 필수 dependency와 최소·최대 호환 버전
- 선택 dependency와 service discovery
- 충돌 plugin 선언
- dependency 비활성화·삭제 전 영향 preview
- dependency 손실 시 blocked 상태와 복구 행동
- 순환 dependency 차단

### 완료 조건

- 여러 Workspace에서 같은 플러그인의 Job이 독립적으로 동작
- 비활성 Workspace에서 Job이 실행되지 않음
- dependency가 없는 플러그인을 활성화하기 전에 명확한 설명 제공
- dependency 변경이 자동 설치나 자동 활성화를 일으키지 않음

### 현재 구현 상태

- SPS Core `dc5e8d2c29912361bcce715175f0186824b757a9`에 Workspace Job과
  `sps-plugin-dependency/v1` 계약을 반영했다.
- 공개 SDK `0.7.1`은 `requiredDependencies`, `optionalDependencies`,
  `conflicts`, `services`를 검증하고 기존 플러그인 ID 호환성을 유지한다.
- 필수 dependency 손실·버전 불일치·충돌·순환은 활성화와 Workspace Job 실행을
  차단한다. 선택 dependency 손실은 기능 저하 상태로 보고하되 실행을 막지 않는다.
- Host 비활성화·삭제와 Workspace 비활성화는 영향 Preview의 정확한
  `impactReviewId` 없이는 실행되지 않으며, 확인 후에도 의존 플러그인을 연쇄 변경하지
  않는다.
- Core 플러그인 회귀 29개 파일 275개, Desktop 전체 회귀 242개, Shared·Server 타입
  검사를 통과했다.
- SPS Desktop `0.4.96` Windows 설치 후보의 실제 packaged Owner Host에서 직접
  브라우저 차단, 기본 메모리·Discovery·Room, 공개 SDK 워커, Registry
  설치·업그레이드·롤백, dependency 영향 검토·차단·복구 E2E를 통과했다.
- 6단계 완료 조건을 충족했다. 다음 구현 기준선은 Core Marketplace Assistant의
  읽기 전용 도구와 Plugin Builder의 외부 프로젝트, 증거 원장, Preview 연결이다.

## 7단계. Core Marketplace Assistant와 Plugin Builder 완성

### 7단계 실행 순서

| 작업 묶음 | Core 책임 | Plugin 책임 | 완료 증거 |
| --- | --- | --- | --- |
| 7A. 일반 Marketplace | Catalog snapshot, 검색·상세 API, `Settings > Plugins` UI | 없음 | AI 어댑터 없이 검색·상세 조회 E2E |
| 7B. Marketplace Assistant | 대화 UI·세션·adapter 선택·read-only tool broker | 없음 | 서로 다른 adapter 회귀, lifecycle 호출 0회 |
| 7C. Plugin Builder | 공개 SDK, 외부 프로젝트·Preview·Diagnostics 기반 | Builder가 제작 workflow와 도구 제공 | 외부 폴더에서 생성·검사·Preview·package |
| 7D. Host 수동 생명주기 | 상세 검토, install·enable·update·rollback·remove | Builder는 package까지만 생성 | Host가 직접 누른 경우에만 상태 변경 |
| 7E. 패키지 통합 | Desktop 환경변수·Catalog 갱신·보안·복구 | 번들 Builder 패키지 | 설치본 smoke와 실제 Electron 조작 |

7A부터 순서대로 통과한다. 7B가 7D의 lifecycle API를 호출하거나, 7C가
Marketplace Assistant의 대화 세션을 재사용하는 식으로 책임을 합치지 않는다.

### 최종 사용자 흐름

1. 사용자가 `Settings > Plugins > Marketplace`를 연다.
2. AI 없이 키워드·카테고리·호환성·검증 상태로 검색할 수 있다.
3. 자연어 추천이 필요하면 자신에게 허용된 AI 어댑터를 선택한다.
4. Marketplace Assistant가 Core의 읽기 전용 검색·상세 조회 도구를 사용한다.
5. Assistant가 후보를 비교하고 추천 이유와 필요한 capability를 설명한다.
6. 사용자가 결과에서 Core 플러그인 상세 화면을 연다.
7. 설치하려면 Host가 상세 화면에서 `Install & Enable`을 직접 누른다.
8. 적합한 플러그인이 없고 새 제작이 필요하면 Plugin Builder를 연다.
9. Builder가 별도 프로젝트 폴더에서 SDK로 manifest, worker, UI, tests를 작성한다.
10. 메인 SPS에서 변경 파일, 로그, 테스트 결과를 보여준다.
11. Plugin Preview에서 실제 결과를 확인한다.
12. 검증을 통과하면 `.spsplugin`과 Local Registry release를 만든다.
13. 제작 결과도 `Settings > Plugins`에서 Host가 직접 설치·활성화한다.

### Core Marketplace Assistant 계약

- Marketplace UI, 대화 세션, adapter 선택, Catalog query broker는 Core가 소유한다.
- 실제 모델은 Core에 고정하지 않고 사용자가 사용할 수 있는 AI 어댑터로 실행한다.
- 대화는 `사용자 + Workspace` 범위로 분리하고, 어댑터 접근 권한을 매 호출에 확인한다.
- AI 어댑터가 없거나 한도에 도달해도 일반 검색과 상세 조회는 계속 작동한다.
- Core는 `search_marketplace_plugins`와 `get_marketplace_plugin`만 제공한다.
- 검색 결과는 Core가 정규화한 식별자, 버전, 제작자, 검증 상태, 호환성,
  capability, dependency, 가격 정책, 내부 상세 ID로 제한한다.
- raw package 경로, 다운로드 URL, secret, Registry 서명 키는 AI에게 전달하지 않는다.
- 검색·비교·추천·상세 조회는 어떤 Plugin lifecycle 상태도 변경하지 않는다.
- AI에는 install, enable, update, disable, remove API나 typed tool을 제공하지 않는다.
- Host 수동 설치는 기존 Registry staging, 정적 검증, capability·migration 검토,
  rollback 계약을 그대로 사용한다.
- Assistant transcript에는 사용자 질문, 모델 답변, 사용한 read-only tool의 공개
  결과만 저장한다. Builder의 파일 변경, build, test, Preview 증거는 Assistant
  transcript가 아니라 Builder 프로젝트의 증거 원장에 저장한다.

### Plugin Builder 계약

- Plugin Builder는 Marketplace Assistant와 분리된 번들 플러그인이다.
- 제작 전용 typed tool은 project 생성, authoring step, build 검사, Preview로 제한한다.
- Builder는 별도 프로젝트 폴더와 append-only 증거 원장을 사용한다.
- Builder는 package와 Local Registry release를 만들 수 있지만 설치하지 않는다.
- 제작 AI는 사용자에게 허용된 Agent·Runtime을 사용하며 모델에 종속되지 않는다.

### 현재 구현에서 변경할 부분

- Plugin Discovery에서 Catalog 검색과 대화 UI를 Core Marketplace로 이동한다.
- 기존 `createLifecycleProposal` 공개 SDK 계약, Worker tool, Desktop 검토 패널을 제거한다.
- Core Marketplace에 읽기 전용 search/detail API와 AI adapter dispatch를 추가한다.
- 일반 검색 UI와 Assistant 대화 UI가 같은 필터·상세 모델을 사용하게 한다.
- draft-only manifest 결과를 실제 plugin project 생성 흐름과 연결한다.
- Builder session과 append-only 증거 원장을 유지하면서 file changes, run, test를 연결한다.
- Preview와 Diagnostics 결과를 Builder 작업 화면에서 같은 build ID로 참조하게 한다.

### 현재 구현 상태

- 7A 백엔드: Desktop이 생성하는 검증된 Marketplace Catalog snapshot과 일치하는
  검색·상세 API, 회사 접근 검증, 공개 필드 정규화를 구현했다.
- 7A UI: `Settings > Plugins`의 Installed/Marketplace 분리, AI 없는 검색·상세
  화면을 구현하고 집중 회귀를 통과했다.
- 7B 계약: 공개 SDK `0.10.0`에 `searchCatalog`, `getCatalogPlugin`만 남기고
  lifecycle proposal 계약을 제거했다. Core Assistant의 adapter 실행·대화 UI는 진행 중이다.
- 7C 기반: 기존 Discovery 패키지에서 project 생성, authoring step, build 검사,
  Preview 도구를 분리할 준비를 완료했다. 최종 Builder 패키지 분리는 남아 있다.
- 7D: 기존 Core Host 수동 Registry 생명주기를 재사용하며 Assistant와 Builder에는
  생명주기 도구를 노출하지 않는 회귀를 추가해야 한다.
- 7E: SDK `0.10.0`, Core·Builder 정확한 revision, Catalog 환경변수를 Desktop
  release baseline에 고정하고 설치본 Electron E2E를 통과해야 한다.

### 7단계 구현 체크리스트

- [x] Marketplace search/detail 데이터 계약 확정
- [x] lifecycle proposal SDK·Worker·Desktop UI 제거
- [x] AI 없는 Core Marketplace 검색·상세 기반 구현
- [ ] 사용자에게 허용된 Agent·adapter 목록과 선택 UI
- [ ] `사용자 + Workspace` Assistant session 생성·복구·종료
- [ ] 두 read-only tool만 주입하는 adapter-neutral 실행 경로
- [ ] Assistant 응답 streaming·오류·한도·재시작 복구
- [ ] Discovery 검색 UI 제거와 독립 Plugin Builder 패키지 전환
- [ ] Builder 외부 프로젝트·증거 원장·Preview·package E2E
- [ ] Host 수동 생명주기 무변경/변경 회귀
- [ ] Windows packaged Desktop 전체 E2E와 release evidence

### 완료 조건

- AI 없이 Marketplace 검색과 상세 조회 가능
- 어댑터별 Assistant 대화가 격리되고 허용되지 않은 어댑터는 선택 불가
- 추천만 요청하면 Workspace와 Plugin lifecycle에 변화가 없음
- Assistant 실행 중 설치·활성화 Core API 호출이 0회임을 테스트로 증명
- 제작 요청으로 외부 plugin project와 재현 가능한 build 생성
- Preview 검증 전 production 활성화 불가
- Host가 설정 화면에서 직접 누른 경우에만 lifecycle 변경
- AI 어댑터를 바꿔도 같은 read-only Marketplace tool 계약으로 동작

## 8단계. Reference Plugin과 실제 E2E

### 필수 reference plugin

1. Plugin Builder
   - 외부 프로젝트 제작, 검사, Preview, package의 전체 reference
2. Core Marketplace Assistant fixture
   - 일반 검색, AI 어댑터 dispatch, read-only 도구, 무변경 증거
3. SPS Team Workplane
   - Shell Provider, Rooms, Tasks, Dashboard widget, Inbox report, Workspace Job
4. SPS Default Memory
   - 교체 가능한 provider, lifecycle, backup, 상태 widget
5. 최소 Access Control example
   - Core Host·Member와 분리된 plugin 업무 역할·권한 reference

게임, 웹, 앱 플러그인은 이 Gate가 끝난 뒤 starter pack으로 추가한다.

### E2E 시나리오

- 빈 Workspace와 Core Marketplace 일반 검색
- 서로 다른 AI 어댑터로 검색·비교하고 lifecycle 무변경 확인
- 새 plugin project 생성, 코드 작성, test, Preview
- package 생성 후 Host가 설정 화면에서 직접 설치·활성화
- Host와 Member의 서로 다른 권한·Node·Runtime
- Dashboard와 Inbox contribution
- Worker 완료 보고와 action 재검증
- plugin update, migration review, rollback
- Shell plugin crash와 Safe mode 복구
- Member 제거, Node 철회, 재시작, Desktop update

### 완료 조건

- 실제 설치된 Windows Desktop 두 대에서 전체 시나리오 통과
- 코드상 테스트와 직접 앱 조작 결과를 release evidence로 저장
- 공개 SDK example이 private SPS source 없이 재현 가능
- 실패한 단계는 사용자에게 원인과 다음 행동을 설명

## 위험도 기반 변경 정책

| 등급 | 예 | 처리 |
| --- | --- | --- |
| 낮음 | UI 문구, 스타일, read-only widget | 일반 update와 rollback |
| 검토 필요 | 새 capability, migration, secret, connector | 정확한 변경 요약과 Host 검토 |
| 강한 확인 | 데이터 삭제, 외부 반출, 대량 실행, 유료 API | 명시적 확인, 감사 기록, backup 또는 복구 기준 |

첫 플랫폼 릴리스에서는 destructive SQL migration을 허용하지 않는다. migration은
플러그인 namespace 안에서만 동작하고 적용된 checksum을 바꿀 수 없다.

## 구현하지 않아도 플러그인 제작을 시작할 수 있는 항목

다음은 Core 제작 Gate가 아니다.

- 유료 Marketplace, 결제, 환불, 평점
- 공개 커뮤니티 업로드
- 게임·웹·앱 완성형 공식 플러그인
- macOS와 Linux
- 공개 심사 Developer Portal
- 다중 네트워크 provider

## 권장 실행 순서

```text
공개 Runtime SDK
  -> Shell / Dashboard / Inbox
  -> Developer Mode
  -> Plugin Preview
  -> Diagnostics / Test Kit
  -> Workspace Job / Dependency
  -> Core Marketplace Assistant
  -> Plugin Builder 완성
  -> Reference Plugin E2E
  -> 비공개 Beta
```

각 단계는 독립 branch와 테스트 증거를 남긴다. 다음 단계가 이전 단계의 미완성
내부 API를 직접 참조하지 않게 하고, 공개 SDK와 packaged Desktop을 기준으로
통합한다.

## Core 플러그인 제작 기반 완료 정의

다음을 모두 만족하면 Core의 플러그인 제작 기반이 완료된 것으로 본다.

- 외부 개발자가 private SPS source 없이 플러그인을 만들 수 있다.
- AI와 사람 개발자가 같은 SDK, CLI, Preview, Test Kit를 사용한다.
- 플러그인이 Workspace별로 독립 활성화되고 안전하게 update·rollback된다.
- Shell, Dashboard, Inbox를 사용해 서로 다른 업무 환경을 구성할 수 있다.
- Host·Member·Node·Runtime·Source 경계가 실제 두 컴퓨터에서 유지된다.
- 플러그인 실패가 SPS 설정과 복구 경로를 막지 않는다.
- 검색·추천과 설치·활성화가 명확히 분리된다.
- AI는 lifecycle 도구를 받지 않으며 Host의 수동 설정 동작만 lifecycle을 변경한다.
- Team Workplane, Default Memory, Plugin Builder reference가 Core 수정 없이
  동작한다.
