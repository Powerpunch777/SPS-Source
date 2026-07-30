# SPS 정식 배포와 Preview 정책

최종 갱신: 2026-07-30

## 두 채널을 분리하는 이유

설치 자체를 먼저 시험해야 하는 개발 후보와, 기존 사용자를 안전하게 업데이트해야
하는 정식 빌드는 요구 조건이 다르다. SPS는 두 채널을 섞지 않는다.

| 구분 | Official release | Preview |
| --- | --- | --- |
| 저장소 | `SPS-Desktop-Releases` | `SPS-Desktop-Preview` |
| 용도 | 제한된 실제 베타와 자동 업데이트 | 설치·첫 실행·UI 확인 |
| 서명 | 필수 | 없을 수 있음 |
| `latest.yml`/blockmap | 같은 릴리스에 함께 게시 | 게시하지 않음 |
| 자동 업데이트 | 허용 | 차단 |
| 실제 프로젝트 데이터 | 허용 범위 안에서 사용 | 사용 금지 |

## Preview 게시 절차

1. 설치 파일을 빌드한다.
2. 파일 크기와 SHA-256을 기록한다.
3. Preview 저장소에 prerelease로 설치 파일만 올린다.
4. `latest.yml`과 blockmap은 올리지 않는다.
5. Redon Games 다운로드 페이지에 Preview임과 미서명 상태를 명확히 표시한다.
6. 실제 다운로드 URL에서 파일을 받아 해시, 설치, 제거, 재설치, 첫 실행을
   확인한다.

Preview는 정식 업데이트 검증을 대신하지 않는다. Preview에서 발견한 문제를 고친 뒤
새 Preview를 만들거나, 정식 릴리스 게이트를 통과한 경우에만 Official release로
승격한다.

## Official release 게시 절차

1. 소스와 잠금 파일을 고정하고 회귀 테스트를 통과한다.
2. 두 대의 실제 컴퓨터에서 Host/Member 수동 인수 테스트를 통과한다.
3. Windows 설치 파일에 Authenticode 서명을 적용하고 검증한다.
4. 설치 파일, blockmap, `latest.yml`, 런타임 팩, 해시, 릴리스 노트를 한 버전으로
   게시한다.
5. 새 설치와 이전 정식 버전에서의 업데이트를 각각 확인한다.

Official release 저장소에는 미서명 파일, 개인 로그, 초대 코드, Vault, 프로젝트 파일,
인증서, API 키를 올리지 않는다.

## 이번 설치 확인 기록

2026-07-30에 `0.4.90-preview.1`을 공개 Preview URL에서 다시 내려받아 SHA-256을
확인했다. 기존 SPS Desktop 실행 파일을 제거한 뒤 재설치했고, Owner Vault 설정이
유지된 상태에서 Workspace 화면이 열리는 것을 확인했다. 이 결과는 설치 경로 검증이며
서명 또는 정식 업데이트 검증 결과는 아니다.
