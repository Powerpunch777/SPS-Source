# Builder 선행 기반 완료 감사

2026-11-02. [실행 계획](BUILDER-PREREQUISITES-EXECUTION-PLAN-2026-11-02.md)의 A–G만 대조한다.
전체 Builder v15/118개 AC, Stable 출시 자격 또는 Core 전체 완료 감사가 아니다.
판정은 아래 표의 각 완료 조건에 한정한다.

후속 사용자 지시로 첫 목표는 Builder 완성으로 바뀌고 필요한 선행 구현을 재개한다.
[최신 계획](BUILDER-FIRST-IMPLEMENTATION-PLAN-2026-11-02.md)이 아래 중단 시점의
문서 전용 표현보다 우선한다. 과거 검증 범위와 미완료 판정은 바꾸지 않는다.

## 사용자 재확인과 용어

Tailscale을 대체할 **자체 Native LAN 신규 개발은 계속 보류**한다. 기존 Tailscale과
기존 구현은 유지하며 계정·인증서·포트·방화벽·장치 등록을 바꾸지 않는다. 독립 **Core
설정창**은 앱 내부의 관리·복구 UI이며 LAN 기능이 아니다. 두 기능을 같은 이름으로
뭉뚱그리지 않는다. Core 기존 독립 설정과 Plugin 오류 시 복구는 설계상 필요한 잔여
범위로 유지한다. 다만 현재 승인된 작업은 이 문서 정리뿐이며, 지금 구현하거나 시험하지
않는다. 잔여 범위를 Builder 선행 조건의 무한 확장 근거로 삼지 않는다.

Lead/CTO/Worker의 업무 의미를 Core에 강제로 넣지 않는다. Marketplace, 전체 Builder
v15 범위 또는 Stable 조건을 이 A–G 감사의 선행 조건으로 확대하지 않는다. 미완료를
숨기거나 전체 목표 완료로 표시하지 않으며, 현재 기록의 증거 경계를 유지한다.

Preview 개발과 추가 Preview 시험도 현재 보류한다. 아래 기록된 Preview 구현·시험은
과거 시점의 사실로 보존하며 현재 선행 조건, 추가 시험 요구 또는 안전 승인으로 해석하지
않는다. 생성 코드 보호가 지원되지 않거나 입증되지 않은 경로를 자동 허용하지 않는다.
현재 작업 초점은 실제 Core·공개 SDK·Lead 경로다.

## 기준과 증거 경계

- 감사 대상 Source는 부모가 Git에서 확인한 `db9dd6e7ace0a15105dd7b62315c9c76ff498711`이다.
  Core 계약 기준 `3abf1f5`, 공개 SDK source pin `0111d29`. 사용자가 특정 SHA를 지정한 것은 아니다.
- Builder의 기록된 앱 runtime: Worker/UI `b874181`, operator `9fdb553`.
  취소 후속 앱 기록은 Source `a69f68c`, Core `3abf1f5`, SDK `0111d29`에서 남겼다.
  앞선 실제 답변/재시작 기록은 Source `c8c6b46`의 별도 시험이다.
- 이 revision들은 [진행 기록](BUILDER-PREREQUISITES-PROGRESS-2026-11-02.md)과 별도 공개
  [Lead 앱 증거](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/5ab214ab3c7fb32becc4741e381773196c9c0ec9/docs/implementation/LEAD-DURABLE-CHAT-2026-11-02.md)에 기록된 실행 대상이다.
  현재 Source에서 새로 실행했다는 뜻이 아니다.
- 본 감사에서는 문서, 현재 코드, 테스트 소스를 읽었다. 자동 테스트, 빌드, Electron 앱 또는
  실기기를 실행하지 않았다. 아래 “기록 증거”는 앞선 기록의 결과이며 이번 감사의 재검증이 아니다.
- 구현 존재, 자동 테스트, 실제 앱 동작은 별개의 근거로 다룬다. 미지원 실행이나 OS 보호를
  문서·API·renderer sandbox만으로 완료 처리하지 않는다.

## A–G 판정

아래 소스 검토 표의 `Native` 관리 표현은 LAN이 아닌 독립 Core 설정창을 뜻한다.
자체 Native LAN은 Tailscale 대체 네트워크 기능을 뜻하며 별도 보류 범위다. B의 Core
독립 설정 및 Plugin 오류 복구 잔여는 설계상 필수로 남지만, 이번에는 문서만 정리하고
구현·시험하지 않는다. 표에 적힌 미완료/후속 권고는 현재 구현 승인이 아니며, 초기
감사 때의 “부모가 구현 중” 표현은 현재 상태에 적용하지 않는다.

