# SPS 제품 아키텍처

갱신: 2026-11-02. [설계 적용 기준](DESIGN-BASELINE-2026-11-02.md)과
[사용자 원문](../design/CORE-PLUGIN-ARCHITECTURE-2026-10-25.md)을 따른다.
목표 아키텍처이며 구현 완료 보고서가 아니다.

## 제품 경계

SPS Core는 플러그인을 설치·실행·격리·관찰·복구하는 기술 플랫폼이다.
업무, 프로젝트, Task/Room, 조직·역할, 승인, AI 대화와 기억은 Plugin이 선택한다.
AI·Agent·Builder·Dashboard·Inbox는 Core 이용의 필수 조건이 아니다.
Core 비공개·SDK 공개를 유지하며 구체적인 Builder/Preview 라이선스는 별도 결정한다.

| Core Runtime/Host | Plugin |
| --- | --- |
| 인증·사용자·Workspace 접근 통제 | 업무별 역할·승인·협업 규칙 |
| 실행·중단·복구·Node dispatch·기술 기록 | 어떤 도구/Node를 써서 무엇을 할지 |
| 패키지 생명주기·호환성·권한·서명 | UI·메뉴·대화·문서·도메인 결과 판단 |
| 범용 Storage/Event/Job/Artifact | 데이터 형식·메모리 전략·자동화 의미 |
| 보안 범위·Vault·진단·업데이트·백업 | 작업 폴더 선택 UI·작업물·외부 서비스 정책 |

Workspace는 기술 경계이며 프로젝트나 회사 조직과 동의어가 아니다.
한 Host의 패키지를 여러 Workspace에서 활성화하되 데이터·설정·실행을 구분한다.
Source 핸들/cwd/grant와 Workspace 최대 파일 접근 범위는 별개다.

## 화면과 Primary/Extension

Agent0/Primary0/Extension0인 Workspace는 정상이다. Primary는 기본 진입
화면을 선택하는 지정이며 Workspace당0~1개다. Extension은 여러 개이며
전용 창·전체 화면·헤드리스와 선언한 일반 SDK 기능을 사용할 수 있다.
Primary만 전체 UI나 특별 권한을 갖는 구조가 아니다.

Plugin 화면에 Core 상단바·사이드바·Dashboard·Inbox·설정 메뉴를 강제 삽입하지 않는다.
기존 API·데이터·deep link는 호환 경로로 유지한다. Core 관리 기능은
Plugin 코드가 고장 나거나 전혀 없어도 Native 트레이·전역 단축키·독립 Settings로
접근해야 한다. SDK 설정 열기 API는 선택적 편의 기능이지 설치 합격 조건이 아니다.

Desktop은 여러 Workspace/동일 Workspace의 여러 창과 백그라운드 실행을 목표로 한다.
창 닫기와 Core 종료를 구분하고, Core 종료의 관리 작업 영향을 알린다.
로컬 단독 사용이 기본이며 다른 Member/Node 연결은 선택적 확장이다.

## 실행·보안·데이터

- pause: 신규 차단·기존 유지. stop: 신규 차단·관리 실행 중단. resume: 신규 허용.
- 상태를 영속화하고 재시작/재개 때 과거 취소된 실행을 자동 재실행하지 않는다.
- CPU/RAM과 실행 상태는 관찰하되 공유 비용은 따로 표시한다. 강제 자원 상한은 보류한다.
- 반복 업무 오류나 고부하만으로 자동 중지하지 않는다. Core 보안·무결성·실행 안정성 위협에만 최소 개입한다.
- 파일 최대 범위는 선택 사항이다. 설정 시 Plugin·CLI·스크립트·자식 프로세스까지 실제 집행해야 한다.
- 전체 파일 허용 상태에서도 Core Vault 원문은 보호한다. 미지원 실행은 보호된 것처럼 허용하지 않는다.
- 네트워크는 기본 자유이며 일반 도메인 허용/차단 목록을 Core 필수 기능으로 만들지 않는다.
- Plugin 관리·보안 해제·타 Workspace 초기화 등 시스템 관리자 권한은 일반 Plugin에 주지 않는다.
- Plugin 전용 데이터와 패키지를 분리한다. 기본 초기화는 해당 Workspace+Plugin만 대상으로 한다.
- 업데이트/비활성화는 데이터를 보존한다. 제거의 데이터 삭제는 선택이며 외부 프로젝트는 제외한다.
- 백업은 관리 데이터·설치 상태를 보존하고 외부 저장소에 선택 훅을 둔다. 인증정보 기본 제외·재연결이 목표다.
- 자동 업데이트 확인과 사용자의 실제 적용 결정을 분리하며 호환성 검사·실패 롤백을 제공한다.
- 오류는 로컬 기록 기본이며 동의하지 않은 원격 전송은 하지 않는다.

## Builder와 Preview

공개 범용 Builder는 기본 제공/추천할 수 있으나 필수도 유일한 제작 수단도 아니다.
별도 [SPS-MY-PluginBuilder](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)의
v15 Lead/CTO/Dev/QA와 UI v9는 하나의 제작 워크플로다. 일반 제작·다른 Builder·외부
IDE의 SDK/Preview 이용을 막지 않는다. Core에는 그 역할·업무 판단을 넣지 않는다.

Preview는 공통 격리 개발·테스트 능력이다. Builder 전용 bridge나 운영 Workspace에
의존하지 않고 실제 데이터·실행·설치 승인과 분리하는 목표다. 공개 SDK fixture만으로
전체 Preview 런타임 API/OS 샌드박스가 완료됐다고 주장하지 않는다.
Marketplace 검사·배지·배포 확장은 별도 단계이며 검사는 절대 안전 보장이 아니다.

## 현재 상태와 차이

현재 후보는 development-candidate다. 정확한 고정값은 [CURRENT-CANDIDATE.md](CURRENT-CANDIDATE.md),
검증 사실은 [최종 검증 기록](CORE-FINAL-VALIDATION-2026-10-30.md)을 따른다.
빈 진입·기술 실행·권한·생명주기·복구 기반은 있으나 전체 Plugin 화면 분리,
전체 독립 관리, 다중 일반 Workspace 창, OS 파일/Vault 격리와 일부 데이터 운영은 미완성이다.
현재 같은 사용자 권한 Worker는 악성 코드 샌드박스가 아니다.

Windows Desktop/Tailscale는 현재 지원·검증 경로이며 Linux CI는 제품 지원과 구분한다.
내장 Native LAN의 과거 보류는 독립 Native 관리 UI/복구 목표를 삭제하지 않는다.
이번 문서 변경으로 전송 경로·계정·보안 정책을 바꾸거나 구현을 재개하지 않는다.
