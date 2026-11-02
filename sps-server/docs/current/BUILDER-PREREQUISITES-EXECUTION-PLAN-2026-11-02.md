# Builder 선행 기반 실행 계획

2026-11-02. 사용자가 선행 작업 순서를 승인하고 계획 저장 및 장기목표 등록을 요청했다.
문서 정리 단계의 중단 상태와 달리, 이 계획의 장기목표는 active로 등록했다.
등록 자체는 구현·시험·배포 완료가 아니다.

## 기준과 목표

[사용자 원문](../design/CORE-PLUGIN-ARCHITECTURE-2026-10-25.md)과
[설계 적용 기준](DESIGN-BASELINE-2026-11-02.md)을 따른다.
Core 전체 완성을 기다리지 않고 Builder에 실제로 필요한 공통 기반을 먼저 보완한다.
기존 기능은 재사용하며 새 AI 서버·독자 실행기·업무관리 시스템은 만들지 않는다.

첫 제품 완료 지점은 사용자가 Lead에게 메시지를 보내고, 응답을 받으며, 실행을
중단하고, 앱을 다시 열어도 대화와 실행 상태가 정확히 복구되는 것이다.
Core 전체 완료, 전체 Builder v15 또는 Stable 출시와는 다른 판정이다.

Builder 설계와 구현은 별도 [SPS-MY-PluginBuilder](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)
레포의 통합 설계 v15·UI v9 및 최신 UI 적용 기준을 따른다.
Core 비공개·SDK 공개, Builder 내부 검정·중립 회색 디자인을 유지한다.

## 시작 상태

- 계획 저장·장기목표 등록: 완료. 구현 단계는 아직 시작하지 않았다.
- 후속 구현과 시험은 [진행 기록](BUILDER-PREREQUISITES-PROGRESS-2026-11-02.md)을 따른다.
  위 시작 상태는 계획 등록 당시이며 전체 단계 완료를 뜻하지 않는다.
- 독립 관리·복구, Workspace 실행/저장/생명주기에는 기존 기반이 있다. 전체 완료는 아니다.
- Builder의 세 Lead 세션 준비·재확인·재시작 후 ID 보존에는 과거 source 앱 검증이 있다.
- 실제 AI 전송, 내구성 있는 전송 요청 기록, 분할 대화 저장과 공유 Lead 기억은 미완료다.
- Plugin 진입 후 호환 Core 프레임이 남아 있고 공통 Preview/OS 보호에는 공백이 있다.
- 이전 시험은 해당 리비전의 증거다. 문서만 바뀐 현재 HEAD에서 재실행했다고 표시하지 않는다.

## 단계와 완료 조건

| 단계 | 책임/범위 | 완료 조건 | 상태 |
| --- | --- | --- | --- |
| A 기존 기반 대조 | 총괄: 기존 Native/SDK/실행/저장 경로와 부족한 부분 확인 | 재사용 위치·실제 공백·수정 파일·시험 항목 확정. 이미 있는 기능 중복 구현 금지 | 1차 대조 완료, D/G는 각 구현 직전 상세 재검토 |
| B 독립 관리·복구 | Core/Desktop: 설정·비활성화·중단·복구 진입 | Plugin 없음/오류/비활성 상태에서도 Native 관리 가능. 기존 데이터와 deep link 보존 | 진행: 독립 Sources 진입 보완·시험, 전체 관리 미완료 |
| C 선택형 Plugin 화면 | Core/Desktop/SDK: 기본 UI와 Plugin 화면 분리 | 강제 Core sidebar/header 없이 Builder 표시. 독립 관리 접근 유지. 빈 Workspace 정상 | 일반 page 분리·Builder 앱 검증 완료, 다중 전용 창 등 전체 범위는 별도 |
| D 전송·복구 계약 | Core/SDK: 요청 식별·결과 조회·취소·재시작 정합성 | 중복 요청/응답 유실/Host 재시작/권한 회수에서 실행 상태를 확인. 모호한 전송 자동 재실행 금지 | 구현·표적 회귀/앱 검증 진행. 최신 receipt와 한계는 진행 기록 참조 |
| E 대화 저장·Builder 연결 | Builder: 메시지 페이지·전송 UI·세션 연결 | 한 snapshot 무한 누적 금지. 채널·Workspace 분리. 실제 결과와 실패/취소/미확인 구분 | turn/index/page 구현·87개 검사·실제 답변/재시작 확인. 공유 기억은 후속 |
| F Lead 실제 앱 검증 | 총괄: 분리 시험 환경과 승인된 시험 Agent | 전송→응답→실행 중단→재시작 복구를 직접 조작. 중복 실행·A/B 데이터 혼선 없음 | 실제 CLI 응답·중복 없음·재시작/화면 확인 통과. 실제 CLI 중단 확인은 남음 |
| G Preview/생성 코드 안전 게이트 | Core/Desktop/SDK: 별도 보호 검증 | 실제 데이터·권한·설치와 분리. 파일/Vault/자식 보호 실증 또는 미지원 실행 차단 | 해당 기능 활성화 전 필수 |

B의 독립 복구 경로가 검증되기 전에 기존 Core 메뉴를 제거하지 않는다.
D는 실행 접수의 중복 방지와 불확실성 처리를 뜻하며, 외부 provider까지 무조건
exactly-once라고 보장하지 않는다. 기존 create/ensure/list/getRun/cancel과 권한 검사부터
대조하고, 새 API·저장 구조가 필요한 경우 최소 변경으로 호환성을 검토한다.
SDK 버전 선언만으로 구형 Host의 지원을 가정하거나 비공개 HTTP로 우회하지 않는다.

