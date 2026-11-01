# Source CI Verification: Installer Preservation and Recovery

확인일: 2026-11-02 (Asia/Seoul)

## 범위와 판정

이 문서는 GitHub Actions의 이미 실행된 Source CI 결과를 기록한다. 원격 run과 artifact API, raw job log, Source commit의 `sps-server/release/support-matrix.json` 및 submodule gitlink를 읽어 확인했다. run을 재실행하거나 환경을 변경하지 않았다.

`Powerpunch777/SPS-Source`의 Source `8a5227b0ee2d10592695e81f522b8cb76ad5e914`에 대해 push run `41331913743`과 추가 PR run `41331919075`는 각각 `completed / success`이며, 두 run 모두 19/19 jobs가 `completed / success`다. 두 run은 같은 Source SHA를 검사한다.

후속 Source `457428b3df3e396958485696724688052dc6e72d`의 push run `41332392279`와 PR run `41332398577`도 각각 `completed / success`, 19/19 jobs `completed / success`다. 이 결과는 8a run과 별도이며, 아래에서 push와 PR을 각각 표시한다.

## 8a 검사 항목

`41331913743`의 19개 job은 다음과 같다. 전부 `completed / success`다.

- `SPS Desktop and Node`
- `SPS Core full Linux typecheck and build`
- `SPS Room workplane`
- `SPS Core Linux tests (server 1/3)`, `(server 2/3)`, `(server 3/3)`
- `SPS Core Linux tests (serialized 1/4)`, `(serialized 2/4)`, `(serialized 3/4)`, `(serialized 4/4)`
- `SPS Core Linux tests (workspaces A)`, `(workspaces B)`
- `SPS bundled plugins`
- `SPS Plugin Kit and Registry`
- `SPS Identity contracts (Node 22)`, `(Node 24)`, `(Node 26)`
- `SPS Core compatibility`
- `SPS Legacy Installer Recovery`

따라서 Linux test shards는 총 9개이며 모두 성공했다. 별도의 `SPS Core full Linux typecheck and build` job도 성공했다. 이는 이 run의 job 결과이며 현재 checkout의 검사 결과를 뜻하지 않는다.

## Windows 설치 및 retained-data 증거

`SPS Desktop and Node`의 `Verify installed Windows package and retained user data` 단계 로그에는 다음 assertion이 기록되어 있다.

- `installerDataPreservation: true`
- 단계: `fresh-install`, `current-package-replacement`, `in-place-reinstall`, `uninstall-preserve-data`, `reinstall-retained-data`
- `retainedRecords: 9`, `packageByteParity: 5`, `silentInstaller: true`
- 설치 경계에서 Desktop 프로세스가 없었음: `desktopProcessAbsentAtInstallerBoundaries: true`
- `validationKind: current`
- 설치 파일 SHA-256: `e6abee2f15ec44bb08268388c52b0d7a96e986ad6b7092c430940ee2cde910f7`

해당 로그에 포함된 candidate tuple은 Desktop `0.4.137` (`development-candidate`), Source `8a5227b0ee2d10592695e81f522b8cb76ad5e914`, Core `d0b99baef5d8422ab0473ea4b1909e55ab6518b8`, Plugin SDK `61a929f6c783f78e5af603682de1543c7e24abc0`이다. Source commit `8a5227b`의 support matrix에는 Core와 SDK의 repository/revision이 같은 값으로 기록되고, 그 commit의 submodule gitlink도 동일한 두 SHA를 가리킨다. 각 Core/SDK 저장소에서 해당 commit 객체와 제목도 확인했다. SDK 버전은 `0.11.0`이다.

## Legacy Installer Recovery

`SPS Legacy Installer Recovery` job은 아래 네 단계를 모두 `completed / success`로 끝냈다.

1. `Prepare standard historical uninstall recovery`
2. `Verify installer operator upgrade recovery`
3. `Verify ordinary uninstall and explicitly confirmed program residue recovery`
4. `Verify installer operator reinstall recovery`

raw log에는 표준 uninstall 복구에서 user record 9개와 project record 1개 보존, 취소·기본 No·residue 거절·기존 residue 정리 확인이 기록되어 있다. 이 단계의 `historicalStandardUninstallDataPreservationQualified`는 `true`다. Operator candidate reinstall에서도 user record 9개, project record 1개와 `packageByteParity: 5`가 기록되고 `operatorReinstallRecoveryQualified: true`다.

같은 reinstall 결과는 `historicalInstallerUpgradeQualified`, `previousStableUpgradeQualified`, `applicationDataMigrationQualified`, `normalUserProfileStartupQualified`, `signedInstallerQualified`, `physicalTwoDeviceQualified`가 모두 `false`라고 명시한다. 로그의 `cleanupQualification`은 `pending`이다. 따라서 job 통과를 과거 Stable 설치본 업그레이드, 일반 사용자 프로필 실행, 서명 설치본 수용, 두 대의 물리 PC 검증 또는 cleanup 전체 수용으로 확대 해석하지 않는다.

## 추가 push와 PR 결과

| Source SHA | Event | Run | 상태 | Jobs |
| --- | --- | --- | --- | --- |
| `8a5227b0ee2d10592695e81f522b8cb76ad5e914` | push | [41331913743](https://github.com/Powerpunch777/SPS-Source/actions/runs/41331913743) | `completed / success` | 19/19 `completed / success` |
| `8a5227b0ee2d10592695e81f522b8cb76ad5e914` | pull_request | [41331919075](https://github.com/Powerpunch777/SPS-Source/actions/runs/41331919075) | `completed / success` | 19/19 `completed / success` |
| `457428b3df3e396958485696724688052dc6e72d` | push | [41332392279](https://github.com/Powerpunch777/SPS-Source/actions/runs/41332392279) | `completed / success` | 19/19 `completed / success` |
| `457428b3df3e396958485696724688052dc6e72d` | pull_request | [41332398577](https://github.com/Powerpunch777/SPS-Source/actions/runs/41332398577) | `completed / success` | 19/19 `completed / success` |

Run API에서 확인한 관련 installer input artifact는 다음과 같다. ID와 이름은 그대로 옮겼다.

- Run `41331913743`: `sps-installer-input-41331913743-1` (artifact ID `13094373099`)
- Run `41331919075`: `sps-installer-input-41331919075-1` (artifact ID `13095065453`)
- Run `41332392279`: `sps-installer-input-41332392279-1` (artifact ID `13094776564`)
- Run `41332398577`: `sps-installer-input-41332398577-1` (artifact ID `13094886087`)

API 조회 시 네 artifact는 모두 `expired: false`였다. artifact는 각기 자기 workflow run과 head SHA에 연결된 입력물이며 서로 대체 가능한 결과물이 아니다.

## 현재 checkout과의 경계

조회 당시 Source checkout은 문서 변경 commit `107005b290ac7a28f30538c672098afb2813480f`였고, Core/SDK에는 미커밋 Agent Session 관련 변경이 있었다. 이후 커밋되거나 후보 핀이 갱신되어도 8a 또는 457 run의 성공을 그 새 작업물에 승계하지 않는다. 이 문서는 CI 근거 기록만 추가하며 관리 코드 변경, Core 완료 판정, 실제 AI 실행, Stable/Production 승인 문서가 아니다.

CI 결과만으로 self-hosted 실기기 수용, 서명된 설치본, Production 배포 또는 물리 장치 검증이 성립하지 않는다. 성공한 job/assertion과 명시적인 `false`·`pending` qualification은 위 범위 그대로 구분한다.
