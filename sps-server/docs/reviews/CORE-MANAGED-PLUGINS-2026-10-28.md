# 승인 패키지 중심 Core 정리와 생명주기 보완 — 2026-10-28

**전체 SPS Core 완성은 아직 확인되지 않았다.** 이 기록은
[확정 제품 정책](../current/CORE-COMPLETION-POLICY-ko.md)을 반영한 구현과 선택 검사다.
공개 Marketplace·Builder 신규 개발·완전한 비신뢰 OS 격리를 필수 조건에서
분리했지만 실제 Core 결함과 검사 실패를 완료로 바꾸지 않는다.

Core 소스: `2b1a7365da7f931f3d163b1ac0e28c60b48af656`.
Desktop `0.4.137` development-candidate와 SDK
`61a929f6c783f78e5af603682de1543c7e24abc0`(미출시 `0.11.0`)는 유지한다.
gitlink·support matrix·생성된 CURRENT-CANDIDATE를 함께 맞췄으며 문서 생성/검사와
선택 검사 4개가 통과했다. Source 자체 revision은 이 기록을 포함하는 커밋이다.

## 실제 변경

- 공개 검색·상세·추천/Assistant UI·HTTP route·OpenAPI 등록과 전용 MCP 실행기를
  제거한다. Core의 내부 카탈로그 조회, SDK의 관리용 metadata 계약, Registry
  staging·무결성·권한·버전·설치·업데이트·제거·롤백은 보존한다.
- 기존 `marketplace_assistant` 자격과 `spsMarketplaceAssistant` 실행 문맥은
  명시적으로 거부한다. 기존 DB 행/이력·scope 형식을 지워 일반 자격으로
  바꾸지 않는다. 일반 MCP와 Plugin 세션 도구는 유지한다.
- Desktop의 공개 Assistant MCP 환경 주입·필수 패키징/스모크를 제거하고,
  일반 생명주기 E2E의 ACP fixture는 특정 Marketplace 업무와 분리한다.
  새 Core 배포는 Builder를 자동 필수로 설치하지 않으며 기존 명시적 opt-in을 유지한다.
  기존 사용자 Plugin 설치·설정 행을 이 변경으로 삭제하지 않는다.
- Workspace 권한 revision이 바뀌면 해당 범위의 오래된 작업자만 정리한다.
  Workspace 설정은 그 Workspace, 전역 catalog 변경은 전체 pool의 이전 캡처를
  대상으로 하며 현재 revision의 새 작업자를 무조건 중지하지 않는다.
- Core 생명주기 공통 처리가 삭제·업데이트·재시작 전에 선택 Plugin의 Workspace
  작업자 종료를 확인한다. HTTP 이외 개발 reload도 같은 경계를 사용한다.
  설치는 Workspace 전체 admission을 막고 기존 작업자를 정리한 후 파일/DB 작업을 시작한다.
- 종료 미확인 시 정확한 handle·서비스 소유권을 유지하고 작업을 시작하지 않는다.
  이미 완료한 변경 뒤 정리가 실패하면 fixed 503과 완료 상태를 구분하고 audit/UI
  갱신을 유지한다. 결과를 private WeakMap에 보관해 오류 직렬화로 manifest/path가
  노출되지 않게 한다. 자동 재시도나 사용자 작업 재생은 추가하지 않는다.
- 비 HTTP 권한 변경도 5초 단일 실행 sweep으로 확인하며 종료는 sweep·진행 중
  mutation을 기다린다. DB 조회 실패는 자원 정리 성공이나 권한 유효의 근거가 아니다.
- `workspace-e2e-fixture.test.mjs`의 원래 7개 소유권/경로 검사를 복구하고 진단
  검사 2개를 추가했다. 임시 정리의 기존 소유권 검사·재시도·20초 deadline과
  성공 기준을 유지하며 고정 단계·시도·시간·errno 범주만 기록한다.
- 실제 SDK 작업자의 stdin EOF 정상 종료 검사를 추가했다. 정확히 새로 시작한
  ChildProcess의 close를 기다리고 실패 정리도 그 handle로만 수행한다.
- Workspace 삭제 전에 해당 Workspace admission·시작을 막고 소유한 작업자를
  정리한 뒤 실행 중지·취소를 요청한다. pending 작업이나 취소 실패가 있으면
  고정 503으로 데이터를 보존한다. 마지막 삭제 트랜잭션에서도 중지된 정확한
  epoch/revision과 pending 수를 잠금 아래 확인해 동시 resume는 409로 거부한다.
- Workspace 존재 여부를 명시적으로 확인한다. 삭제로 실행-control 행이 사라져
  기본 epoch 0이 반환되더라도 이전 작업자의 권한이 살아나지 않는다. 성공한
  미존재 조회만 stale 근거로 사용하고 DB 실패는 종료 확인으로 처리하지 않는다.