## 실행·중단과 저장의 시험 기준

- 같은 요청의 동시/후속 제출, 같은 ID에 다른 내용 제출, 전송 직후 응답 유실.
- Host/Worker 재시작 전후 기존 요청·세션·run 식별자 조회와 불확실한 상태 표시.
- 새 시험 tuple에서 세 Lead 세션의 중복 없음·동일 ID 유지 재확인. 알려진 세션 삭제/교체,
  Agent 선택 변경·충돌·미지원 Host에서는 임의 재생성이나 create/list 우회 금지.
- pause 신규 실행 차단, stop 신규 차단·관리 실행 취소, resume 신규 허용.
- 중단 뒤 실제 관리 프로세스 종료 관찰, 늦게 도착한 결과, 취소 작업 자동 부활 금지.
- 현재 사용자·Plugin·Workspace·Agent/session/run 소유권과 권한 회수.
- 다른 Workspace/Plugin/Agent 설정·기록 보존, 동시 실행의 경계 유지.
- 페이지별 대화 저장·조회 한계, 결과 누락/오류/초과 크기, 실패 뒤 기존 기록 보존.
- 창 닫기와 실행 중단 구분. UI에 연결됨/실행 중/완료/실패/취소/미확인을 정직하게 표시.

실제 provider가 응답을 잃었거나 취소를 지원하지 않는 경우 이를 성공/미실행으로 추정하지
않는다. 알려진 상태와 기술적 한계를 표시하고 자동 재전송으로 비용을 중복 발생시키지 않는다.

## 보호 및 Preview 활성화 조건

생성된 미검증 Plugin·스크립트·의존성을 실제 사용자 데이터로 실행하지 않는다.
Preview는 Builder 전용이 아닌 선택형 공통 개발 기능이며 별도 Workspace/데이터/권한을 쓴다.
파일 최대 범위는 Source/cwd와 다르며 CLI·script·자식 프로세스까지 집행해야 한다.
전체 파일 허용 상태라도 Vault 비밀 원문은 보호해야 한다.
Electron renderer sandbox/context isolation, DPAPI, Job Object 또는 API 경로 검사만으로
OS 파일 격리를 입증했다고 쓰지 않는다. 미지원 경로는 보호 모드에서 거부한다.
기존 신뢰 실행을 한시 유지하는 정책은 명시적 선택이며 보호 모드의 우회가 아니다.

## Core와 Builder의 분담

Core는 인증, Workspace/Host/Node, 일반 세션·실행·결과·저장·권한·중단·복구를 제공한다.
Lead/CTO/Dev/QA 역할, 업무 배정·승인, 공유 기억의 내용·선별 및 품질 평가는 Builder에 둔다.
Core가 업무 성공을 판단하거나 Builder의 세 Lead 구조를 모든 Plugin에 강제하지 않는다.
대화 페이지 저장 방식과 공통 저장 API는 기존 계약을 재사용하고 별도 DB/범용 큐부터 만들지 않는다.

## 병행 및 후속 범위

병행 가능: Builder UI 오류/진행/취소 표시, 문서 화면, 결정된 계약의 회귀 테스트와 문서.
선행 계약에 의존하는 구현은 계약 확인 뒤 연결한다. 같은 파일·lockfile 동시 수정은 피한다.

이 장기목표의 첫 완료 지점 이후 별도 계획: 공유 Lead 기억 전체, CTO·Dev/QA 위임,
Graph/Revision·업무 승인, GitHub Actions/Self-hosted Runner 및 전체 v15 납품 흐름.
Marketplace 공개 유통·내장 원격 연결·상세 자원 통계·외부 오류 집계는 후속이다.
G는 해당 기능 활성화의 안전 게이트이며 전체 Preview 개발을 F 이전의 필수 작업으로
확대하지 않는다. Lead 대화 시험도 미검증 코드 실행이나 비밀 노출 우회를 허용하지 않는다.

Stable에는 별도로 서명 설치본, 전체 회귀·CI, Identity 운영 상태, 업데이트/복구 및
정확한 동일 후보 두 PC 증거가 필요하다. 이를 Builder 개발 시작 조건과 혼동하지 않는다.

## 진행과 증거

총괄은 설계·보안·통합·최종 검수를 맡고 독립적인 단순 구현/시험/문서는 Luna high에 분담한다.
한도 발생 시 완료 범위와 남은 작업을 보존하며 계정/모델 우회·실패 무한 반복은 하지 않는다.
설치본·DEV·Vault·원본 dirty checkout·외부 프로젝트·Production은 보존한다.
실제 계정/원격 컴퓨터/방화벽/관리자 변경이 필요한 시험은 범위를 따로 확인한다.
새 제품 결정이나 안전 정책 변경이 생기면 사용자에게 묻고, 그렇지 않으면 승인된 범위 안에서 진행한다.

각 증거에 Source/Core/SDK/Builder revision, 실행 명령, 실제 결과·실패·미실행을 남긴다.
설계 문서용 HEAD, 실제 의존성 pin, 시험한 runtime revision을 구분한다.
구현, 자동 검사, 실제 앱, 실제 AI, 실기기와 출시 자격을 각각 구분한다.
GitHub에는 검증한 변경을 커밋·푸시하되 merge/tag/release나 사용자 권한 자동 승인을 하지 않는다.

공식 참고: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security),
[Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc).
참고 문서는 SPS 계약이나 OS 보호의 완료 증거가 아니다.