D의 주 구현 근거는 private Core `server/src/services/sps-session-dispatches.ts`,
`sps-session-dispatch-context.ts`, `plugin-host-services.ts`, migration0178과 관련 회귀다.
Desktop `plugin-runtime.mjs`만으로 private receipt가 구현됐다고 입증하지 않는다.
E의 분할 저장 주 근거는 Builder `src/lead-conversations.ts`, `src/platform.ts`,
`src/ui/index.tsx`, `BuilderShell.tsx`와 해당 테스트다. 세션 준비 파일만으로 채팅 저장을
입증하지 않는다. Core89/89, 공개 SDK191/191, Builder87/87과 실제 답변/취소 기록은
위 진행 기록의 정확한 tuple에 한정한다.

| 단계 | 판정 | 완료 범위와 authoritative 근거 | 남은 일 |
| --- | --- | --- | --- |
| A 기존 기반 대조 | 입증됨 (조사 산출물 한정) | 계획의 재사용 우선 조건과 [진행 기록 §A](BUILDER-PREREQUISITES-PROGRESS-2026-11-02.md)의 Native Settings/Registry, Workspace surface, SDK 세션, Builder 연결 위치를 코드와 대조했다. 아래 단계별 파일은 실제 경계를 보여준다. | 새 서버·DB·범용 큐를 선행 추가하지 않는다. Core plugin emergency control을 Workspace 실행 제어와 혼동하지 말고 아래 B의 설계 잔여를 보존한다. 이는 자체 Native LAN과 별개다. |
| B 독립 관리·복구 | 부분 완료 | `desktop/src/core-settings-controller.mjs`, `core-settings-preload.cjs`, `renderer/core-settings.html`, `renderer/core-settings.mjs`는 Host 없이 별도 Settings에서 Sources 창을 열고 Workspace 목록/상태 및 pause/stop/resume 경로를 제공한다. Native IPC는 Host 권한·요청자 재검사와 표시 revision을 확인하고, stop은 확인 callback을 요구한다. [진행 기록 §B와 후속 Native Workspace 제어](BUILDER-PREREQUISITES-PROGRESS-2026-11-02.md)는 앱에서 Sources 독립 진입과 Workspace 제어를 시험한 결과를 구분해 기록한다. | Sources 접근은 플러그인별 실행 생명주기 제어가 아니다. Plugin 단위 비활성화/정지, 비활성화 중 이미 실행 중인 작업의 취소·종료 확인, 안전한 상태 초기화 및 Plugin 오류/손상/Host 오류 뒤 복구가 독립 Core 경로에서 아직 완결되지 않았다. Core 기존 독립 설정과 Plugin 오류 시 복구는 설계상 필수 잔여다. 실행 중인 플러그인 코드가 관리 동작에 끼어들거나 막지 못하도록 Core/Main 전용 경로에서 처리하고, destructive reset은 영향 범위·보존 데이터·확인/취소를 먼저 보여주며 재확인해야 한다. 실패·불명 상태에서는 데이터 보존 및 자동 재시작 금지를 검증한다. 현재는 문서 정리만 승인되어 구현·추가 시험은 하지 않는다. 이 잔여를 자체 Native LAN 보류와 혼동하거나 Marketplace/전체 v15/Stable 선행 조건으로 확대하지 않는다. |
| C 선택형 Plugin 화면 | 입증됨 (Builder page 경로) | Core의 Plugin route가 선언된 contribution을 통해 기본 Core Layout 없이 렌더링되도록 분리했다. [진행 기록 §C](BUILDER-PREREQUISITES-PROGRESS-2026-11-02.md)는 module loading 누락과 높이 공백을 실제 앱에서 찾아 보완한 이력 및 viewport 검사를 기록한다. 별도 Builder의 기록된 앱 시험은 page에서 Core 프레임이 빠지고 가로·세로 공간을 채우는 결과를 포함한다. | 이 완료 표시는 요청된 선택형 no-Core-chrome Builder page에 한정한다. 다중 전용 창, headless, 모든 오류/복구 UI를 포함한다고 일반화하지 않는다. |
| D 전송·복구 계약 | 해당 첫 Lead 경로에서 입증됨 | private Core의 request receipt/migration과 공개 SDK의 `sendMessage(requestId)`, `getRequest`, `getRun`, `cancel` 경로를 대조했다. 구현 위치는 `desktop/src/plugin-runtime.mjs`, `desktop/test/plugin-runtime.test.mjs`, `external/sps-plugin-sdk/worker/index.mjs`, `external/sps-plugin-sdk/worker/index.test.mjs` 및 계획의 migration 기록이다. 같은 receipt 조회와 불확실 상태의 재전송 금지 at-most-once admission을 사용한다. | provider exactly-once나 자식 프로세스 OS 격리는 보장하지 않는다. 기록 범위 밖의 Host/Worker 재시작, 권한 회수, 동시 충돌 및 provider 불확실성 사례는 각 계약의 테스트·UI에서 계속 fail-closed로 다뤄야 한다. |
| E 대화 저장·Builder 연결 | 해당 Builder 채팅 경로에서 입증됨 | Builder `src/lead-conversations.ts`, `test/lead-conversations.test.ts`와 위 고정 revision의 내구 채팅 기록은 turn/index 및 제한 페이지, 채널별 transcript, 실제 응답/error/cancel 구분을 명시한다. snapshot 무한 누적을 피하며 `cto-inbox`에 사용자 전송을 허용하지 않는다. | 세 Lead 대화 분리는 공유 Lead 기억을 뜻하지 않는다. 이 문서 범위의 페이지 저장/조회와 화면 연결은 검증됐지만 Graph 기억, 위임 역할/업무 도구는 계획 범위 밖 후속이다. |
| F Lead 실제 앱 검증 | 명시된 live 경로에서 입증됨 | 별도 기록은 실제 UI 전송, CLI/provider 응답과 assistant 말풍선, Main/Host 재시작 후 같은 turn/run/session 유지, 동일 request 재확인에도 실행 1회, 뒤이어 실제 중단·관리 PID 종료 및 취소 상태 재시작 유지를 기록한다. 앞선 답변 시험과 취소 후속의 Source revision은 위 기준을 참조한다. | 기록은 승인된 짧은 비밀 없는 시험이며 전체 자식 OS 보호, 실제 사용자 데이터, 모든 provider나 Stable/실기기 자격을 입증하지 않는다. 이번 감사에서는 재실행하지 않았다. |
| G Preview/생성 코드 안전 게이트 | 보류, 미완료 | 계획의 보호 조건과 `desktop/src/plugin-preview-operation-gate.mjs`, `plugin-preview-runtime.mjs`, 관련 gate/smoke/e2e 테스트 및 아래의 과거 검증 기록은 기존 Preview 작업이 있었음을 보여준다. [진행 기록의 미완료 목록](BUILDER-PREREQUISITES-PROGRESS-2026-11-02.md)은 OS 파일/Vault/자식 보호가 입증되지 않았음을 명시한다. | 현재 Preview 개발·추가 시험은 하지 않으며 선행 조건도 아니다. 기존 구현·검증은 과거 사실로만 보존한다. 생성 코드 보호가 미지원이거나 입증되지 않은 경로를 자동 허용하지 않는다. Preview 재개나 안전 승인은 이 감사에서 결정하지 않는다. |

