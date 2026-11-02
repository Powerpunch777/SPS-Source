# SPS Core–Plugin 아키텍처 재정의: 확정 결정 및 Codex 인수인계

- **문서 상태:** 사용자와의 설계 대화에서 확정된 목표 아키텍처. **구현 완료 보고서가 아님.**
- **작성 기준일:** 2026-10-25 (KST)
- **대상:** SPS Desktop / SPS Core / Plugin SDK / 공식 Plugin Builder / Plugin Preview / 플러그인 생태계
- **주요 목적:** Core를 최소한의 신뢰 기반·실행 플랫폼으로 재정의하고, 사용자 업무 방식과 UI를 플러그인에 위임한다. 기존 구현과 차이를 감사한 후 단계적으로 이행한다.
- **Codex에 대한 최우선 지시:** 이 문서를 읽었다고 즉시 기능을 삭제하거나 전면 리팩터링하지 않는다. 먼저 실제 체크아웃된 코드/버전/테스트 상태를 조사하고 차이·위험·변경 순서를 보고한다.

---

## 0. 한 문장 비전

> **SPS Core는 플러그인이 안전하게 설치·실행·격리·복구될 수 있는 기술 플랫폼이고, 모든 작업 방식·UI·협업·도메인 모델은 각 플러그인이 자유롭게 선택한다.**

**'Core가 기능을 제공한다'와 '모든 플러그인이 그 기능을 써야 한다'는 전혀 다르다.** AI, 대화, Agent, Task, Dashboard, Inbox, 프로젝트, 자동화, 협업, 파일 탐색 UI, 공통 메뉴를 **필수 조건으로 강제하지 않는다.** Core는 SDK를 통한 선택적 기술 기능을 제공할 수 있다.

### 변경 금지에 가까운 시스템 경계

플러그인의 자유는 Core 관리자 권한 또는 타인의 보호 자원에 대한 무제한 접근을 뜻하지 않는다. 특히 Core Secret Vault, Core 무결성/복구, 사용자·Workspace 접근 통제, 명시적으로 설정된 Workspace 최대 파일 접근 범위, 안전한 플러그인 설치·업데이트 계약은 보호한다.

## 1. 용어와 책임

| 층위 | 정의 | 사용자가 항상 볼 필요? |
|---|---|---|
| **Core Runtime / Host** | 신뢰된 서비스: 인증, Workspace, Node, Plugin 생명주기, 범용 Run/Job/Event/Storage, 보안, 진단·복구 | 아니오 |
| **Core System UI** | 독립 설정·복구: Plugins, Workspace, 시스템/보안, 업데이트, 오류·백업 | 필요할 때만 별도 창 |
| **Plugin SDK** | Core 기술 기능을 선택적으로 사용하는 안정된 계약. Core Runtime 자체를 대체하지 않음 | 아니오 |
| **Primary Workflow** | Workspace의 기본 UI·진입 동작을 선택적으로 제공하는 플러그인. Workspace당 최대 1개 | 없음도 가능 |
| **Extension** | UI 유무 및 사용 방식이 자유로운 추가 플러그인. Workspace당 여러 개 | 아니오 |
| **Plugin Builder** | 누구나 플러그인을 만들 수 있는 공개 범용 제작 플러그인. 유일한 제작 방법이 아님 | 기본 제공/추천, 강제 아님 |
| **Plugin Preview** | Builder에 종속되지 않는 격리 개발·테스트 공통 기능 | 필요할 때 |
| **Workspace** | Core의 기술적 상태·데이터·접근·실행 경계. '프로젝트'와 동일하지 않음 | 사용자가 의식할 필요 없음 |

**분류 주의:** Primary/Extension은 탐색과 기본 화면 선택을 위한 개념이지 일반 SDK 기능을 독점·차단하는 플러그인 신분제도가 아니다. Extension에도 자체 창·전체 화면·백그라운드·서비스 제공을 허용한다. 다만 한 Workspace의 **기본 진입 Shell을 자동 점유하는 역할**은 명시적 Primary 선택 정책을 따른다. Primary가 없는 Workspace도 정상이다.

## 2. 사용자 확정 결정 목록 (요구사항의 단일 기준)

### 2.1 UI와 첫 실행

1. Core만으로 일상 업무를 수행할 필요는 없다. **빈 Workspace 정상 지원**. 최초 사용 시 Plugin Builder/플러그인 설치 발견 경로는 제공하되 Agent 등록 또는 Dashboard를 강제하지 않는다.
2. **Dashboard / Inbox**는 Core의 필수 시작 화면·고정 메뉴에서 제외. 필요하면 해당 플러그인이 자체 구현하거나 선택적 공용 기술 API를 활용. 기존 Core 데이터/API는 마이그레이션 계획 없이 삭제하지 않는다.
3. **AI/Agent 등록·역할 관리 UI**는 플러그인 선택 기능. Core는 신뢰된 인증·AI 실행·세션·기술적인 저장/연결 기반을 제공할 수 있지만 사용자에게 Agent 생성을 강요하지 않는다. AI 미사용 플러그인도 정상이다.
4. 주 플러그인은 Workspace의 화면 전체·탐색·테마·패널·창을 자유롭게 구성할 수 있다. Extension 또한 독립 창, 주 플러그인과 협의된 통합, 헤드리스 모두 가능. UI가 전혀 없는 플러그인 지원.
5. **Core 메뉴를 플러그인 UI에 자동 삽입하거나 빌드 검증으로 강제하지 않는다.** Core 시스템 관리는 Windows **시스템 트레이 + 단축키 + 독립 설정창**으로 항상 접근 가능. Workspace 전환도 트레이/시스템 UI 제공.
6. SDK에서 `Core 설정 열기`, `플러그인 관리 열기`, `Workspace 관리 열기` 같은 진입 API를 **선택적으로** 제공하고 사용을 권장. 플러그인이 화면 버튼을 만들지 않아도 빌드/설치 허용. API 이름·형식은 예시이지 확정 구현 아님.

