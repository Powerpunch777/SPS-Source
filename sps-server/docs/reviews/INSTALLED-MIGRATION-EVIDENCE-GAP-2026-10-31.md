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
