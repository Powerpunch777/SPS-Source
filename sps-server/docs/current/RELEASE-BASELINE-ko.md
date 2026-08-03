# SPS Desktop 배포 기준

최종 갱신: 2026-08-03

기계가 읽는 후보 기준은
[`../../release/support-matrix.json`](../../release/support-matrix.json)이며,
사람이 확인하는 현재 후보 표는 자동 생성 문서인
[`CURRENT-CANDIDATE.md`](CURRENT-CANDIDATE.md)이다.

이 문서는 배포 정책과 현재 후보의 검증 증거를 설명한다. 자동 테스트가 통과했다는
이유만으로 개발 후보를 Stable 릴리스로 승격하지 않는다.

## 현재 후보

| 항목 | 값 |
| --- | --- |
| 상태 | `development-candidate` |
| SPS Desktop | `0.4.114` |
| SPS Source | 최종 패키지의 `sps-release-manifest.json`에서 고정 |
| SPS Core | `3fee634ee5bc57f8dd9ff2a7b511d91439b35b02` |
| Plugin SDK | `4e23934dd0164132b9ba6d637d7687e97ad27f86` (`0.11.0`) |
| Plugin API | `1` |
| Extension Profile | `1.0`, `2.0` |
| 운영체제 | Windows 10/11 x64 |
| 원격 연결 | Tailscale |

정확한 번들 플러그인 버전은 `CURRENT-CANDIDATE.md`를 따른다.

## 배포 채널

| 채널 | 용도 | 자동 업데이트 | 요구 사항 |
| --- | --- | --- | --- |
| Stable | 제한된 실제 사용자 배포 | 사용 | 전체 자동 게이트, 동일 후보 물리 2대 증거, 유효한 Windows 코드 서명 |
| Preview | 설치와 첫 실행 검증 | 사용 안 함 | 개발 후보 표시, 별도 저장소, 실제 작업 데이터 사용 금지 |
| Local candidate | 개발, 패키징, E2E | 사용 안 함 | 로컬 검증 전용이며 공개 배포 증거로 단독 사용 불가 |

Stable은 `Powerpunch777/SPS-Desktop-Releases`에만 게시한다. 설치 파일,
blockmap, `latest.yml`, 릴리스 manifest와 Agent Runtime Pack 목록은 동일한
빌드에서 생성해야 하며 기존 태그의 파일을 덮어쓰지 않는다.

## Stable 승격 게이트

### 1. 자동 검증

`.github/workflows/sps-verify.yml`의 모든 필수 작업이 통과해야 한다.

- Ubuntu에서 Core 전체 `typecheck -> test:run -> build`
- SPS Core 호환 경계, 인증, Node, Marketplace, Hub 경계와 UI production build
- Public Plugin SDK와 모든 번들 플러그인 검사
- SPS Identity의 로그인, 토큰 회전, 폐기, 재사용과 동시성 검사
- Windows Desktop, Desktop Node와 네 가지 실제 Electron E2E
- 의존성 보안 감사와 후보 tuple 일치 검사

릴리스 workflow는 재사용 검증 workflow가 성공하기 전에는 서명과 게시를
시작하지 않는다. GitHub Actions가 결제 또는 spending limit 문제로 시작되지 않은
경우는 통과로 간주하지 않는다.

### 2. 동일 후보 물리 2대 증거

Host와 Member 역할을 서로 다른 실제 Windows 컴퓨터에서 검증해야 한다.

- 초대와 참여
- Member 컴퓨터의 허용된 Agent Runtime 실행
- Host Source 접근과 수정
- 네트워크 단절 후 복구
- Node, Runtime, 사용자 권한 철회
- 빈 Host로 Workspace export 복원

증거의 Desktop, Source, Core, SDK revision은 게시할 후보와 정확히 같아야 한다.
과거 후보에서 얻은 물리 테스트 결과는 재사용하지 않는다.

### 3. 서명과 불변 게시

- Windows Authenticode 상태가 `Valid`인 설치 파일만 Stable로 게시한다.
- 설치 파일 SHA-256과 릴리스 manifest를 함께 게시한다.
- 설치 파일, blockmap, `latest.yml`, manifest, Runtime Pack 목록은 같은 버전이어야 한다.
- 이미 존재하는 Stable 태그는 수정하지 않고 새 버전을 만든다.

