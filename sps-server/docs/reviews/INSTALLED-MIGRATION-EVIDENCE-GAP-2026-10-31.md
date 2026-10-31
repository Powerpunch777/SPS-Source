# Installed Migration Evidence Gap (2026-10-31)

## 범위

현재 완료 기준은 `docs/current/CORE-COMPLETION-POLICY-ko.md`의 데이터·배포 항목에 따라 기존 데이터와 인증정보 보존을 요구한다. 이 메모는 제공된 기준 및 아래 여섯 검증 파일의 증거 범위만 정리한다. 검토 대상 식별자는 Source `01695d25`, Core `b17fb830`, SDK `61a929f6`, Desktop `0.4.137`이다.

## 기존 증거가 뒷받침하는 것

- `desktop/scripts/smoke-installer-data-preservation.mjs:100-115, 138-153, 255-268`은 설치·교체·제거 후 재설치 흐름에서 데이터 canary 해시와 설치 패키지 바이트를 확인한다. 다만 canary는 128바이트 불투명 데이터이며, 스크립트 자체가 `applicationDataMigrationQualified: false`, `normalUserProfileStartupQualified: false`, `previousStableUpgradeQualified: false`, `signedInstallerQualified: false`를 명시한다.
- 설치된 후보 바이너리의 첫 화면 확인은 `smoke-installer-data-preservation.mjs:173-184`에서 `smoke-isolated-desktop-ui.mjs`를 호출해 수행한다. UI 스모크는 `smoke-isolated-desktop-ui.mjs:159-196`에서 새 임시 `userData` 디렉터리를 지정하고 제거한다. 따라서 이는 설치된 후보의 로그인 화면 렌더링 증거이지, 실제 기본 사용자 프로필의 기존 데이터 마이그레이션 또는 시작 증거가 아니다.
- `desktop/scripts/smoke-historical-core-migration.mjs:108-165`는 157개 마이그레이션의 과거 스키마를 임시 데이터베이스에 만들고, 현재 마이그레이션을 적용한 뒤 기존 행 스냅샷과 백업 복원 결과를 비교한다. 이는 SQL 마이그레이션 및 백업 복원 경로의 증거다. 같은 파일 `:181-186`은 `installedDatabaseMigrationQualified: false`, `signedInstallerQualified: false`, `physicalTwoDeviceQualified: false`를 명시한다.
- `desktop/scripts/historical-owner-transfer-fixture.mjs:94-107, 109-160`은 별도 임시 DB에 157개 마이그레이션과 fixture 행을 만들고 백업·전송 번들을 준비한다. 설치된 기존 DB의 인플레이스 업그레이드는 아니다.
- `desktop/scripts/smoke-owner-vault-transfer-desktop.mjs:35-43, 73-89, 418-460`은 source-only Electron을 사용하고 별도의 source/target 프로필 사이에서 복원한다. `:170-220, 475-501`의 DPAPI 기반 복호화, V11 상태 projection 및 재시작 확인은 그 fixture 프로필의 상태·credential과 행·파일이 복원/마이그레이션되는 경로를 뒷받침한다. 그러나 실제 설치 바이너리의 기존 사용자 프로필 인플레이스 마이그레이션을 증명하지 않는다. 결과도 `:585-597`에서 설치 DB, 서명 설치본, previous stable, physical two-device 및 전체 자손 종료 자격을 각각 `false`로 표시한다.
- `desktop/scripts/smoke-workspace-surfaces-desktop.mjs:24-30, 498-515`는 패키징 바이너리와 source Electron 선택 및 E2E `userData` 지정이 가능함을 보여준다. 설치 후보 선택 지원 자체는 존재하지만, 이 경로만으로 실제 기본 프로필 데이터 마이그레이션이나 기본 프로필 시작이 입증되지는 않는다.

## 미검증 공백과 최소 확인

