# Workflow Plugin과 Extension Plugin 전환 계획

상태: 2026-10-25 목표 문서 정렬; 목표 구현은 대부분 미완료
최종 갱신: 2026-10-25

## 목적

Workspace에서 기본 진입 Shell을 선택하는 방법과 다른 플러그인의 UI 자유를
정의한다. 이 문서의 목표는 현재 구현 상태와 구분한다. 자세한 근거와 순서는
[현행 감사](../reviews/CORE_PLUGIN_ARCH_GAP_AUDIT.md)와
[이전 계획](../reviews/CORE_PLUGIN_ARCH_MIGRATION_PLAN.md)을 따른다.

- **Primary**: 기본 진입 Shell로 선택된 플러그인. Workspace마다 선택은 0개
  또는 최대 1개다.
- **Extension**: Primary로 선택되지 않은 활성 플러그인. UI 없는 도구부터
  전체 작업 UI, 전용 창, 전체 화면 UI까지 자체 UI를 자유롭게 제공할 수 있다.

Primary와 Extension은 권한 등급이 아니다. 분류는 일반 SDK 접근이나 UI 제공
능력을 제한하지 않으며, 실제 capability와 Workspace 경계가 권한을 결정한다.
Primary 0개, Agent 0개, Extension 0개인 Workspace도 유효하다. 공통 Core Shell,
Dashboard, Inbox 사용을 강제하지 않는다.

## 확정 구조

```text
Workspace
├─ Primary (선택 사항: 0 또는 1)
└─ Extensions (선택 사항: 0개 이상, UI 선택 사항)
```

### Primary

Primary로 선택된 플러그인은 기본 진입 Shell과 탐색을 제공할 수 있다.

Primary 선택은 화면의 기본값만 정한다. Core 관리 권한이나 다른 플러그인의
데이터·권한 소유권을 주지 않는다. 기본 선택이 없으면 Plugin UI를 열지 않는
경로를 포함해 Host가 정하는 유효한 시작 동작을 제공한다.

### Extension

Extension은 업무 기능을 추가하거나 자체 UI를 제공한다. UI를 반드시 공통 Shell에
끼워 넣거나 기존 업무 흐름의 보조 기능으로 한정하지 않는다.

- 메모리 Provider, MCP 및 외부 도구
- GitHub, 빌드, QA, 이미지·음성 도구
- 전체 업무 UI, 전용 창, 전체 화면 UI 또는 헤드리스 실행
- Dashboard/Inbox 기여 (해당 호환 표면을 사용하는 경우)

여러 Extension을 함께 활성화할 수 있다. Extension이라는 분류만으로 자체
탐색 구조나 화면을 대체할 수 없다고 제한하지 않는다.

## 화면 정책

`Workspace Appearance`라는 독립 화면은 제거한다. Appearance를 별도로 열고
Shell을 다시 고르는 이중 절차를 만들지 않는다.

Core의 Plugin 관리 화면 또는 동등한 관리 경로에서 다음을 관리한다. 이는
Plugin이 사용할 Workspace UI를 강제한다는 뜻이 아니다.

- 현재 Workspace의 Primary 선택 (없음 또는 하나)
- Plugin별 Workspace 활성화 상태
- 플러그인의 설치·호환성·오류 상태

Primary 선택, Extension 활성화와 실행/데이터 정책은 Workspace별로 분리한다.

## Core에 남기는 계약

기존 API와 저장 데이터는 호환성을 위해 유지한다. 이것은 공통 UI를 필수로
유지한다는 뜻이 아니다.

- `ui.workspaceShell.provide` capability와 manifest 계약
- Workspace별 Shell 상태 저장 API
- 기존 Shell 선택 API와 Neutral fallback adapter
- 기존 Safe mode 및 Shell 실패 처리 계약
- Shell 로드 실패, 비활성화, 제거, 호환성 오류 처리
- Dashboard와 Inbox의 Core 계약

