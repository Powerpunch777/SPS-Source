# SPS Desktop 배포 기준

최종 갱신: 2026-08-03

기계가 읽는 후보 기준은
[`../../release/support-matrix.json`](../../release/support-matrix.json)이며,
사람이 확인하는 현재 후보 표는 자동 생성 문서인
[`CURRENT-CANDIDATE.md`](CURRENT-CANDIDATE.md)다.

이 문서는 배포 정책을 설명한다. 문서에 테스트 결과를 적었다는 이유만으로
개발 후보가 stable 릴리스가 되지는 않는다.

## 현재 후보

| 항목 | 값 |
| --- | --- |
| 상태 | `development-candidate` |
| SPS Desktop | `0.4.112` |
| SPS Core | `08ed7d71f53e120b7617a1e9e9176f02b9756c9b` |
| Plugin SDK | `@sonparkserver/plugin-sdk@0.11.0` |
| Plugin API | `1` |
| Extension Profile | `1.0`, `2.0` |
| 운영체제 | Windows 10/11 x64 |
| 원격 연결 | Tailscale |

정확한 SDK revision과 번들 플러그인 버전은 `CURRENT-CANDIDATE.md`를 따른다.

## 배포 채널

| 채널 | 용도 | 자동 업데이트 | 요구사항 |
| --- | --- | --- | --- |
| Stable | 제한된 실제 사용자 배포 | 사용 | 전체 자동 게이트, 같은 후보의 물리 2대 증거, 유효한 Windows 코드 서명 |
| Preview | 설치와 첫 실행 검증 | 사용 안 함 | 개발 후보 표시, 별도 Preview 저장소, 실제 작업 데이터 사용 금지 |
| Local candidate | 개발·패키징·E2E | 사용 안 함 | 로컬 검증 전용, 공개 배포 증거로 승격하지 않음 |

Stable은 `Powerpunch777/SPS-Desktop-Releases`에만 게시한다. 설치 파일,
blockmap, `latest.yml`, 릴리스 manifest와 Agent Runtime Pack 목록은 동일한
빌드에서 생성되어야 하며 기존 태그의 파일을 덮어쓰지 않는다.

## Stable 승격 게이트

### 1. 자동 검증

재사용 워크플로 `.github/workflows/sps-verify.yml`이 모두 통과해야 한다.

- SPS Core 타입 검사, 인증·Node·Marketplace 경계, Paperclip 호환 계층 검사,
  UI production build와 초기 번들 예산 검사
- Public Plugin SDK와 모든 번들 플러그인 검사
- SPS Desktop과 Desktop Node 테스트
- 실제 Electron을 실행하는 네 Windows E2E
  - 첫 실행 및 로그인 화면
  - 패키지된 Workspace surface
  - 격리 Plugin Preview
  - Host 플러그인 설치·활성화·비활성화·제거 생명주기

릴리스 workflow는 이 재사용 검증 job이 끝나기 전에는 서명·게시 job을
시작할 수 없다.

### 2. 같은 후보의 물리 2대 증거

자동 테스트와 별도로 Host와 Member 두 실제 Windows 컴퓨터에서 아래를
확인해야 한다.

- 초대와 참여
- 원격 Agent Runtime 실행
- Host Source 편집
- 네트워크 단절 후 복구
- Node와 Runtime 권한 철회
- 빈 Host로의 복원

증거의 Desktop, Core, SDK, Source revision은 게시할 후보와 정확히 같아야
한다. 과거 후보의 물리 테스트는 새 후보에 재사용할 수 없다.

### 3. 서명과 불변 게시

- 코드 서명 인증서로 설치 파일을 서명한다.
- Windows Authenticode 상태가 `Valid`인지 다시 확인한다.
- 설치 파일의 SHA-256과 릴리스 manifest를 게시한다.
- 설치 파일, blockmap, `latest.yml`, manifest, Runtime Pack 목록을 같은
  버전으로 게시한다.
- 이미 존재하는 stable 태그는 수정하지 않고 새 버전을 만든다.

## 현재 0.4.112의 증거 상태

2026-08-03 로컬 검증에서 Desktop `306/306`, Desktop Node `39/39`,
Public Plugin SDK `146/146`, Team Workplane 전체 검사와 Core SPS 경계·타입·
production UI build가 통과했다. Core UI 초기 진입 번들은 `1,316,112` bytes로
`1,500,000` bytes 예산 안에 있다.

Core upstream 전체 테스트는 Windows 명령줄 배치 실행까지 가능해졌지만,
Unix `sh`와 실행 권한을 가정하는 기존 Paperclip 테스트 20개가 Windows에서
실패한다. 이 항목은 SPS 후보 통과로 간주하지 않으며 upstream 호환성 부채로
기록한다. SPS가 소유한 Core 경계 검사는 별도로 모두 통과했다.

아직 같은 최종 Source revision을 사용한 Host/Member 물리 2대 증거와
Windows 코드 서명 결과가 없으므로 `0.4.112`는 계속
`development-candidate`다. GitHub Actions 실행도 계정 결제 또는 spending
limit 문제로 runner가 시작되지 않으면 통과로 간주하지 않는다.

## 설치와 데이터

- 일반 제거는 SPS Desktop 실행 파일만 제거하고 Owner Vault를 자동 삭제하지
  않는다.
- 재설치 전 Host는 Vault export를 만들어야 한다.
- 로그인 세션, CLI 로그인, Tailscale 상태는 Vault 복원과 별도로 다시 확인할
  수 있다.
- 완전 삭제와 Member 제거는 제품의 별도 삭제 정책과 감사 기록 규칙을 따른다.

Preview 운영 규칙은
[`RELEASE-AND-PREVIEW-POLICY-ko.md`](RELEASE-AND-PREVIEW-POLICY-ko.md)를
따른다.
