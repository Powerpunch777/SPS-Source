# Workflow Plugin과 Extension Plugin 전환 계획

상태: 전환 결정 및 1단계 독립 Appearance UI 제거 완료
최종 갱신: 2026-08-01

## 목적

SPS 플러그인을 두 종류로 분류하고, Workspace별 작업 방식을 선택할 수 있는
기준을 정한다.

- **Workflow Plugin**: Workspace의 주요 작업 흐름과 화면 구성을 제공한다.
- **Extension Plugin**: 메모리, MCP, GitHub, 이미지 도구처럼 기존 작업 흐름에
  기능을 추가한다.

장기적으로 각 Workspace는 `Primary Workflow` 하나를 사용하고, 여러 Extension을
동시에 활성화할 수 있다. 이번 구현 범위는 이 장기 구조의 전체 구현이 아니라,
독립적인 `Workspace Appearance` UI를 제거하는 것이다.

## 확정 구조

```text
Workspace
├─ Primary Workflow Plugin (장기 목표: 최대 1개)
└─ Extension Plugins (장기 목표: 여러 개)
```

### Workflow Plugin

Workflow Plugin은 다음을 제안할 수 있다.

- 기본 진입 화면
- 작업 화면과 탐색 그룹
- Dashboard 기본 배치
- 해당 업무에 필요한 프로젝트, 작업, 보고 화면

Workflow Plugin은 Core 설정, 복구 경로, 다른 플러그인의 데이터와 권한을
소유하지 않는다.

### Extension Plugin

Extension Plugin은 현재 Workspace의 작업 흐름에 기능을 추가한다.

- 메모리 Provider
- MCP 및 외부 도구 연결
- GitHub, 빌드, QA, 이미지·음성 도구
- Dashboard 위젯과 Inbox 보고

Extension은 여러 개를 동시에 활성화할 수 있으며, 자체적으로 Workspace의
전체 탐색 구조를 대체하지 않는다.

## 화면 정책

`Workspace Appearance`라는 독립 화면은 제거한다. Appearance를 별도로 열고
Shell을 다시 고르는 이중 절차를 만들지 않는다.

장기 구현에서는 `Settings > Plugins`에서 다음을 관리한다.

- Workflow Plugin 목록
- 현재 Workspace의 Primary Workflow 선택
- Extension Plugin별 활성화 상태
- 플러그인의 설치·호환성·오류 상태

Primary Workflow 선택은 해당 Workspace에만 적용되어야 한다. Extension 활성화도
Workspace별로 독립 저장되어야 한다.

## Core에 남기는 계약

이번 UI 제거는 Core의 Workspace Shell 계약을 삭제하는 작업이 아니다. 다음은
계속 유지한다.

- `ui.workspaceShell.provide` capability와 manifest 계약
- Workspace별 Shell 상태 저장 API
- Neutral Core Shell fallback
- 고정 복구 경로와 Safe mode
- Shell 로드 실패, 비활성화, 제거, 호환성 오류 처리
- Dashboard와 Inbox의 Core 계약

현재 단계에서는 위 계약을 사용하는 기존 코드와 저장 데이터를 변경하지 않는다.
독립 Appearance 화면만 제거하거나 더 이상 진입할 수 없게 정리한다.

## 단계별 계획

| 단계 | 범위 | 상태 |
| --- | --- | --- |
| 0 | Workflow/Extension 분류와 독립 Appearance UI 제거 범위 문서화 | 완료 |
| 1 | 독립 `Workspace Appearance` 메뉴·페이지·진입점 제거. 기존 URL은 Plugins로 이동하며 Shell 계약, API, 저장 데이터, fallback 유지 | 완료 |
| 2 | Plugins 화면에서 Workflow와 Extension을 구분해 표시 | 미구현 |
| 3 | Workspace별 Primary Workflow 선택 및 저장 | 미구현 |
| 4 | Extension 다중 활성화와 Workspace별 상태 검증 | 미구현 |
| 5 | 기존 Appearance 데이터의 Primary Workflow 마이그레이션과 fallback 검증 | 미구현 |
| 6 | 기존 Plugin Preview·Review를 새 분류와 연결하고 Desktop E2E 및 업그레이드 회귀 검증 | 미구현 |

## 전환 규칙

1. 이번 단계에서는 `Workspace Appearance` 화면만 대상으로 삼는다.
2. Core의 Shell capability와 저장 계약을 제거하지 않는다.
3. 기존 Shell 선택 데이터는 삭제하지 않는다.
4. Primary Workflow 선택 화면이 구현되기 전까지 기존 저장값은 읽을 수 있어야
   하며, 필요하면 Neutral Core Shell로 안전하게 fallback한다.
5. Workflow와 Extension의 분류 또는 자동 활성화는 이번 단계에서 구현하지 않는다.
6. 플러그인 설치·검토·Marketplace 동작은 이번 단계의 범위가 아니다.

## 완료 기준

이번 단계의 완료 기준은 다음으로 한정한다.

- 독립 `Workspace Appearance` UI에 접근할 수 없다.
- Workspace Shell 계약, API, 저장 데이터, Neutral fallback이 유지된다.
- 기존 Workspace가 손상되거나 플러그인 활성화 상태가 바뀌지 않는다.
- Plugins, Safe mode, Diagnostics, Update, Export/Import 같은 복구 경로가
  계속 접근 가능하다.
- 후속 Primary Workflow 선택과 Workflow/Extension 분류가 구현되지 않았음을
  문서와 UI에서 혼동하지 않는다.

## 범위 밖

다음은 후속 단계에서 별도로 설계·구현한다.

- Plugins 화면의 Workflow/Extension 분류 UI
- Workspace별 Primary Workflow 선택
- Extension 다중 활성화 UX
- Appearance 데이터 마이그레이션
- 새 Workflow/Extension 분류와 기존 Plugin Builder Preview·Review의 연계
- Marketplace 검색, 추천, 공유