## Native 관리 세부 대조

독립 Native 진입이 있다는 사실과 플러그인별 emergency control은 다른 완료 조건이다.
현재 Settings의 `change-workspace-execution`은 Workspace 실행 pause/stop/resume 계약이다.
`set-plugins-disabled`는 전역 복구 설정이며 개별 Native Plugin의 lifecycle/reset API로 대체 해석할 수 없다.
별도 Registry/Sources 창은 설치·source·staged review 진입점이지 Plugin 코드가 없는 관리 격리면 그 자체는 아니다.
Host 불능 상태에서 설정창을 열 수 있다는 것은 Workspace 목록·제어 API도 Host 없이
성공한다는 뜻이 아니다. LAN 개발 재개나 모든 관리 action 중 대상 코드 미실행을
보증하지 않는다.

따라서 B의 향후 완료 증거는 기존 독립 Core 설정 화면 또는 별도 Core 관리 UI에서 아래를 확인해야 한다. 이는 Tailscale을 대체하는 자체 Native LAN 개발과 무관하다. 현재 승인 범위는 문서 정리뿐이므로 아래 acceptance를 구현하거나 시험하지 않는다.

- Plugin이 오류/비활성/Host 미시작 상태여도 관리 화면을 열고 현재 설치·활성·실행 상태를 읽는다.
- 특정 Plugin 비활성화와 중단이 새 실행을 막고, 기존 실행/관리 프로세스의 취소 요청 및 실제 종료/미확인 상태를 구분한다.
- reset은 먼저 지울 항목과 보존 항목을 표시한다. 명시적인 사용자 확인 전에는 상태·설정·기록을 변경하지 않고, 취소 시 무변경이다.
- destructive action 전후에 현재 사용자·Host·Workspace·Plugin 소유권과 revision을 재검사한다. 불명확한 응답을 자동 반복하지 않는다.
- 관리 화면·action은 Plugin renderer/worker를 통하지 않는 Main/Core 소유 경로로 실행한다. 비활성화 또는 긴급 중단이 대상 plugin code의 정상 응답에 의존하지 않는다는 회귀와 앱 증거를 남긴다.
- 고장/복구 경로에서 기존 user data를 묵시적으로 제거하거나 plugin을 자동 재활성화하지 않는다. 복구 불가 시 보존과 명시적 오류를 우선한다.

