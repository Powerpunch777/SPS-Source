# SPS Desktop 출시 기준

최종 갱신: 2026-07-30

이 문서는 SPS Desktop과 SPS Core의 현재 개발 후보를 설명한다. 정확한
기계 판정 기준은 [`../../release/support-matrix.json`](../../release/support-matrix.json)에
있다.

## 현재 후보

| 항목 | 상태 |
| --- | --- |
| SPS Desktop | `0.4.82` 개발 후보, 아직 코드 서명 전 |
| SPS Core | `d502f9f1b2aad2b95b63a0d1400494f66874fd26` 기준 |
| Plugin API | `1` |
| Extension Profile | `2.0` 기본, `1.0` 호환 경로 유지 |
| 지원 운영체제 | Windows 10/11 x64 |
| 팀 연결 | Tailscale 기반 Host/Member 연결 |

## 기본 동작

1. SPS는 Desktop 앱 중심 제품이다. Owner Host의 일반 브라우저 요청은
   차단되고 Desktop만 짧은 수명의 로컬 증명을 사용한다.
2. 새 Workspace에는 Task, Room, 역할, 승인 규칙, 기억 전략, 기본 AI가
   강제되지 않는다. 필요한 작업 방식은 플러그인이 제공한다.
3. 기본 활성 플러그인은 `Plugin Discovery & Builder`다. 사용자가 초기
   Assistant를 등록하면 그 Assistant가 플러그인 검색 또는 제작 초안을
   도울 수 있지만, 플러그인을 자동 설치하거나 활성화하지는 않는다.
4. `SPS Default Memory`와 Room Workplane은 번들에 포함되지만 새
   Workspace에서 자동 활성화되지 않는다.

## 설치와 Agent Runtime

기본 설치 파일은 `SPS-Desktop-Setup-0.4.82.exe`이며 크기는
225,047,800 bytes(약 214.6 MB)다. 이전 0.4.81 후보의 약 360 MB보다
40.4% 작다.

Codex ACP와 Claude ACP는 기본 설치에 포함하지 않는다. 릴리스에는 각각
별도 ZIP과 SHA-256 카탈로그가 제공되며, Host가 필요한 팩을 내려받아
압축을 푼 뒤 Desktop 설정에서 직접 추가한다. 자세한 절차는
[AGENT-RUNTIME-PACKS.md](AGENT-RUNTIME-PACKS.md)를 따른다.

## 현재 검증

- SPS Desktop 자동 테스트 184/184 통과
- 패키지 내부 Owner Host 런타임 검증 통과
- 팩이 없는 기본 Owner Host smoke 통과
- `win-unpacked`와 실제 임시 설치본의 격리 로그인 화면 smoke 통과
- 임시 Windows 설치 성공: 112초
- 릴리스 매니페스트에 설치 파일, blockmap, Codex/Claude 팩의 해시 기록

## 출시 전 필수 작업

1. 실제 베타 노트북에서 0.4.82 설치 시간과 첫 실행을 다시 확인한다.
2. 두 컴퓨터에서 Host 생성, 초대, Member 참여, Node 승인, 프로젝트
   소스 연결, 재시작, Member 제거까지 수동으로 확인한다.
3. 공식 코드 서명 인증서로 설치 파일을 서명하고 Authenticode 검증을
   통과시킨다.
4. 설치 파일, blockmap, `latest.yml`, 릴리스 매니페스트, 런타임 팩 ZIP,
   팩 카탈로그를 같은 버전의 불변 릴리스로 공개한다.

이 후보는 개발 및 통제된 베타 검증용이다. 위 조건을 충족하기 전에는
공개 정식 배포본으로 취급하지 않는다.