### 2.2 Workspace, Host, Node, 실행 제어

7. Workspace는 Core의 식별·데이터·권한·실행 격리 단위. 프로젝트/팀/업무 모델은 플러그인 소유. 첫 Workspace 자동 준비, 평상시 Workspace 선택기 고정 표시 불필요.
8. 플러그인 패키지는 **Host 단위로 한 번 설치**, 각 Workspace별 활성화 및 데이터·설정 상태는 독립. 최대 1개 Primary, 여러 Extension은 목표 정책이며 Primary 없음 허용.
9. **로컬 단독 사용**이 기본으로 가능. Host/Member 인증과 다른 Node 연결은 선택적 확장. Core는 연결·인증·상태/전달, 플러그인은 Node 선택·분산 작업/UI를 결정.
10. 여러 Workspace에서 **동시에 작업·백그라운드 실행**. 화면 전환 또는 창 닫기는 다른 작업을 종료하지 않는다. Core는 하나의 Host, Desktop은 여러 창·여러 Workspace·동일 Workspace 다중 창 지원 목표.
11. 모든 Desktop 창을 닫아도 Core가 트레이에서 유지. 트레이에서 명시적 종료 가능. Windows 시작 시 자동 실행 선택. 실제 Core 종료 시 관리 중인 작업에 미치는 영향 안내.
12. **Workspace 상태:** 실행 중 / 일시정지(새 작업 차단, 기존 작업 유지) / 중지(신규 차단 + 진행 중인 관리 작업 중단) / 재개. 중단 시 관련 AI, 자동화, 외부 실행까지 범위에 포함하며 **다른 Workspace는 영향 없음**.
13. Workspace의 일시정지·중지 상태는 Core에 영속 저장되어 재시작 후 유지. 재개하더라도 **중단된 작업은 자동 재실행하지 않음**. 이후 도래하는 정규 예약만 정책에 따라 새로 실행. 취소된 실행을 플러그인 재시도 코드가 몰래 부활시켜서는 안 됨.
14. Core는 Workspace별 CPU/메모리·실행 상태를 표시. 공유 Worker 자원은 추정값으로 거짓 귀속하지 말고 공유 비용 별도 표시. 자동 CPU/메모리 제한 **없음**; Workspace별 자원 할당 상한은 **추후 검토**.
15. 반복 오류나 고부하만으로 플러그인/Workspace를 자동 중지하지 않음. **Core의 보안·데이터 무결성·실행 안정성에 실질적 위협**이 생길 때에만 최소 범위에 개입. 업무 오류 재시도는 플러그인 책임, 기술 로그는 Core 책임.

### 2.3 파일·실행·네트워크 및 보안

16. Workspace의 **최대 파일 접근 범위**를 **선택적으로** 설정. *미설정은 OS 사용자 권한 내 전체 접근*; 설정 시 허용 폴더(복수 가능) 밖에 대한 접근을 제한. 작업 폴더 선택 UI/정책은 플러그인 소유. 작업 폴더와 접근 허가 범위는 다름.
17. 파일 범위를 제한한 Workspace에서는 **플러그인 본체·AI CLI·스크립트·하위 프로세스까지** 같은 경계를 적용해야 함. 경로 검증 API만으로 보안 보장 불가. 격리를 증명할 수 없는 실행 경로는 제한된 Workspace에서 보호된 실행으로 취급하거나 무조건 허용하지 말 것.
18. **Core Secret Vault는 절대 예외 영역.** Workspace 전체 파일 접근 허용, 모든 드라이브 허용 상태라도 플러그인 및 그 하위 프로세스는 Core API 키·OAuth 토큰·세션·암호화 키 원문을 직접 읽을 수 없어야 함.
19. 플러그인은 SDK에 노출된 비밀값 문자열 대신 연결 핸들/대리 호출 기능을 사용(가능한 공급자부터). 서비스별 인증 UI는 플러그인에 둘 수 있으나 신뢰된 로그인·토큰 입력 경로와 Core의 인증정보 삭제/권한 회수는 보호. 인증 기능 사용 권한과 임의의 외부 API 행동은 별도 정책 문제.
20. 터미널·Python·Git·Docker·Unity·Codex 등 외부 프로그램 및 작업 방법은 플러그인이 자유롭게 결정. Core는 기술 실행·종료·Node dispatch·관련 Workspace 범위 집행을 담당. Core 고정 터미널 화면 없음.
21. **네트워크/인터넷 접근은 기본 자유**. Core 기본 기능으로 도메인·사이트·URL별 화이트리스트/블랙리스트를 구축하지 않는다. 작업 대상 사이트 설정은 플러그인 선택. Host/Node 신뢰된 통신과 Core 인증정보 보호는 유지.
22. Core의 시스템 관리자 권한(플러그인 설치·삭제·업데이트, 보안 범위 해제, Secret Vault 관리, 타 Workspace 데이터 초기화, 복구 비활성화 등)은 임의 플러그인에게 부여하지 않는다. 필요한 경우 Core 관리 UI 열기 요청만 허용. 보안 경계는 UI·SDK 장식이 아니라 실제 실행환경에서 집행.