## 선택 검사와 증거 범위

각 실행은 겹치는 검사를 포함하므로 합산한 전체 검사 통과 수로 제시하지 않는다.

| 검사 | 확인 결과와 한계 |
| --- | --- |
| 생명주기 공통 처리·기존 restart·upgrade rollback | 3개 파일 19개 통과. 이후 private receipt 보완 helper 선택 5개 통과 |
| Workspace factory | 최초 reconciliation 13개, catalog install fence 보완 후 15개 통과. 서로 겹치는 실행 |
| 설치 fence | 선택 1개 통과. 최초 fixture의 instanceInfo 누락 실패를 수정한 후 통과 |
| 실제 SDK stdin EOF | 선택 1개 통과. cleanup의 실제 close 확인 보완 후 재통과. 자손 프로세스까지 증명하지 않음 |
| 권한·생명주기 route | 선택 2개 통과·79개 미선택. 저장된 activation과 완료된 disable의 503/audit/UI 확인 |
| OpenAPI | 8개 통과. 공개 route 없음과 내부 install/Registry/upgrade 유지 및 실제 route inventory 포함 |
| Source fixture | 원래 7개 + 추가 2개 중 7개 통과·2개 환경상 건너뜀. Windows symlink/별도 8.3 alias 생성 한계 |
| Core 기본 번들 선택 | 3개 통과. Builder 기본 OFF·명시적 opt-in·전체 번들 OFF 우선 유지 |
| 일반 Desktop E2E harness/Node poller | 선택 Node 검사 5개 통과. 실제 Electron 전체 E2E 실행 결과가 아님 |
| 공개 UI 제거 | `SpsExtensionsManager` 3개 통과, UI 타입 검사 exit 0. 최초 잘못된 root의 UI 명령은 setup 해석 실패로 검사를 실행하지 못했고 올바른 UI cwd에서 통과 |
| 기존 자격·실행 문맥 | scope guard 및 heartbeat 선택 7개 통과. 퇴역 자격의 권한 확대 방지 |
| Owner Host 패키징 계약 | 선택 10개 통과. 실제 Windows 패키지 생성·설치 증거는 아님 |
| Desktop Node | 해당 파일 38개 통과. 일반 Runner와 Plugin 실행 계약 유지; 실제 원격 컴퓨터 검증은 별도 |
| 서버 TypeScript | 중간에 요청 param의 `string | string[]` 오류 1개 발견·수정. 후속 검사 exit 0, 소스 hash 전후 동일 |
| compatibility boundary | 통과. 전체 build/recursive typecheck 결과가 아님 |
| 최신 권한 sweep | 새 revision 재검사 1개 통과·15개 미선택, 기존 주기/종료 2개 통과·14개 미선택. 이전 cmd regex 인용 오류 명령은 중단했으며 통과 근거에서 제외 |
| Workspace 삭제·존재 확인 | factory 선택 5개 통과·13개 미선택, 미존재 경계 보완 후 해당 1개 재통과·17개 미선택. 실제 프로세스 A/B/Host 분리 검사 1개 통과 |
| Workspace 존재 reader | DB mock 선택 4개 통과. 기존·미존재·조회 실패·잘못된 ID 구분 |
| 삭제 route·원자적 guard | 2개 파일 21개 통과. 기존 인증, pending/취소 실패 503, 동시 resume 409, 제어 행 잠금과 정확한 token 검증. 실제 DB 삭제 수용은 미실행 |
| 삭제 OpenAPI 응답 | 후속 선택 1개 통과·8개 미선택. 기존 공개 route 제거 검사와 겹치는 파일이며 전체를 재실행하지 않음 |

새 route 검사는 이 파일의 기존 HTTP 검사 관례에 맞는 20초 budget을 사용한다.
처음 새 검사에 적용했던 기본 5초에서는 시간 초과했으며 이를 기존 검사 회귀나
제품 동작 deadline 변경과 혼동하지 않는다. 원래 E2E·제품 종료 제한은 늘리지 않았다.

실행하지 않은 것: 전체 로컬 suite·배포 build·실제 DB 재실행·Electron/Native
E2E·물리 두 컴퓨터·실제 설치/업데이트/복원 검증. AppContainer 실험도 재실행하지 않았다.
최종 삭제·존재 확인 코드의 서버 타입 검사도 exit 0이고 소스 hash 전후가 같았다.
뒤따른 OpenAPI 삭제 응답 설명 변경 후 cached 서버 타입 검사도 exit 0으로 통과했다.

## 최신 이전 CI와 미해결 항목