## 0.4.113 이전 로컬 증거 스냅샷

아래 결과는 Source `86e5d8da27b3eb9f4c3e67d60798b0018c620546`, 위 표의 Core와
SDK revision으로 만든 깨끗한 작업 트리에서 확인한 과거 스냅샷이다. 이후 Identity 배포
호환성과 응답 유실 보완으로 PR HEAD가 이동했으므로 이 스냅샷을 최종 후보의
CI·물리 증거와 결합할 수 없다.

| 검사 | 결과 |
| --- | --- |
| Desktop 단위/계약 테스트 | `320/320` 통과 |
| Desktop Node | `39/39` 통과 |
| SPS Identity | `15/15` 통과 |
| Public Plugin SDK | `146/146` 통과 |
| Room Workplane 전체 검사 | 통과 |
| Default Memory 및 Plugin Discovery | 통과 |
| Core 전체 workspace build | Windows에서 통과 |
| 의존성 보안 감사 | advisory 5건: high 정확 예외 1건, moderate 검토 3건, low 1건 |
| Electron 첫 실행/로그인 bootstrap | 통과 |
| Electron Workspace surfaces | 통과 |
| Electron 격리 Plugin Preview | 통과 |
| Electron Host plugin lifecycle | 통과 |

패키징은 번들 플러그인을 소스에서 다시 빌드하고, Owner Host runtime과 Marketplace
MCP smoke를 검증했다. 생성된 로컬 설치 후보는 다음과 같다.

- 파일: `SPS-Desktop-Setup-0.4.113.exe`
- 크기: `274,172,902` bytes
- SHA-256: `c538e75b44011da5a1edac36995646a2617bc7a2d7c7295a2035ecc0dff070da`
- manifest: `sourceDirty: false`, `coreDirty: false`, `sdkDirty: false`
- Authenticode: `NotSigned`

Core 전체 `pnpm test:run`을 Windows에서 실행하면 상속된 Unix CLI/Docker 테스트
픽스처 12개 파일의 63개 테스트가 실패한다. 주요 원인은 확장자 없는 shell fixture를
Windows에서 직접 실행하는 가정이며 SPS Desktop 제품 경로의 회귀로 분류하지 않는다.
Core 전체 회귀의 정식 기준 환경은 Ubuntu CI이고, 정확 후보의 해당 job 성공 전에는
Stable 자동 게이트를 통과한 것으로 기록하지 않는다.

## 현재 Stable 차단 조건

1. 최종 Source HEAD를 고정한 새 manifest와 설치본 증거가 필요하다.
2. 동일한 최종 Source HEAD의 GitHub Actions 전체 성공 증거가 없다.
3. 동일 후보로 수행한 Host/Member 물리 2대 증거가 없다.
4. 설치 파일이 Windows 코드 서명되지 않았다.
5. Identity additive migration `0003_refresh_reuse_protection.sql`과 새 Worker를 배포하고,
   staging에서 token/refresh/retry/reuse/revoke를 확인한 뒤 legacy session 정리를
   명시적으로 완료해야 한다.
6. 최종 Source/Core/SDK/Plugin tuple을 불변 태그와 게시 manifest에 그대로 보존해야 한다.

따라서 `0.4.114`는 `development-candidate`이다. `0.4.113`의 로컬 E2E 증거는
보안 변경 후 후보에 재사용할 수 없으며 일반 사용자용 Stable로 게시해서는 안 된다.

## 설치와 데이터

- 일반 제거는 SPS Desktop 실행 파일만 제거하고 Owner Vault를 자동 삭제하지 않는다.
- 재설치 전 Host는 Vault export를 만들어야 한다.
- 완전 삭제는 제품의 별도 삭제 정책과 감사 기록 규칙을 따른다.
- Workspace import는 빈 Host에만 허용한다.

Preview 운영 규칙은
[`RELEASE-AND-PREVIEW-POLICY-ko.md`](RELEASE-AND-PREVIEW-POLICY-ko.md)를 따른다.
