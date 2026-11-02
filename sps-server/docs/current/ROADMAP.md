# SPS 아키텍처 이행 로드맵

설계 기준 재정렬: 2026-11-02. [단일 설계 기준](DESIGN-BASELINE-2026-11-02.md)과
[사용자 원문](../design/CORE-PLUGIN-ARCHITECTURE-2026-10-25.md)의 Phase0~5를 따른다.
이번 변경은 문서 정리이며 구현 또는 장기목표를 자동 재개하지 않는다.

후속 승인: 사용자가 [Builder 선행 기반 실행 계획](BUILDER-PREREQUISITES-EXECUTION-PLAN-2026-11-02.md)을
승인해 장기목표를 등록했다. 첫 완료 지점은 공통 기반을 이용한 실제 Lead 대화·중단·재시작
복구 검증이며 아래 전체 로드맵/Stable 완료와 별개다. 문서 정리의 중단 기록은 당시 범위다.

## 단계와 완료 게이트

| 단계 | 작업 | 완료 근거 |
| --- | --- | --- |
| 0 현행 감사 | Core/UI/Native/SDK/Builder/Preview 책임·GAP01~15·위협 모델·호환성 조사 | 실제 소스/리비전, implemented/partial/missing/conflict/unknown 분류 |
| 1 비파괴 UX 분리 | 독립 Native Settings/트레이/단축키·복구 선행, 빈 Workspace와 Agent 강제 진입 제거 | Plugin 없이/오류 상태에서 관리 가능, 기존 deep link/API/데이터 보존 |
| 2 선택형 UI/SDK | Primary0~1, Extension 다중·전용 창·전체 화면·헤드리스, 선택형 Settings/Preview 계약 | Core 공통 메뉴를 요구하지 않는 Plugin 설치/실행·권한 검사 |
| 3 데이터/운영 | Workspace+Plugin 초기화·백업/복원·명시적 업데이트·롤백·다중 창·로컬 진단 | 타 Workspace/Plugin·외부 프로젝트 보존, 실제 앱/복구 증거 |
| 4 Runtime 보호 | 최대 파일 범위·Vault/자식 격리, pause/stop/재시작/취소 부활 방지·자원 귀속 | 실제 Windows 실행에서 보장 또는 미지원 거부, 공유 비용 정직한 표시 |
| 5 생태계/운영 확장 | 공개 SDK/범용 Builder/공통 Preview, Marketplace 검사·배지, 동의 기반 오류 집계 | 별도 범위·권한·라이선스 결정과 실제 운영 검증 |

Core 메뉴 제거는 독립 복구가 준비된 뒤 진행한다. 기존 Dashboard/Inbox/Agent API와
데이터를 바로 삭제하지 않는다. Primary는 권한 등급이 아니며 Extension UI를 제한하지 않는다.
Phase 순서는 의존성을 나타내며 날짜·완료율·현재 릴리스 약속이 아니다.

## 현재 코드에서 확인된 위치

- 빈 Workspace/Agent0 진입, 독립 Core Settings·복구와 scoped 실행·저장·생명주기에 기반이 있다.
- Core baseline의 선언된 일반 Plugin page는 강제 Core 프레임 없이 표시하도록 보완하고
  실제 Builder 앱에서 확인했다. 호환 Core 경로·legacy Workplane 모드는 보존하며,
  일반 Workspace 작업창은 여전히 단일 재사용 구조다. [정확한 진행/시험 기록](BUILDER-PREREQUISITES-PROGRESS-2026-11-02.md)을 따른다.
- Workspace 전용 Worker와 pause/stop/epoch 기반이 있지만 모든 실행/자손/원격 경로의 최종 자격은 별도다.
- OS Vault/파일 보호, 전체 독립 관리, 일부 초기화·Workspace 이동·자원 관찰은 미완료 또는 근거 부족이다.
- Host 전체 전송/Registry 패키지 보존·복원 후 승인 기반은 있으나 일반 Workspace 이동 범위와 같지 않다.
- 별도 Builder는 세 Lead 세션 준비/재확인/재시작을 검증했다. 실제 AI, durable submit, 공유 Lead 기억,
  CTO/Dev/QA/GitHub Actions·Runner와 전체v15는 완료되지 않았다.
- Marketplace 공개 유통과 공통 Preview 공개 API의 전체 구현은 완료되지 않았다.

## 검증 기록

정확한 Desktop/Core/SDK는 [CURRENT-CANDIDATE.md](CURRENT-CANDIDATE.md)를 따른다.
날짜·커밋별 실패·스킵·source/설치본·서명/unsigned·두 PC 검증은
[최종 검증 기록](CORE-FINAL-VALIDATION-2026-10-30.md)과 reviews에 남긴다.
과거 green CI나 Builder 화면 통과로 최신 후보 또는 Core 전체를 완료 처리하지 않는다.
구현을 다시 시작하려면 사용자 지시와 새로운 실행 계획이 필요하다.
