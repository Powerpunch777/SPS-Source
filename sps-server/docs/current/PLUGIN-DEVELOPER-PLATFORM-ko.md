# SPS Plugin 개발 플랫폼

갱신: 2026-11-02. [공통 설계 기준](DESIGN-BASELINE-2026-11-02.md)이 우선한다.
공개 SDK 원본은 [sps-plugin-sdk](https://github.com/Powerpunch777/sps-plugin-sdk)다.
아래 목표와 실제 고정 SDK의 exports/API/시험 결과를 구분한다.

## 선택형 공통 기술

Core는 manifest·capability·호환성·Host 설치/Workspace 활성화·설정/데이터·
범용 Event/Job/Run/Artifact·Node 실행·Secret 대리 호출·진단/복구를 제공한다.
필요한 기술만 사용하는 Plugin을 허용한다. UI·AI·Agent·Dashboard·Inbox·설정 메뉴는 필수가 아니다.

Primary/Extension은 기본 진입 지정이지 권한 신분이 아니다. Extension도 전용 창,
전체 화면, 헤드리스 및 선언한 일반 SDK 기능을 사용할 수 있다.
Core는 사용자/Host/Member/Workspace/보호 자원 접근을 집행하고
Plugin은 업무 역할·승인 정책을 정한다. 업무 권한을 이유로 Core 인가를 우회할 수 없다.

## 제작 경로

외부 IDE/SDK CLI/다른 Builder/기본 Builder를 동등하게 허용한다.
Builder는 공개 범용 제작 도구이며 개인 외주v15는 그 적용 워크플로다.
생성·검사·패키징과 실제 설치·활성화 승인을 분리한다.
의존성은 설치/버전/호환/활성 범위를 검사하되 사용자 승인 없이 자동 설치하지 않는다.

## UI와 Preview

Plugin 자체 UI에 Core 상단바/사이드바/필수 설정 버튼을 강제하지 않는다.
선택적 설정 열기 API와 독립 Native 관리·복구를 조합한다.
현재 내부 Desktop bridge 또는 공개 Preview fixture를 범용 Preview lifecycle API의
완성으로 표시하지 않는다. 실제 Workspace/데이터·설치와 분리된 공통 Preview가 목표다.

## 검증과 버전

Diagnostics/Test Kit/Conformance와 SDK capability 검사를 재사용하되 메모리 mock,
manifest 선언, source 시험, 실제 앱, 설치본, 물리 PC 증거를 구분한다.
설계 문서의 예시 API는 출시된 메서드 이름이나 지원 보장이 아니다.
고정 source revision과 공개 tag/package version을 구분하고 additive 호환·폐기 경로를 제공한다.
Core 코드·자격증명·사용자 데이터를 공개 SDK/Builder 저장소로 복사하지 않는다.
Marketplace 검사·배지는 별도 확장 단계이며 검사 범위·버전/해시·출처를 표시한다.
SDK 기존 라이선스는 유지하며 Builder/Preview 구체 라이선스는 별도 결정한다.