이 increment 이전 Source `bd34fd31ea121c8a661a56a8a9390a5668d5e8fd`의
자동 push `40653530788`은 실패했다. 전체 Linux 타입 검사·빌드와 9개 Linux
test shard는 통과했다. 이전 권한 경계 시간 초과가 있었던 serialized 3/4도 통과했다.
새 increment의 전체 CI 통과 증거로 재사용하지 않는다.

Windows job `122699014538`은 prepared Host의 기능 결과와 Main exit 0,
child 3/3 종료·orderly 3·outputEnded 6·outputFailed 0, ownedJobEmpty를 확인한 뒤
임시 데이터 제거가 20초 내 완료되지 않아 실패했다. 파일 잠금·크기·특정 경로가
원인이라는 증거는 없으며 진단 추가를 결함 수정이나 새 E2E 통과로 표시하지 않는다.

같은 조합의 PR 실행 `40653539310`도 최종 확인했다. Windows Desktop/Node
`122699044676`, Linux 전체 타입·빌드와 9개 test shard, Identity 22/24/26,
Plugin Kit/Registry·bundled plugins·Room은 통과했다. 전체 실행은 보안
gate `122699044357` 때문에 실패했다. push의 임시 정리 실패와 PR의 Windows
통과를 모두 보존하며 안정적인 정리나 이번 새 조합 통과로 확대하지 않는다.

후속 Source `cb7e25f` 자동 push `40671170664`도 최종 확인했다. Core
`2b1a7365`의 전체 Linux 타입·빌드와 9개 Linux shard는 모두 통과했다.
Windows job `122758010606`은 실제 Desktop E2E 전 Node 검사에서 기존 정적
assertion 1개가 새 `fixture.remove(progress => ...)` 형태를 인정하지 못해 실패했다.
기대식을 새 콜백 형태로 맞추고 20초 bound·identity 선검사·재시도 설정·안전한
진단 필드·확인 우회 없음 검사를 유지했다. 해당 파일의 선택 Node 검사 4개가
통과했다. 전체 Windows 재실행이나 임시 정리 문제 해결 증거는 아니다.
보안 gate `122758011536` 실패도 유지한다. Linux shard 수는 실제 job 목록의
serialized 4개·server 3개·workspaces 2개, 총 9개이며 이전의 8개 표기를 바로잡았다.

보안 gate에는 승인 예외가 없는 Zod High `1243066`이 남아 있다. 기존 major 전환
보류·보안 기준은 유지하며 실패를 제거하거나 승인한 것으로 처리하지 않는다.
현재 UI token gate도 color 79·arbitrary value 36·font-size 1개, 총 116개로
실패했다. 이전 로그와 각 위반 행을 비교한 결과 116개 모두 동일하고 신규 위반은
없었다. 기존 실패와 구분하며 새 통과로 표시하지 않는다.

Core 완료 전 남은 필수 작업:

1. 이번 Workspace 삭제·권한 철회 보완의 실제 DB/Windows 통합 검증. mock 검사와
   실제 자식 프로세스 분리 증거를 전체 삭제 트랜잭션 수용으로 확대하지 않는다.
2. 일반 Host Worker를 포함한 공유 npm 파일 변경 중 admission·정지·안전한 재가동
   조정. 이번 Workspace fence만으로 전역 패키지 안전성을 완료했다고 하지 않는다.
3. Core 비정상 종료 시 Plugin이 직접 만든 자손 프로세스의 소유권·종료·복구.
   SDK 직접 자식 EOF 정상 종료는 이 전체 보장의 대체가 아니다.
4. 여러 Runner의 실제 배정·상태·실패·중단·복구와 Tailscale/SSH 운영 경로 검증.
   Runner는 실행 컴퓨터이며 Agent/Target과 구별한다. 기존 Node wire 명칭은 유지한다.
5. Windows 종료·임시 정리 실패, 현재 조합 CI/보안, 데이터 보존 설치·업데이트·
   롤백·복원. 구현된 테스트 도구와 실제 배포 검증은 구분한다.

## 후순위와 호환성

공개 Marketplace는 제품에서 제거한다. 전용 Builder 신규 요구는 별도 핸드오프까지
보류한다. AppContainer 연구는 보존하고 완전한 비신뢰 코드 OS 격리는 1차 완료
조건에서 제외한다. Native 추가 개발은 보류하고 Tailscale/SSH 방향을 유지한다.

어느 결정도 capability·grant·Secret·파일 API 범위·패키지 검증·통신 인증·실제
종료 확인을 약화하지 않는다. SDK/Runner 및 기존 Builder 호환성을 유지한다.
DB migration·고객 데이터 삭제·인증정보 이동·설치 앱 변경·release/npm 배포는
이번 increment에 포함하지 않는다.