미검증인 것은 같은 기존 소유 프로필 안의 유효한 과거 DB와 Desktop 상태를, 실제 설치된 새 후보 Main이 인플레이스로 열어 마이그레이션하고 기존 행·파일·credential을 복호화해 보존하는지, 그리고 재시작 후에도 보존되는지다. 이 시나리오의 실제 바이너리 SHA-256과 Source/Core/SDK/Desktop 식별 tuple을 증거에 묶고, 앱의 자연 종료 및 임시 fixture 소유권 정리까지 확인해야 한다. 임시 프로필 첫 화면, signed/previous-stable 설치, physical 기기 검증으로 이 공백을 대신하거나 확대 해석하지 않는다.

이는 회귀나 데이터 손실의 버그 입증이 아니라, 현재 보유 증거로 해당 필수 동작을 아직 입증하지 못했다는 증거 공백이다. 이 문서는 필수 범위를 축소하거나 완료를 선언하지 않는다.

## 추가된 시험과 현재 상태

`desktop/scripts/smoke-historical-managed-vault-desktop.mjs`에 같은 소유 시험
프로필의 인플레이스 경로를 추가했다. Core/SDK와 제품 Main은 이 작업으로
변경하지 않는다. 공통 SQL fixture는 기존 과거 백업 시험과 같은 두 Workspace,
두 프로젝트, Unicode 설명·JSON·타임스탬프 및 두 membership을 사용한다.

1. 실제 Main에서 격리 Identity의 정상 state/PKCE 로그인을 완료하고 DPAPI
   credential을 저장한 후 앱을 정상 종료한다. 운영 Google 로그인 증거는 아니다.
2. 같은 `migration-profile` 안에 정확한 157개 과거 스키마의 새 클러스터를
   준비하고 실제 PID·datadir 소유권을 검증해 정상 종료한다. 기존 Vault는
   덮어쓰지 않으며 현재 migration, import/restore, 외부 DB는 사용하지 않는다.
3. credential 및 기기 signing key를 보존한 v11 상태를 기록한다. 현 Main의
   기본 Owner 연결 형상을 사용하며, 새로운 Node ID나 승인을 만들어 넣지 않는다.
4. 실제 Main이 같은 DB를 176개 migration으로, 상태를 v13으로 올리는지 확인한다.
   자동으로 열린 Workspace에서 두 프로젝트를 읽고, 원래 행·JSON·설명·시간·파일
   해시와 DPAPI 복호화 값 및 signing key 해시가 일치해야 한다.
5. 정상 종료·재시작 후 같은 확인을 반복한다. 회사 선택/Node 연결의 정상 초기화와
   인증정보의 보존을 구분하며, 기존 별도 v11 시험의 전체 routing 비교는 유지한다.

소스 모드의 전체 시나리오는 실제 Windows/Electron에서 통과했다. 명령은
`SPS_DESKTOP_E2E_SOURCE=1 node scripts/smoke-historical-managed-vault-desktop.mjs`
이며 출력은 `sourceHistoricalFixtureInPlaceMigrationQualified:true`,
`installedHistoricalFixtureInPlaceMigrationQualified:false`이다. 자연 Main 종료,
출력 EOF, 소유 프로세스 부재와 임시 데이터 정리까지 확인했다.

설치 모드는 GitHub-hosted 전용 기존 installer gate에서만 허용한다. 현재 후보
교체 후 설치된 실행 파일·ASAR·runtime archive 해시와 로딩한 runtime의 정확한
baseline tuple을 대조하고, 이 시나리오가 실패하면 gate도 실패하도록 연결했다.
전체 Job 자연 종료는 기존 제한 토큰 launcher가 최종 확인한다. 기존 `e33ac03`
실행에는 이 새 시험이 없으므로 그 결과로 이를 통과 처리할 수 없다. 아래의
`5a2692a` PR 설치 결과가 처음으로 이 추가된 설치 시나리오를 실제 실행했다.

이 시험도 사용자 기본 AppData 프로필, 이전 Stable 실행, 서명 설치본 또는
실제 두 PC의 증거는 아니다. 각 qualification은 계속 별도로 `false`를 유지한다.
초기 개발 중 실패한 시험 폴더는 불확실한 상태에서 일괄 삭제하지 않았으며,
완료·정상 종료가 확인된 이번 성공 fixture만 정리했다.