### 2.4 플러그인 데이터, 통신, 공통 기술 기능

23. 플러그인의 대화·기억·작업 기록·설정은 **플러그인별 전용 데이터 저장공간**에 기본 저장. 설치 패키지와 실행 데이터를 분리. 포맷(JSON/DB/Vector 등)은 플러그인이 결정. 선택적으로 플러그인 공유 데이터 영역을 지원할 수 있음.
24. Core에서 고장 난 플러그인도 **초기화 가능**. 기본 초기화는 **현재 Workspace에 속한 해당 플러그인 데이터만 삭제**. 모든 Workspace 데이터 초기화는 별도 확인. 비활성화/업데이트 시 데이터 유지. 제거 시 데이터 유지 또는 함께 삭제 선택. 외부 사용자 프로젝트 파일은 삭제 대상에서 제외.
25. 범용 **저장·이벤트·스케줄러·반복 실행·Run/Job·백그라운드 실행**은 Core 기술 기능 + SDK로 제공 가능. 강제 Dashboard/Inbox/자동화 UI/Agent UI 불필요. 플러그인이 업무적 자동화·메모리·보고/검토 의미와 화면을 소유. Core 종료 중에는 예약 실행 불가; 놓친 실행의 정책은 안전하게 설계.
26. 같은 Workspace 내부의 플러그인 간 기능 호출은 공통 기술 기반으로 지원. **다른 Workspace 간 통신 여부·공개 기능·협업 방식은 플러그인이 결정**하되, Core의 Workspace 식별/사용자 허가/보호 자원 경계는 우회하지 않음. 플러그인 통신 기능 자체는 선택.
27. 필수/선택 플러그인 의존성은 플러그인이 선언. Core는 설치 여부·버전·호환성·활성화 범위만 검증. 사용자 승인 없이 의존 플러그인 설치·활성화하지 않음. 설치는 Host 단위, 사용은 Workspace 단위.
28. Core는 SDK 하위 호환성 최대 보장, API 변경 시 사전 폐기·전환 경로 제공. 플러그인이 요구하는 Core/SDK/Plugin API 범위 선언 및 설치·활성화 검사. 호환성 문제 발생 시 이전 정상 버전 복구 수단 유지.

### 2.5 배포·복구·개발 생태계

29. `설정 > 플러그인 관리`는 **Core 필수**. 설치·활성화·비활성화·버전 업데이트·제거·롤백·상태·데이터 초기화는 Core 책임. 플러그인이 실행 중이거나 UI가 고장 나도 접근/복구 가능.
30. Core/Plugin 업데이트는 **자동 확인**(안전한 범위 내 다운로드 가능), **실제 적용은 사용자 선택**. 실행 중 작업 보호, 적용 전 패키지/호환성 검증, 실패 시 롤백. Workspace 데이터 보존.
31. Core는 충돌·비정상 종료·기술적 진단 로그를 **로컬에 자동 기록**. 사용자 동의 시에만 최소화·민감정보 제거된 오류 정보를 개발자 서버에 자동 전송. 사용자 동의 거부 시 정상 이용. 재시작 이후 전송 대기 및 개발자용 별도 집계 도구 고려. 플러그인의 업무 기록은 플러그인 소유.
32. Workspace 백업/복원, 플러그인 설치 목록·상태, Core 관리 플러그인 데이터 보존은 Core 기반. 외부 프로젝트 파일은 자동 삭제/포함하지 않으며 필요한 백업은 플러그인 또는 사용자 선택. 인증정보는 기본 제외·재연결. 다른 데이터 저장소 사용 플러그인에는 선택적 백업 훅 제공.
33. 사용자·Host/Member·Workspace 접근 권한은 Core. 혼자 사용 시 팀·조직 설정 필요 없음. 부서·직책·프로젝트별 역할·결재 등은 Plugin.
34. **Plugin Builder는 공개 범용 제작 플러그인**, 누구나 다른 빌더·외부 IDE로 제작 가능. **SDK·Preview 사용 API와 Preview 구현의 공개 추진**. Preview는 Builder 독점물이 아닌 Core의 재사용 가능한 격리 개발 능력. 테스트 빌드는 실제 Workspace/데이터/생명주기에 영향을 주지 않고, 실제 설치는 Core 관리 UI에서 명시적 승인.
35. 로컬 제작 플러그인 설치 허용. 마켓플레이스는 버전/해시별 패키지·의존성·AI 보안 점검 및 결과 표시 제공 목표. 배지는 **`SPS 보안 검사 통과`** 등 실제 검사 범위를 설명할 뿐 절대적 안전 보증 아님. 업데이트 시 재검사. 구현된 것으로 간주하지 말 것.

