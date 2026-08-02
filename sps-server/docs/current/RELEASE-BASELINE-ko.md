# SPS Desktop 배포 기준

최종 갱신: 2026-08-02

현재 개발 후보의 기계 판독 기준은
[`../../release/support-matrix.json`](../../release/support-matrix.json)이며,
사람이 읽는 정확한 후보 목록은 여기에서 자동 생성되는
[`CURRENT-CANDIDATE.md`](CURRENT-CANDIDATE.md)이다.
이 문서는 사람이 이해하기 위한 배포 정책 요약이다.
이 문서 자체는 현재 후보의 두 컴퓨터 물리 인수 완료를 주장하지 않는다.

## 현재 채널

| 채널 | 버전 기준 | 용도 | 자동 업데이트 | 서명 |
| --- | --- | --- | --- | --- |
| Official release | 릴리스 저장소의 최신 서명 버전 | 제한된 실제 베타 사용 | 지원 | 서명된 릴리스만 허용 |
| Preview | 별도 Preview 태그 | 설치와 첫 실행 확인 | 미지원 | 개발 후보, 미서명 가능 |
| Local candidate | `CURRENT-CANDIDATE.md` | 개발·패키지·회귀 검증 | 해당 없음 | 개발 환경 기준 |

Official release는 `Powerpunch777/SPS-Desktop-Releases`에만 게시한다.
이 저장소의 `latest.yml`, 설치 파일, blockmap은 반드시 같은 서명 빌드에서 함께
생성되어야 한다.

Preview는 `Powerpunch777/SPS-Desktop-Preview`에 별도로 게시한다. Preview에는
자동 업데이트 메타데이터를 넣지 않으며, 실제 작업 또는 유일한 프로젝트 데이터로
사용하지 않는다.

## 현재 기술 기준

| 항목 | 기준 |
| --- | --- |
| SPS Core | `release/support-matrix.json`에 고정된 revision |
| Plugin API | `1` |
| Extension Profile | 기본 `2.0`, 기존 패키지용 `1.0` 호환 경로 유지 |
| 운영체제 | Windows 10/11 x64 |
| 원격 연결 | Tailscale |

## 설치와 삭제

- 설치 전에는 설치 파일의 게시 위치와 SHA-256을 확인한다.
- 일반적인 앱 제거는 Desktop 실행 파일을 지우지만 Owner Vault를 자동 삭제하지
  않는다. 그래도 설치 전에는 Host가 Vault 백업을 만들어야 한다.
- 앱을 다시 설치하면 남아 있는 Vault를 사용해 기존 Host 정보를 다시 읽을 수
  있다. 로그인 세션, CLI 로그인, Tailscale 연결 상태는 별도 확인이 필요하다.
- 완전한 데이터 삭제와 Member 제거는 별도 제품 기능과 기록 보존 정책에 따라
  수행한다. 앱 제거만으로 프로젝트 폴더나 Host 외부 Source는 지워지지 않는다.

## 정식 배포 전 필수 게이트

1. 두 대의 실제 Windows 컴퓨터에서 Host/Member 가입, Node 승인, Source 접근,
   재시작과 철회를 확인한다.
2. 업데이트 전후의 플러그인 호환성과 롤백을 확인한다.
3. 코드 서명 인증서로 설치 파일을 서명하고 Authenticode 검증을 통과한다.
4. 설치 파일, blockmap, `latest.yml`, 런타임 팩, 릴리스 노트를 같은 버전으로
   게시한다.
5. 실제 사람이 Desktop의 로그인, 로딩, 오류, 취소, 복구 화면을 점검한다.

과거 후보에서 수집한 물리 테스트 증거는 해당 후보에만 적용한다. 현재 후보의
Desktop 버전과 Core·SDK revision이 모두 일치하지 않으면 정식 배포 증거로
승격하지 않는다. 현재 후보에 대한 새 물리 인수 증거는 이 문서에 기록하지
않는다.

자세한 Preview 운영 규칙은
[RELEASE-AND-PREVIEW-POLICY-ko.md](RELEASE-AND-PREVIEW-POLICY-ko.md)를 따른다.
