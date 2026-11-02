# Plugin Builder 대화와 Core 경계

갱신: 2026-11-02. [Core–Plugin 설계 기준](DESIGN-BASELINE-2026-11-02.md)을 따른다.

## 목표

Plugin Builder는 선택형 공개 범용 제작 Plugin이다. 다른 Builder·외부 IDE·SDK/CLI
제작도 가능하며 Core는 Builder·Agent 등록·대화를 필수 시작 조건으로 강제하지 않는다.
대화·업무 분배·Lead/CTO/Worker·기억·승인·보고는 Plugin 소유다.
Core는 인증된 Workspace, 선택형 Agent/Runtime·세션·저장·Run/Job/결과·중단만 제공한다.

별도 [Builder 저장소](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)의 v15는
솔루션 제작 워크플로와 UI v9의 세부 설계다. Lead3대화가 같은 프로젝트의 Lead 기억을
공유하고 CTO는 프로젝트별 단일 세션, Dev/QA는 독립 세션을 갖는 목표를 유지한다.
이 구성을 Core의 필수 역할이나 범용 Builder의 유일한 작업 방식으로 고정하지 않는다.
검정·중립 회색 UI는 Builder에만 적용하며 강제 Core 사이드바/메뉴 없는 화면을 목표로 한다.

## 현재와 기록

현재 별도 Builder는 Workspace 입력·Agent 선택·세 Lead 세션 준비/기존 ID 확인·재시작 유지
검증 기록이 있다. 실제 AI 전송, durable request receipts, 공유 기억 및 전체 CTO/Dev/QA/
GitHub Actions Runner는 완료되지 않았다. 새 세션 identity API만으로 메시지 중복 방지를 주장하지 않는다.

이 Source의 과거 번들 `sps-plugin-discovery` 대화·Lead/Worker·실제 CLI 시험은
[과거 Delivery 기록](PLUGIN-BUILDER-DELIVERY-PLAN.md)의 해당 리비전에만 유효하다.
새 Builder 구현의 완료 증거나 설계 원본으로 사용하지 않는다.
Preview는 Builder 전용 기능이 아닌 공통 격리 개발 기술이며 실제 설치는 Core 관리에서 승인한다.