### 2.6 명시적 보류 사항

- **플러그인 저작권·외주 판매·재판매·복제·업데이트 계약·수익 배분**: 사용자가 보류 결정. 이 문서로 임의의 소유권/라이선스 정책 확정 금지.
- **Builder/Preview의 구체적인 오픈소스 라이선스:** 코드 공개 방향만 확정. 실제 라이선스 종류 및 배포 가능 조건은 별도 결정(기존 SDK 라이선스와 별도 검토).
- **Workspace별 CPU/메모리 강제 한도:** 추후 검토. 이번 목표는 관찰/귀속.
- **Workspace 네트워크 허용 도메인 정책:** 이번 기본 Core 범위에서 제외. 필요 시 별도 제안.
- **Zod 3 → 4 전면 마이그레이션:** 기존 대화에서 Builder 안정화 이후 검토하기로 함. 본 아키텍처 변경에 끼워 넣지 말 것. 의존성 보안 정책에 따른 별도 긴급성 판단은 유지.

---

## 3. 사용자에게 보이는 최종 경험

### 3.1 일반 작업 화면

```text
SPS Host / Core (신뢰된 런타임, 백그라운드)
├── Workspace A (Primary 선택 또는 없음; Extension 0개 이상)
│   ├── Plugin이 결정한 UI / 혹은 빈 화면
│   ├── Plugin이 결정한 AI·업무·자동화·프로세스
│   └── Core의 해당 Workspace 보안·실행 경계
├── Workspace B (A와 동시에 실행; 창 0개 이상)
│   └── 독립적인 Plugin UI / 백그라운드 작업
└── Native Core System UI (Plugin에 비종속)
    ├── 트레이: Workspace 전환 / 설정 / Plugins / 종료
    ├── 단축키: Core 설정 열기
    ├── 독립 설정창: Workspace / Plugins / Node / 보안 / 진단 / 업데이트 / 백업
    └── 플러그인 오류 시 Safe Mode / 복구
```

### 3.2 플러그인이 없는 Workspace

- 사용자가 요구한 *빈 화면 가능성*을 정상 상태로 처리한다. Core Dashboard나 Agent 등록 화면으로 강제 리다이렉트하지 않는다.
- Builder는 기본 번들 제공·발견/제작 진입점으로 추천하지만 플러그인 사용 강제는 아님.
- 플러그인이 없어도 Core Settings / Plugins 및 복구는 Native 경로로 접근할 수 있다.

### 3.3 설정 진입점의 계약

- **필수:** Native 트레이 및 단축키에서 독립 Core Settings 열기.
- **선택/권장:** SDK의 `openCoreSettings({ section: ... })` 유사 API. 최종 이름/스키마는 SDK 설계에서 정한다.
- **금지:** 플러그인 화면에 공통 메뉴/상단바/사이드바 삽입을 강제하거나, 메뉴 구현 여부를 빌드 합격 조건으로 삼는 것.

---

## 4. 현행 소스 기준 구현 차이 조사 (2026-10-25 외부 문서/코드 스냅샷)

**범위 제한:** 여기서는 GitHub에서 확인한 `codex/sps-release-hardening`의 문서와 **해당 문서에 고정된 Core commit**을 근거로 한다. Codex는 실제 로컬 체크아웃에서 다시 검증해야 하며, 미확인 사항을 미구현이라고 단정하면 안 된다.

### 4.1 확인한 기준

- `sps-server/docs/current/CURRENT-CANDIDATE.md`: Desktop **0.4.137 development-candidate**, Core `0574df95db75bff132ef2b7f9704f7bbd73608c6`, SDK `@sonparkserver/plugin-sdk@0.11.0` (`cfa64ec4...`), Plugin API 1.
- `docs/current/WORKSPACE-PLUGIN-ACTIVATION.md`: 플러그인 **Host당 1회 설치, 최대 1개 Worker**, Workspace별 활성화 상태 분리 **구현되었다고 문서화됨**. 자동 별도 Worker나 Workspace OS 격리를 의미하지 않음.
- `docs/current/WORKFLOW-AND-EXTENSION-PLUGIN-PLAN-ko.md`: 독립 Workspace Appearance 제거는 완료로 기록; `Workflow/Extension` 표시, Workspace별 Primary 선택, Extension 다중 활성화 UX 등 **후속 단계 미구현으로 기록**.
- `docs/current/PLUGIN-BUILDER-DELIVERY-PLAN.md`: Builder 대화/Lead/Worker, Desktop Developer Mode, 격리 Preview 등 **소스 구현 및 제한된 검증 증거** 존재. 전체 제품 완성/Stable 검증과 동의어 아님.

### 4.2 직접 확인한 격차

