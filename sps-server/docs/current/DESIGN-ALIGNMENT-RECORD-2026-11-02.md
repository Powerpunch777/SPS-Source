# 설계 문서 정렬 기록

2026-11-02. 사용자 요청: README를 제외한 설계 문서를 제공된 Core–Plugin 원문에 맞추고
Builder 내용도 정렬한다. 장기목표·새 구현은 중단한 상태이며 이번 변경은 문서만 다룬다.

## 기준과 변경

원문은 [보존본](../design/CORE-PLUGIN-ARCHITECTURE-2026-10-25.md),
현행 해석은 [설계 적용 기준](DESIGN-BASELINE-2026-11-02.md)을 따른다.
입력 ZIP의 문서 SHA256은8e77fb84439ab1f8779cca86bd35cabf2bdee497a706bfa4912f7523e26f9a77이다.
이후 개인 외주 전용·Marketplace 철회·OS 보호 제외 정책으로 원문 목표를 축소하지 않는다.
Core 비공개·SDK 공개를 유지하며 Builder/Preview 라이선스·판매 계약은 새로 정하지 않는다.

| 저장소/분류 | 처리 |
| --- | --- |
| Source 핵심 제품/완료/로드맵/Builder/개발 플랫폼8문서 | 현재 규범을 다시 작성. 이전 원문은 archive에 보존 |
| Source 실행/데이터/생명주기/UI/Native/호환 설계22문서 | 분야별 우선순위·목표/현재/이력 구분 추가, 충돌 문구 보정 |
| Source 과거 아키텍처 감사/이전/보호 실현가능성3문서 | 당시 리비전 기록으로 분류, 시험 결과 유지 |
| Source 원문·적용 기준·보존 스냅샷·이 기록 | 단일 원본과 해석·역사 보존 경로 추가 |
| Core 상위 계약/DESIGN/ROADMAP/개발 지침 | workflow-neutral·독립 Native 관리·Plugin 전체 UI·보호/데이터 목표 정렬 |
| Core95개 세부/상속 설계 | SPS 구현 계약과 Paperclip 호환/역사 참고를 구분. 회사/Issue/조직 UI를 SPS 필수 모델로 채택하지 않음 |
| SDK3문서 | 선택형 기술 계약·범용 Builder/Preview 경계와 Registry 승인 분리, 실제 API는 변경하지 않음 |
| 별도 Builder5설계/계획 | 공개 범용·선택형 제작 경로, Core UI 비주입, v15 업무 구성의 Plugin 소유권·미완료 보안 구분 |

원문8개를 [이전 설계 스냅샷](../archive/DESIGN-SNAPSHOTS-BEFORE-2026-11-02.md)에
보존하고 HEAD의 이전 내용과 일치하는지 확인했다. 블록 안 링크는 당시 위치 기준이다.
기타 날짜별 시험/실패/리뷰/릴리스 기록, README, 법적 고지·라이선스, 실행 코드와 실제 사용
절차는 구현 사실로 유지한다. 이런 기록은 새 목표를 철회하거나 완료로 바꾸는 규범이 아니다.

## 정렬한 핵심

- 빈 Workspace와 optional AI/Agent/Primary/Extension, Primary의 비권한 등급 성격.
- Plugin 전체 UI·전용 창·헤드리스 자유와 강제 Core sidebar/header/Dashboard/Inbox 제거 목표.
- Plugin 코드 없이 접근하는 Native 트레이·전역 단축키·독립 Settings/복구.
- Host 패키지 설치와 Workspace 활성화/설정/데이터/실행 분리, 다중 창과 백그라운드 수명주기.
- pause/stop/resume 영속화·실제 종료·타 Workspace 보존·취소 작업 자동 부활 금지.
- 선택적 최대 파일 범위와 Source/cwd 구분, CLI/자식까지 OS 집행·전체 허용에도 Vault 보호.
- 자원 관찰/공유 비용과 강제 CPU/RAM 상한 구분, 네트워크 기본 자유.
- Workspace+Plugin 기본 초기화, 기본 인증정보 제외 백업 목표와 현재 민감값 포함 가능성 구분.
- 사용자 선택 업데이트 적용·의존성 설치 승인, 로컬 로그와 동의 기반 원격 전송.
- 공개 범용 Builder/외부 IDE/다른 Builder와 공통 Preview, Marketplace 후속 단계 구분.

이 Builder가 채택한 Lead3세션·공유 Lead 기억·프로젝트 CTO 단일 세션·독립 Dev/QA·
GitHub Actions/Self-hosted Runner 설계는 유지한다. Core나 다른 Builder의 필수 규칙으로
옮기지 않는다. 검정·중립 회색 v9는 Builder 안에만 적용한다. Core 프레임 안 시험 통과는
전체 Plugin 화면 분리나 실제 AI/OS 보호 완료 증거가 아니다.

## 검증 범위

최종 검수에서 변경된 Markdown 146개와 새로 추가한 로컬 링크 176개를 검사해 오류 0건을 확인했다.
원격 링크 전체 및 기존 링크 전체를 검증했다는 뜻은 아니다. README 변경 0건, 실행 코드/API/DB/라이선스 변경 0건을
확인했고 Core의 YAML frontmatter도 보존했다. 문서만 변경했으므로 앱/보안/실기기 시험을
새로 실행하지 않았으며 이전 검증을 새 후보의 통과 증거로 재사용하지 않는다.
독립 문서 작업은 Luna high에 분담하고 부모가 변경·링크·최신 SDK/검증 값과 문구를 재검수했다.
후보 문서는 실제 docs-only Core/SDK gitlink를 반영해 다시 생성했다. Desktop 버전,
API·패키지 버전·설치본·서명·사용자 DEV 프로필과 데이터는 변경하지 않는다.