Native 관리/복구 경로를 Plugin 코드와 Plugin UI 밖에서 독립적으로 사용할 수
있도록 구현하고 실패 시나리오로 검증하는 것이 기존 공통 Shell UI를 제거하기
위한 선행 조건이다. 그 전까지 Shell API와 데이터는 additive 호환으로 보존한다.

## 단계별 계획

| 단계 | 범위 | 상태 |
| --- | --- | --- |
| A | 이 Source 문서와 수용 기준 정렬 | 목표/현행 구분 반영 |
| B | Plugin UI와 독립된 Native 복구 경로 | v1 소스/Electron smoke 구현; 전체 장애 조합은 미검증 |
| C | UI/Worker/Vault/파일 경계 보안 PoC | 가짜 파일 AppContainer canary만 통과; 제품 통합/전체 표는 미검증 |
| D | Primary/Agent/Extension 0개 Workspace 정상화, 공통 UI 선택화 | D1: 0 Agent 자동 redirect 제거; 공통 Shell과 기본 활성화 정책 유지 |
| E | 0/1 Primary 선택, 다중 Extension, 공개 계약과 호환성 | 일부 기존 primitive; 목표 계약은 미구현 |
| F 이후 | 실행 격리·제어, 데이터 경계, Preview/다중 창 등 | 마이그레이션 계획 참조 |

2026-08-01 문서의 0/1단계 완료 표기는 독립 Appearance UI 제거라는 당시의 좁은
범위에 한정된 이력이다. 이를 새 목표의 분류, Native 복구, 공통 UI 선택화가
구현되었다는 근거로 해석하지 않는다.

후속 검증 범위는 [구현 진행 기록](../reviews/CORE_PLUGIN_ARCH_IMPLEMENTATION_PROGRESS.md)을
따른다. 이전 감사의 미구현 표와 최신 부분 구현을 혼합해 완료로 판단하지 않는다.

## 전환 규칙

1. Primary 선택은 선택 사항이며 Workspace별 0개 또는 최대 1개다.
2. Extension은 여러 개 활성화할 수 있고, UI/창/탐색 제공으로 제한하지 않는다.
3. Plugin UI 제공 여부와 Primary/Extension 명칭은 권한을 부여하거나 빼앗지 않는다.
4. Native Core 관리와 복구는 Plugin UI 및 Plugin 코드 로딩에 의존하지 않는다.
5. 기존 Shell/Dashboard/Inbox API와 저장 데이터는 호환 경로로 보존하며 강제
   마이그레이션하거나 즉시 삭제하지 않는다.
6. 패키지는 Host에 설치하고, 활성화·설정·데이터·실행 정책은 Workspace별로
   적용한다. 기존 Workspace Job 기능과 완성된 실행 제어/격리는 구분한다.
7. 새 기본값이나 마이그레이션은 기존 Extension을 묵시적으로 비활성화하지 않는다.

## 완료 기준

문서 목표의 수용 기준은 다음과 같다. 아래는 구현 완료 보고가 아니다.

- Primary/Agent/Extension이 모두 0인 Workspace를 정상 생성·사용할 수 있다.
- 공통 Workspace Shell/Dashboard/Inbox가 없어도 제품 사용이 가능하다.
- Native 복구는 Plugin UI/코드 실패 및 Workspace 창 부재에도 접근 가능하다.
- Primary는 0개 또는 최대 1개이고, Extension의 UI 제공은 제한되지 않는다.
- 기존 Shell/API/data를 읽고 유지하는 호환성과 신규 계약이 함께 검증된다.
- Workspace-scoped Jobs를 Host 전역이라고 기술하지 않으며, Job scope만으로
  완성된 pause/stop/실제 종료/replay 방지를 주장하지 않는다.

## 범위 밖

다음은 별도 PR/게이트에서 구현·검증한다.

- Native 독립 복구와 보안 PoC
- 빈 Workspace 및 선택형 Core/Plugin UI
- Primary/Extension manifest/API의 additive 전환과 데이터 호환
- Workspace 실행 정책, 실제 종료 증거, private data lifecycle
- 다중 창, 공개 Preview, Builder 연계, 배포 검증
