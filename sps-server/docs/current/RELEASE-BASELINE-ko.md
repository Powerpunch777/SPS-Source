# SPS 릴리스 기준선

최종 갱신: 2026-07-29

이 문서는 SPS Desktop 개발 후보와 SPS Core, 공개 Plugin SDK의 정확한 조합을 기록한다.
기계가 검사하는 기준값은 `sps-server/release/support-matrix.json`이다.

## 현재 기준

| Desktop | 상태 | SPS Core | Extension Profile | Plugin API | 배포 경로 |
| --- | --- | --- | --- | --- | --- |
| 0.4.49 | 기존 공개 파일 | 기록 미완성 | 기록 미완성 | 기록 미완성 | `SPS-Desktop-Releases` |
| 0.4.80 | 개발 후보, 미배포 | `d502f9f1b2aad2b95b63a0d1400494f66874fd26` | 1.0 | 1 | 비공개 Actions artifact만 허용 |

`0.4.80`은 아직 정식 릴리스가 아니다. 소스와 Core 작업 트리가 깨끗하고 아래 검증을 모두 통과한 새 버전만 첫 stable 기준선으로 승격한다.

## 지원 조합

- Windows 10/11 x64
- Host와 Member는 같은 SPS Desktop 설치 파일을 사용
- 원격 연결은 Tailscale을 사용
- 공식 자동 업데이트는 `latest` 채널만 사용
- 설치 파일과 업데이트 메타데이터는 `Powerpunch777/SPS-Desktop-Releases`에서만 제공
- SPS Extension Profile 1.0, Plugin API 1
- 번들 확장: SPS Default Memory 0.1.0, Plugin Discovery & Builder 0.1.0, SPS Team Workplane 0.3.91

## 릴리스 전 검증

1. support matrix가 Desktop package, Core gitlink, 실제 Core checkout, 번들 확장 버전과 일치한다.
2. Desktop, Desktop Node, Plugin Platform 테스트와 Host 런타임 smoke test가 통과한다.
3. Windows 설치 파일 코드 서명이 유효하다.
4. `latest.yml`, 설치 파일, blockmap, release manifest의 버전과 SHA-256이 일치한다.
5. 기존 버전과 같은 번호의 release는 다시 게시하지 않고 patch 버전을 올린다.

개발 candidate workflow는 GitHub Actions artifact만 만들며 공식 업데이트 저장소에는 게시하지 않는다.

## 롤백 원칙

Owner Vault의 데이터베이스 백업은 보존한다. 데이터베이스 schema를 이전 버전으로 자동 복원하는 기능은 아직 정식 지원하지 않는다. 첫 stable 공개 전에는 호환 가능한 restore 경로 또는 forward-fix 전략을 실제 설치본으로 검증해야 한다.
