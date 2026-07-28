# SPS Release Baseline

## 공개 Plugin SDK 고정

SPS Desktop은 `external/sps-plugin-sdk` Git submodule에 고정된 공개 SDK를 직접 포함한다.
각 release baseline은 Core와 마찬가지로 SDK의 repository, revision, package, version, 작업 트리 상태를 함께 기록한다.
Desktop 내부의 과거 `plugin-platform` 복제본은 release 입력이 아니며, 새 제품 코드는 공개 SDK만 사용한다.

최종 갱신: 2026-07-28

이 문서는 SPS Desktop 배포 상태를 사람이 읽을 수 있게 설명한다. 빌드가 검사하는 기계 판독 원본은
[`sps-server/release/support-matrix.json`](../../release/support-matrix.json)이다.

## 현재 상태

| Desktop | 상태 | Core | Extension Profile | Plugin API | 배포 경로 |
| --- | --- | --- | --- | --- | --- |
| 0.4.49 | 기존 공개 파일 | 기록 미완성 | 기록 미완성 | 기록 미완성 | `SPS-Desktop-Releases` |
| 0.4.79 | 개발 후보, 미배포 | `c8846a0e93962f7f1179f859b299da7648b48a50` | 1.0 | 1 | 비공개 Actions artifact만 허용 |

`0.4.49`는 새 기준선 계약을 도입하기 전에 만들어졌으므로 Phase 0의 정식 지원 기준선으로 간주하지 않는다.
`0.4.79`도 아직 정식 release가 아니다. 소스와 Core 작업 트리가 깨끗하고 아래 게이트를 모두 통과한 새 버전만
첫 기준선 stable로 승격한다.

## 첫 지원 조합

- Windows 10/11 x64
- Host와 Member가 같은 SPS Desktop installer 사용
- 원격 팀 연결은 Tailscale 사용
- 정식 자동 업데이트는 `latest` channel만 사용
- installer와 update metadata는 `Powerpunch777/SPS-Desktop-Releases`에서만 제공
- SPS Extension Profile 1.0, Plugin API 1
- 번들 extension:
  - SPS Default Memory 0.1.0
  - Plugin Discovery & Builder 0.1.0
  - SPS Team Workplane 0.3.91

## 빌드가 기록하는 정보

모든 후보 패키지는 `sps-release-manifest.json`에 다음을 기록한다.

- Desktop 버전, SPS source revision과 미커밋 변경 여부
- 정확한 SPS Core repository와 revision
- Core 작업 트리의 미커밋 변경 여부
- Extension Profile과 Plugin API 버전
- 지원 OS와 원격 transport
- 번들 extension의 ID와 버전
- installer, blockmap, `latest.yml`의 SHA-256

로컬 개발 빌드는 SPS source 또는 Core의 미커밋 변경을 `dirty: true`로 기록할 수 있다. 정식 release
workflow는 둘 중 하나라도 `dirty`면 거부한다.

## 정식 배포 게이트

1. support matrix가 Desktop package, Core gitlink, 실제 Core checkout, 번들 extension 버전과 일치한다.
2. Desktop, Desktop Node, Plugin Platform 테스트가 통과한다.
3. Windows installer의 코드 서명이 `Valid`다.
4. `latest.yml`이 같은 버전의 정확한 installer를 가리킨다.
5. release manifest의 파일 hash가 실제 산출물과 일치한다.
6. 같은 버전의 release가 이미 있으면 덮어쓰지 않고 버전을 올린다.
7. 검증된 네 파일만 공식 저장소에 올린다: installer, blockmap, `latest.yml`, release manifest.

내부 candidate workflow는 GitHub Actions artifact만 만들며 공식 update 저장소에는 게시하지 않는다.

## 롤백 상태

Owner Vault는 앱 제거 시 자동 삭제하지 않지만, 이전 Desktop이 더 새로운 데이터베이스 schema를 안전하게
읽는다는 보장은 아직 없다. 따라서 현재는 버전 간 자동 롤백을 정식 지원하지 않는다.

첫 stable을 공개하기 전에 다음 중 하나를 구현하고 실제 설치본으로 검증해야 한다.

- 새 버전 설치 전 암호화 backup을 만들고 이전 버전과 호환되는 restore를 제공
- migration별 역방향 복구 절차와 호환 범위를 제공
- 문제가 있는 새 release보다 높은 patch 버전으로 forward fix를 배포

이 게이트가 끝나기 전에는 외부 사용자에게 “안전한 자동 롤백”을 약속하지 않는다.