| ID | 분류 | 현행 확인 근거 | 목표/조치 |
|---|---|---|---|
| GAP-01 | **확인됨: UI 충돌** | Core `ui/src/components/Sidebar.tsx`에서 `/dashboard`, `/inbox` 고정 메뉴 렌더 | 일반 Workspace 작업 UI에서 의무 메뉴 제거. 기존 Deep link·기능·데이터는 호환 마이그레이션 계획 수립. |
| GAP-02 | **확인됨: 초기 진입 충돌** | Core `ui/src/App.tsx`의 `CoreBaselineIndexRedirect`, `/dashboard`·`/inbox`·`/assistants/new` 경로 및 default route | Primary가 없고 작업 UI가 없어도 빈 Workspace 정상. Native 설정 경로는 항상 복구. |
| GAP-03 | **확인됨: Agent 강제** | Core `ui/src/pages/SpsCoreWorkspaceHome.tsx`에서 Agent 목록 비어 있으면 `/assistants/new` 리다이렉트 | Agent 없는 Workspace/AI 미사용 플러그인 허용. 기존 Builder Agent 연결은 작동하도록 수정/호환 유지. |
| GAP-04 | **확인됨: Domain UI 잔존** | 동일 Core Workspace Home에 Agent 목록/관리 및 Dashboard 위젯 | Core 보편 작업화면 강제 제거. 필요 UI를 플러그인 또는 선택적 개발자 도구에서 제공. |
| GAP-05 | **문서상 미구현** | Workflow/Extension 전환 문서의 2~6단계 미구현 상태 | Primary 최대 1개 + Extension 다중 활성화, 헤드리스/독립 창 동작 정책을 기능·보안 제한 없이 구현. |
| GAP-06 | **확인됨: 기존 계약과 충돌** | Workspace Shell/Dashboard/Inbox 설계서가 Core Dashboard grid·Inbox envelope·공통 Sidebar 소유를 전제 | 신규 계약과 문서 정합성 확보. 기존 plugin SDK 표면은 즉시 삭제하지 말고 선택적/호환 계층으로 제공할지 결정. |
| GAP-07 | **확인됨: 실행모델 제약** | Host당 최대 1개 plugin worker 공유 | Workspace별 OS 격리, 중지, 파일/Secret 차단, 자원 귀속을 공유 Worker가 우회하지 않도록 별도 설계 필요. |
| GAP-08 | **확인됨: Preview 일부 기반** | Builder Delivery Plan에 개발용 격리 Preview 기록 | Builder 전용 Desktop bridge와 범용 공개 Preview SDK 경계/배포 API를 감사 후 안정화. |
| GAP-09 | **추가 감사 필요** | Native 트레이/단축키/설정창·다중 창·백그라운드 종료 로직은 위 자료로 구현 여부 미확정 | Electron 진입점/IPC/윈도우 수명주기 실제 코드 감사. |
| GAP-10 | **추가 감사 필요·보안 위험 높음** | Core Secret Vault와 동일 OS 권한 프로세스의 실제 분리 증거 미확인 | 전체 파일 접근을 허용해도 Vault 원문을 읽을 수 없는 OS 격리·명령 실행 체인 실증. |
| GAP-11 | **추가 감사 필요** | Workspace Sources가 현재 Core 소유, Node-specific 경로 제공 | 새 `선택적 최대 파일 접근 범위`와 기존 Sources/Agent cwd 차이·마이그레이션·실제 집행 검증. |
| GAP-12 | **추가 감사 필요** | 현재 Host/Workspace export 기능은 문서상 범위 제한; plugin-private 데이터 전체 보존 미보장 | Core 관리 plugin-private storage의 reset/backup/restore, shared data, 외부 파일 제외 계약 설계. |
| GAP-13 | **추가 감사 필요** | Run/Job/Event는 Core primitive, 자동화 UI/기술 서비스 혼재 여부 미확정 | 기술 primitive만 UI 없이 제공 가능한지 검증. Workspace pause/stop 영속화·취소 재실행 방지 구현.
| GAP-14 | **추가 감사 필요** | 자동 오류 외부 전송, 동의 기록, 수집 서버 상태 미확정 | 로컬 로그와 동의 기반 텔레메트리 구분, 필터링/보존 정책/다음 실행 업로드 검토. |
| GAP-15 | **추가 감사 필요** | SDK/manifest 기능 선언·Core 업데이트·롤백 일부 존재 | SDK `openSettings`, Cross Workspace 통신, dependency, public preview, API version/compat 실제 지원 범위 감사. |

**참고:** GAP-09~15는 '구현되지 않았다'는 주장 아님. 대상 코드 미열람·미검증이므로 Codex가 먼저 사실을 확인할 것.

### 4.3 핵심 위험/트레이드오프 (결정된 요구를 조용히 약화시키지 말 것)

**SEC-01 — '제한 없는 로컬 파일 접근'과 '절대 읽을 수 없는 Secret Vault'의 동시 보장**