최종 소스 명령 `SPS_DESKTOP_E2E_SOURCE=1 npm run test:e2e:historical-profile-in-place`
재실행도 통과했다. 기존 실제 Main의 `test:e2e:owner-vault-state-migration`도
공통 helper의 전체 routing/DPAPI 비교·v11 변환·두 번의 재시작까지 다시 통과했다.
독립적인 코드 검토에서 발견한 잘못된 source-mode cleanup 위임 입력은
진입점에서 거부한다. 위임된 정리 완료 주장은 hosted 설치 부모만 사용할 수 있다.

## Hosted native fixture follow-up

Source `4d8f324` push `41194200983`/Windows `124516958510`와 PR
`41194205284`/Windows `124516972146`는 새 native 준비 시험의
`postgres-start` 단계에서 실패했다. 나머지17개 non-Windows job은 완료됐지만,
Windows 통과나 새 설치본 생성으로 계산하지 않는다. 원래 원문은 수집하지
않았으므로 관리자 실행 거부가 실제 원인이었다고 단정하지 않는다.

기존 직접 Node 호출 대신, 같은 준비 시나리오를 기존 Windows 제한 토큰/소유
Job launcher의 고정 `probe-historical-managed-vault` 진입점으로 실행한다.
제품과 같은 사용자이되 Administrator/PowerUser 권한을 제거했음을 실제 검사한다.
새 native75초·호출90초·시험100초 상한을 두며 기존8/18분·45초·15초 상한은
변경하지 않는다. 157개 스키마·PID/datadir·정상 Postgres 종료·DB 보존 확인은
생략하지 않고, pending76 이후 **전체 Job의 자연 종료까지** 추가로 요구한다.
실패·강제 종료를 통과로 바꾸지 않는다. 로컬의 실제 제한 토큰 실행은 통과했으며
`5a2692a`의 두 hosted unit 단계도 이 제한 토큰 준비 시험을 통과했다.

시작 단계는 pidfile/identity/datadir/DB 생성으로 구분해 고정 진단을 남긴다.
시작 로그의 비공개 tail은4096바이트로 제한하고, 공식 Windows 관리자 거부
문구 전체가 관측된 경우에만 `administrator_unsupported`, 그 외에는
`unclassified`를 반환한다. 원문·계정·PID·포트·절대경로는 결과에 내보내지 않는다.
참고: [PostgreSQL 공식 Windows 권한 검사](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/main/main.c).

## Actual Installed Candidate Result

Source `5a2692a` PR run `41195626905`, Windows job `124521096935`는
새 필수 설치 시험까지 통과했다. 실제 설치된 Source는 PR merge
`9070e0ab09606e91d326f0df09b366ae3d89f7cf`, 설치본 SHA256은
`7db481cbcb96b849d134da96b46cf75139b8354c8820efaf506f47509a67c94d`다.
설치된 EXE/ASAR/runtime archive와 로딩한 baseline의 Source/Core/SDK를
대조했고,157-to176/v11-to13/같은 DPAPI credential 및 키/프로젝트·파일/
재시작을 import·restore 없이 확인했다. 부모의 전체 Job 자연 종료도 통과했다.
이 결과는 격리된 과거 fixture 프로필의 실제 설치 Main 인플레이스 공백을
메우지만, 위에서 별도로 열거한 기본 사용자·서명·과거 Stable·두 PC·운영
Google 로그인 증거까지 확대되지 않는다.

반면 같은 HEAD push `41195623911`/Windows `124521088235`는 동일 시험의
300초 자식 상한에 걸렸고, 잔여 소유 프로세스의 강제 정리는 통과로 인정하지
않았다. 새 진단은 고정 phase와 경과시간만 내보내고 부모가 실패해도 보존한다.
원문 앱 출력·경로·계정정보를 내보내거나 제한시간을 늘리지 않는다. 이 push
실패의 구체적인 지연 단계는 아직 미확정이며, 새로운 정확한 HEAD의 재검증이
필요하다. 별도 legacy recovery 실패도 계속 필수 미완료로 남아 있다.