위 항목은 아직 완료 표시가 아니라 Core 독립 설정 및 오류 복구의 구체적인 설계 잔여다.
현재는 문서 정리만 진행하며 구현·회귀 시험·실제 앱 검증은 하지 않는다. 별도 후속
승인 전에는 진행하지 않으며, 승인되더라도 Lead/CTO/Worker 업무를 Core에 강제하거나
Marketplace/전체 v15/Stable 조건을 이 잔여의 범위로 끌어오지 않는다.

## CI 상태 구분

Source c8c6b46의 두 run에서 Linux9개 shard 및 전체 타입검사/build는 성공했다.
Windows의 역사 schema `20 !== 19` 실패는 a69f68c의 exact journal 비교와 실제 임시
PG157+20/12행 보존·백업 복원 시험으로 보완했다. 그러나 db9dd6e push run41380873481은
별개의 private-desktop 복구 확인창 component 시험에서 실패했다. 같은 HEAD의 PR
run41380878666은 완료된 실패다. 역사 schema upgrade는 성공했지만 다음 Main restore의
고정 개수 `177 !== 176`, Linux server1/3 watchdog 첫 사례의 5초 timeout, 앞 단계 실패로
누락된 installer artifact가 각각 실패했다. 성공한 단계만 합쳐 전체 성공으로 표시하지 않는다.
후속 로컬 Main restore는 현재 journal 파일 집합 대조로 고쳐 집중17/17 및 실제 source 앱
복원·재시작·두 Workspace 데이터/첨부·정리까지 통과했다. 정확한 명령과 제한은 진행 기록을
따른다. 새 hosted 전체 성공이나 installer/Stable 자격으로 일반화하지 않는다.
Hosted Windows 이후 단계와 설치/서명/실기기/Identity 운영·Stable은 여전히 별도다.

## Electron 동작 참고

복구/중단 동작은 창을 닫는 것과 같지 않다. Electron 공식 [`app` API](https://www.electronjs.org/docs/latest/api/app)는 `app.quit()`이 정상 종료 lifecycle을 거치는 반면 `app.exit()`은 창을 즉시 닫고 `before-quit`/`will-quit`을 건너뛴다고 명시한다. 따라서 앱 종료 lifecycle 코드만으로 사용자가 누르는 Plugin 중단·reset의 성공을 주장하지 않으며, 대상 작업의 취소와 종료 상태를 별도 계약으로 확인한다. Electron 문서는 SPS의 권한·데이터 보존 또는 OS 격리 증거가 아니다.

## 결론

과거 후속 runtime `9c3230116dd80e8fdda401f8cfb5353406f2c375` 검증에서는 기존 Developer Mode의
실행 진입점 5곳을 보완했다. 미지정/`protected`는 실제 Main에서 동작 전에 거부하고,
기존 경로는 매번 경고를 확인한 `trusted-local`로만 선택한다. Source 앱에서 10개 거부와
Preview 미시작을 확인한 뒤 고정된 신뢰 fixture만 시험했다. 전체 Desktop2244개 중
2241pass/3skip/0fail, source Preview 앱 exit0과 정리를 확인했다. 이는 OS 격리 구현이
아니며 모든 생성 코드 경로의 G 전체 완료로 확대하지 않는다. 이 기록은 과거 실행 결과이며
현재 Preview 개발·추가 시험 요구나 미지원 보호의 자동 허용 근거가 아니다. 정확한 명령·한계는
[개발 실행 진입 검증](../reviews/DEVELOPER-EXECUTION-ADMISSION-2026-11-02.md)을 따른다.

이 범위에서 Lead의 durable public SDK send/output/cancel/restart/page 흐름은 기록된 실제 Builder 앱 시험까지 도달했다. Optional no-Core-chrome Builder page도 기록된 앱 검증이 있다. **A–G 전체 완료는 아니다.** 현재 초점은 실제 Core·공개 SDK·Lead 경로다. Core 기존 독립 설정과 Plugin 오류 복구의 설계 잔여는 필수로 보존하지만, 이번 승인 범위는 이 문서 정리뿐이며 구현·시험하지 않는다. Lead/CTO/Worker 업무를 Core에 강제하지 않고, Marketplace·전체 v15·Stable 조건을 선행 범위로 확대하지 않는다. 자체 Native LAN 개발과 Preview 개발·추가 시험은 보류하며 Tailscale 및 기존 Preview의 과거 구현·검증 기록은 유지한다. 생성 코드 보호가 지원되지 않거나 입증되지 않은 경로를 자동 허용하지 않는다. 이 판정은 전체 118개 Builder 계획 또는 Stable 승인을 뜻하지 않는다.