- 동일 Windows 사용자 권한으로 플러그인/자식 프로세스와 Vault를 실행한다면, SDK에서 원문 API를 숨겨도 보안 경계로 충분하지 않다. DPAPI 암호화만으로 같은 보안 주체의 임의 코드 접근 위협을 완전히 해결한다고 가정하지 말 것.
- 별도 OS 주체/서비스, 실제 격리 프로세스, OS ACL·토큰, 별도 안전한 인증 브로커와 권한 없는 플러그인 런타임 등 **실증 가능한 위협 모델**을 제안하고 검증. `Windows Job Object` 등 프로세스 관리 수단이 곧 파일시스템 접근 샌드박스를 뜻하지 않는다는 점 주의.
- 플러그인 자체가 받은 외부 API 응답이나 허용된 작업 결과를 외부로 전송하는 문제와 Vault 원문 차단은 다른 보안 목표. 무제한 네트워크 접근이 허용되는 만큼 마켓플레이스 AI 스캔은 보조 안전 표시이지 실행 보안 대체 수단이 아님.

**SEC-02 — Workspace 파일 범위의 실제 집행**

- 심볼릭 링크/junction/reparse points, UNC/Node/Windows 드라이브, 자식 프로세스·스크립트·CLI, 임시 폴더, 범위 변경 중 실행 등을 고려. 단순 문자열 접두사 검사 불가.
- 사용자가 파일 범위를 설정했으나 해당 Runtime에서 집행 불가하면 `완전한 제한이 적용됨`으로 표시하거나 조용히 풀지 않는다. 사용자에게 **지원 불가 상태**를 알리고 위험 작업을 거절하거나 보안 정책을 재설정해야 한다.

**RUN-01 — Workspace 중단과 공유 프로세스**

- 공유 Worker를 죽이면 다른 Workspace에 영향. 작업별 취소 토큰/런 식별/자식 프로세스 귀속을 정확히 추적하고, 작업 수준에서 종료 불가능한 경우 안전한 제한/격리를 설계한다.
- 중지 후 재개 = 신규 실행 허용. 과거 취소된 실행을 retry/backlog로 자동 재생성하지 않음.

**DATA-01 — 기본 저장과 백업/초기화**

- 모든 plugin-private 데이터를 Core가 항상 이해하는 것은 불필요. 하지만 Core가 삭제/백업할 수 있는 전용 스코프 계약이 필요. 외부 프로젝트, 사용자 파일, Vault와 혼동하지 않도록 영역 구분.

---

## 5. Codex 실행 계획 (승인 이전에는 감사·제안 우선)

### Phase 0 — 변경 없는 현행 코드 감사 (최우선, 소스 수정 금지)

1. 실제 Source/Core/SDK/Desktop/Builder 버전 및 브랜치, worktree 상태를 기록.
2. Core Runtime/API / Core UI / Native Desktop / SDK / Plugin Builder·Preview의 실제 소유 경계를 경로·함수 단위로 조사.
3. 위 **GAP-01~15**를 코드로 재검증하여 `implemented / partial / missing / conflict / unknown`과 테스트 근거를 표로 작성.
4. 핵심 보안 위협 모델 SEC-01/02, RUN-01을 **구현 가능한 방법·제약·검증 시나리오**와 함께 별도 제안. 안전성 보장이 불가한 설계는 정직하게 명시.
5. 파일/DB/API/SDK/UI 계약 변경 목록, 데이터 이전·하위 호환·롤백 계획, 우선순위·난도·의존성을 제시.
6. **이 단계에서 Core UI 삭제, DB 마이그레이션, 공용 API 삭제, Installer/Updater 변경, 인증 시스템 재작성, Zod 전면 전환을 하지 않는다.**

### Phase 1 — 비파괴적 UX 분리

- Core 트레이/단축키/독립 설정창 및 플러그인 오류 시 복구 경로를 먼저 보장·검증.
- 이어서 기본 Dashboard/Inbox/Agent 자동 강제 진입을 제거하고 빈 Workspace와 Plugin 기본 화면/없음 처리.
- 과거 Dashboard/Inbox API, 저장 데이터, Deep link는 마이그레이션 방침 확정 전 폐기하지 않음.
- AI 미사용 플러그인 / Builder 초기 Agent 미등록 상태 정상 UX 테스트.

### Phase 2 — 선택형 Plugin UI/SDK 계약

- Primary 없음·최대 1개, Extension 다중, 독립 창/헤드리스/동시 실행.
- 공개 가능한 Core Settings 열기 SDK, Preview 공통 인터페이스를 안전하게 도입.
- Cross-Workspace 공개 기능 호출은 호출 주체/대상 Workspace·승인 범위를 명확히 하되 플러그인 UI/업무 규칙 강제하지 않음.
- SDK 하위 호환 및 구버전 매니페스트 변환 테스트.

### Phase 3 — Plugin 데이터 수명주기와 운영 편의

- 플러그인 실행파일/데이터 분리 및 Workspace별 초기화, 전체 초기화, 백업·복원.
- 명시적 업데이트 승인·실행 중 안전한 적용·롤백, 오류/진단 로컬 기록.
- Native 다중 창 및 트레이 거주, 운영자가 보는 Workspace 상태 UI.

### Phase 4 — Workspace Runtime 격리 (보안 검증 게이트)

