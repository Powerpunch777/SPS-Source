# SPS Core 완료 판정 기준

설계 재정렬: 2026-11-02. [공통 기준](DESIGN-BASELINE-2026-11-02.md)이 우선한다.
이전 개인 외주 전용/Marketplace 철회/OS 격리 제외 정책은 현재 목표를 축소하지 않는다.
과거 개발 범위·시험 사실은 보존하며 이번 문서 수정은 구현·장기목표 재개가 아니다.

## Core가 완성됐다는 의미

Core는 업무 중립 기술 플랫폼으로서 Plugin을 안전하게 설치·운영·복구할 수 있어야 한다.
Room/Task/Lead/조직도/업무 승인/메모리 방식은 필수 모델이 아니다.
Core와 SDK만으로 다른 제작자가 만든 Plugin을 사용할 수 있고 Builder·AI는 선택 사항이다.
Core 비공개·SDK 공개와 기존 API·데이터 호환성은 유지한다.

| 판정 영역 | 필요한 증거 |
| --- | --- |
| 빈 상태 | Agent0/Primary0/Extension0의 Workspace 진입·관리·복구 |
| 화면 자유 | Primary0~1, 여러 Extension의 UI/전용 창/전체 화면/헤드리스, 강제 Core 메뉴 없음 |
| 독립 관리 | Plugin 코드 비로딩·오류 상태에서도 트레이/전역 단축키/Settings의 관리·초기화·복구 |
| Host/Workspace | Host1회 설치, Workspace별 설정·활성화·데이터·실행·접근 통제 |
| 다중 창 | 창 닫기/화면 전환과 실행 수명주기 분리, 같은/다른 Workspace 여러 창 |
| 실행 | pause/stop/resume 영속화·실제 관리 프로세스 중단·타 Workspace 무영향·취소 작업 부활 금지 |
| 보안 | optional 최대 파일 범위·CLI/스크립트/자식 집행, 전체 파일 허용에도 Vault 원문 보호 |
| 권한 | capability·Secret 대리 호출·Source/Runner grant·현재 사용자/Workspace 허가·관리자 경계 |
| 데이터 | Workspace+Plugin 기본 초기화, 전체 초기화 별도 확인, 외부 프로젝트/Vault 보존 |
| 생명주기 | 설치·활성·중지·업데이트·제거·롤백·호환성·데이터 보존 |
| 관찰 | 실행 상태/종료 이유/기록과 Workspace 자원 관찰, 공유 비용 정직한 분리 |
| 운영 | 명시적 업데이트 적용, 로컬 진단·동의 기반 원격 전송, 백업/복구·기존 데이터 이전 |

OS 보호는 API 경로 검사, DPAPI, Electron renderer sandbox, Windows Job Object
또는 canary 성공만으로 충족되지 않는다. 실제 지원 Runtime과 자식 프로세스까지
검증해야 한다. 격리 불가 경로는 명시적 미지원/거부 상태로 다룬다.
현재 일반 동일 사용자 Worker가 이 목표를 충족한다는 주장은 하지 않는다.

## 별도 단계와 검증

Marketplace 공개 유통·검사/배지·동의 기반 오류 집계 서버는 원문의 후속 단계다.
목표에서 영구 폐기된 것으로 적지 않으며 미구현 기능을 현재 제공한다고 표시하지 않는다.
Builder의 Lead3/CTO/Dev/QA·기억·Runner 흐름은 별도 Plugin 설계이며
Core 완료의 증거를 대신하지 않는다. Preview는 Builder 독점이 아닌 공통 기술 목표다.

설치·업데이트·롤백·백업·빈 Host 승인 복원, 이전 DB/Desktop 상태와0.4.86 데이터 보존
재설치/사용자 확인 잔여 정리의 기존 검증을 유지한다. 실패·미실행·스킵·다른 리비전·
unsigned/서명본·source/설치본·한 PC/두 PC 증거를 구분한다.
사용자 앱·계정·Vault·외부 프로젝트·원본 dirty checkout·Production을 보존한다.
실제 운영 변경과 추가 제품 결정은 사용자 확인 뒤 진행한다.

## 현재 판정

전체 Core 완료는 입증되지 않았다. 현재 Core 프레임 강제, 다중 일반 Workspace 창,
독립 관리 기능 완성도, OS 보호, 일부 데이터/자원 운영과 정확한 후보의 필수 검증에
공백이 있다. [로드맵](ROADMAP.md)과 날짜·커밋별 감사는 이를 완료로 바꾸지 않는다.
장기목표는 중단된 상태이며 이번 작업은 문서 정리만 수행한다.