- 제한 없음 / 특정 폴더 허용 Workspace별 실행 정책 실효성 검증.
- Vault 격리·자식 프로세스 격리·프로세스 종료와 공유 Worker 모델의 충돌 해결.
- Workspace pause/stop/persist/resume/old-run no-auto-restart 테스트.
- 자원 측정 귀속: 전용 Run과 공유 Worker 분리, Core 자체 자원 별도 표시.
- 실제 OS 수준 통제 증거 없으면 ‘격리 구현 완료’로 선언하지 않음.

### Phase 5 — 생태계 및 운영 확장 (별도 범위)

- 범용 공개 SDK·Preview 문서와 Builder 코드 공개 준비(라이선스는 보류).
- 마켓플레이스 검사 결과 provenance, 버전/해시/서명/배지 및 재검사.
- 사용자 동의 기반 오류 전송 및 운영 서버 수집·분류.
- 자동화·Node·Host Transfer 실기기 회귀 검증. 유료 판매·외주/저작권 정책 확정 전 상품화 자동화 금지.

### 우선순위 제안

1. **P0 — 복구 경로/격리 불일치/불필요한 필수 UI**를 설계상 정확하게 파악하고 사용자 경험부터 안전하게 전환.
2. **P1 — Builder·Preview 안정성 유지 + SDK 계약 정리 + Primary/Extension UI 선택성** 확보.
3. **P1 보안 게이트 — Secret Vault/Workspace 파일 제한의 실효성**을 증명하기 전 해당 보장 문구/기능 완료 선언 금지.
4. **P2 — 데이터 초기화·백업, Workspace 중단·다중 창·자원 관찰**.
5. **P3 — 텔레메트리 서버·마켓플레이스 AI 검사/배지·추가 생태계 기능**.

---

## 6. 수용 기준(회귀 테스트에 반영)

### 사용성/플러그인 자유

- [ ] 신규 Workspace에 Agent 0개/Primary 0개/Extension 0개여도 정상 접근, Core 설정/Plugins 관리 가능.
- [ ] Primary가 있으면 전용 UI를 사용할 수 있고 Core 상단바/Sidebar/Dashboard/Inbox/Agent 생성이 강제로 삽입되지 않음.
- [ ] UI 없는 Extension을 설치·활성화·비활성화·사용 가능; 독립 창 Extension 역시 정상.
- [ ] SDK 설정 진입 API를 사용하지 않는 플러그인도 패키지 검증·설치 통과.
- [ ] 플러그인 UI 충돌 시 Native 트레이/단축키에서 Core 설정을 열어 해당 플러그인을 비활성화·복구 가능.

### Workspace/실행

- [ ] 로컬 단독 Node 연결 없이 Workspace 사용 가능.
- [ ] Workspace A 작업 중 B로 전환/창 닫기/새 창 열기 후 A 작업 유지; Core 종료는 구분.
- [ ] 여러 창에서 같은 Core 세션/플러그인 설치 상태 공유.
- [ ] A 일시정지 시 A의 신규 작업만 차단. A 중지 시 A의 관리 작업 취소, B는 계속. A 재개 후 과거 취소 Run 자동 재시작 안 함.
- [ ] SPS 강제 종료/재시작 이후 중지·일시정지 상태 유지.
- [ ] CPU/메모리 고사용 및 반복 플러그인 오류만으로 자동 Workspace 중지하지 않음.

### 보안(반드시 실제 Windows 프로세스로 검증)

- [ ] Workspace 파일 범위 미설정 = OS 사용자 권한 한도(단 Vault 예외).
- [ ] Workspace 파일 범위 설정 = 플러그인과 자식 프로세스 모두 범위 밖 파일 읽기/쓰기 불가, junction/UNC 등 우회 실패.
- [ ] Workspace 전체 파일 허용 상태에서도 플러그인·자식 프로세스가 Core Secret Vault의 평문/복호 키/API 토큰을 직접 읽지 못함. 구현 불가 시 명시적 차단/미지원 표시.
- [ ] Secret 대리 호출은 원문 미반환, 호출 자격/대상 검사. 다른 Workspace 보호 데이터도 마찬가지.
- [ ] 플러그인이 Core 설치·업데이트·Vault 보호·Workspace 보안 정책을 임의로 변경할 수 없음.

### 데이터/호환/운영

- [ ] Workspace A의 Plugin X 초기화 시 Workspace B의 X 데이터 및 Plugin Y 데이터 유지.
- [ ] 전체 Workspace의 X 초기화는 별도 명시 확인, 외부 프로젝트와 Vault는 보존.
- [ ] X 업데이트/비활성화에도 데이터 유지; 제거 시 데이터 유지/삭제 선택; 실패 시 롤백.
- [ ] 기존 Core 후보의 데이터·plugin manifest·route·SDK는 이전/호환/회귀 테스트를 통과함.
- [ ] 오류 로그는 로컬 자동 기록, 동의하지 않으면 원격 전송 없음; 동의 시 최소화/민감정보 필터 테스트.
- [ ] Workspace export/Host Transfer 기존 테스트, Preview production-isolation, Builder 생성/빌드/검증 기능이 보존됨.

## 7. Codex 작업 규칙 및 보고 형식

- **사실 / 가정 / 설계 목표**를 명확히 구분. 실제 소스 인용은 `repo/path:line` 형태, 결과는 재현 가능한 테스트/명령으로 기록.
- 사용자가 결정한 Plugin 자유도나 Core 복구 경로를 임의로 축소하지 말 것. 보안 제약과 충돌하는 경우 **사용자 결정이 필요한 대안**을 제시하고 가정으로 구현하지 말 것.
- 프로젝트 파일 대량 삭제·기존 DB 스키마 파괴·SDK breaking change·인증/격리 저하는 사전 계획과 데이터 이전 없이는 금지.
- 보안 위협 모델에서 `의도한 안전성`과 `실제 증명된 안전성`을 구분. AI 스캔/서명/검증 배지는 샌드박스와 별개의 보조 통제.
- `release/support-matrix.json`과 관련 자동 생성 문서를 임의로 고쳐 버전/증거를 맞추지 말 것. 실제 코드와 후보 tuple을 기준으로 검증.
- 현행 **Plugin Builder 제공 기능과 Preview의 보호 경계**를 보존하고, Builder 안정화와 무관한 Zod 3→4 전체 이전은 독립 범위로 분리.
- 회귀를 막기 위한 신·구 동작 비교표, 확인된 테스트, 테스트하지 못한 부분, 남은 위험을 반드시 보고.

**Phase 0의 요구 산출물:**

1. `CORE_PLUGIN_ARCH_GAP_AUDIT.md` — 현재 코드 대비 GAP 표 (근거 파일·라인·상태·영향·난도)
2. `CORE_PLUGIN_ARCH_MIGRATION_PLAN.md` — 단계·변경 파일/API/DB·데이터 이전·롤백·검증 계획
3. `CORE_PLUGIN_SECURITY_FEASIBILITY.md` — Windows Vault/Workspace Runtime 격리 위협 모델과 실증 계획
4. 짧은 승인 요청 — 구현에 들어가기 전에 결정해야 하는 실제 충돌 항목만 제시

---

## 8. 참조 소스 및 체크 위치

### 공개/접근 가능한 설계 문서

- [CURRENT-CANDIDATE.md](https://github.com/Powerpunch777/SPS-Source/blob/codex/sps-release-hardening/sps-server/docs/current/CURRENT-CANDIDATE.md)
- [PRODUCT-ARCHITECTURE-ko.md](https://github.com/Powerpunch777/SPS-Source/blob/codex/sps-release-hardening/sps-server/docs/current/PRODUCT-ARCHITECTURE-ko.md)
- [WORKFLOW-AND-EXTENSION-PLUGIN-PLAN-ko.md](https://github.com/Powerpunch777/SPS-Source/blob/codex/sps-release-hardening/sps-server/docs/current/WORKFLOW-AND-EXTENSION-PLUGIN-PLAN-ko.md)
- [WORKSPACE-PLUGIN-ACTIVATION.md](https://github.com/Powerpunch777/SPS-Source/blob/codex/sps-release-hardening/sps-server/docs/current/WORKSPACE-PLUGIN-ACTIVATION.md)
- [WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md](https://github.com/Powerpunch777/SPS-Source/blob/codex/sps-release-hardening/sps-server/docs/current/WORKSPACE-SHELL-DASHBOARD-INBOX-ko.md)
- [PLUGIN-BUILDER-DELIVERY-PLAN.md](https://github.com/Powerpunch777/SPS-Source/blob/codex/sps-release-hardening/sps-server/docs/current/PLUGIN-BUILDER-DELIVERY-PLAN.md)
- [SPS-LIGHT-UI-PLAN-ko.md](https://github.com/Powerpunch777/SPS-Source/blob/codex/sps-release-hardening/sps-server/docs/current/SPS-LIGHT-UI-PLAN-ko.md)

### 고정 Core 소스(후보 tuple; 이후 변경 가능)

- [ui/src/App.tsx](https://github.com/Powerpunch777/SPS-Core/blob/0574df95db75bff132ef2b7f9704f7bbd73608c6/ui/src/App.tsx)
- [ui/src/components/Sidebar.tsx](https://github.com/Powerpunch777/SPS-Core/blob/0574df95db75bff132ef2b7f9704f7bbd73608c6/ui/src/components/Sidebar.tsx)
- [ui/src/pages/SpsCoreWorkspaceHome.tsx](https://github.com/Powerpunch777/SPS-Core/blob/0574df95db75bff132ef2b7f9704f7bbd73608c6/ui/src/pages/SpsCoreWorkspaceHome.tsx)
- [sps-plugin-discovery/src/ui/DiscoveryPage.jsx](https://github.com/Powerpunch777/SPS-Source/blob/codex/sps-release-hardening/sps-server/sps-plugin-discovery/src/ui/DiscoveryPage.jsx)

> **문서 업데이트 원칙:** 이 신규 설계가 기존 문서와 충돌할 경우, 코드를 바로 기존 문서에 맞추지 말고 `기존 구현`과 `새 목표`를 모두 명시한 변경 제안을 제출한다. 변경 승인 후 관련 문서·테스트·마이그레이션을 함께 업데이트한다.
