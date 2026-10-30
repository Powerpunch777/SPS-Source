# Workspace 격리 구현 상태 — 2026-10-28

후속 제품 정책: [Core 완성 정책](../current/CORE-COMPLETION-POLICY-ko.md)에 따라
완전한 비신뢰 OS 격리는 1차 Core 완료 조건에서 제외한다. 아래는 구현 한계의
기록이며, capability·grant·Secret·파일 API·프로세스 소유권·복구는 계속 필수다.

Workspace별 논리적 권한 격리와 전용 Plugin 프로세스의 기반은 구현되어 있다.
**신뢰할 수 없는 Plugin을 실행할 완전한 OS 격리와 Windows 출시 검증은 미완료다.**
현재 Native 추가 개발 보류는 유지하며 Core와 로컬 Desktop을 우선한다.

이 기록의 Core는 `c84922be6bd6f47e053088e52fe96dcda1bfedb6`, 공개 SDK는
`61a929f6c783f78e5af603682de1543c7e24abc0`(미출시 `0.11.0`), Desktop은
`0.4.137` development-candidate다. gitlink와 support matrix 및
[현재 조합](../current/CURRENT-CANDIDATE.md)을 함께 갱신한다.

## 적용 범위

| 구분 | 현재 동작 | 한계 |
| --- | --- | --- |
| 프로세스 | `workspaceWorker`를 선언한 Plugin은 Workspace·Plugin 조합마다 별도 프로세스와 서비스 어댑터를 사용 | 기존 Host Plugin에 자동 적용하지 않음 |
| 설정 | Workspace별 독립 설정, revision 충돌 검사, Host 관리와 권한 확인 | 일반 JSON 설정은 암호화된 자격증명 저장소가 아님 |
| Core 호출 | 현재 Workspace, 호출 수명, Plugin 권한 revision과 실행 epoch 확인 | 이미 외부에서 수행한 효과를 권한 철회로 되돌리지 않음 |
| 종료 | Workspace A의 전용 worker만 중지하고 B 및 기존 Host worker를 유지. 종료 미확인 시 자원 소유권 유지·교체 차단 | 실제 Windows Desktop의 최신 조합 수용 검증 필요 |
| 진행 메시지 | 로컬 SSE를 Plugin·채널·Workspace로 구분. 세션·소속·권한·실행 상태 재확인, 오래된 연결과 worker 세대 차단 | 영속 기록·재생 기능이나 Native 원격 스트림이 아님 |
| OS 접근 | Host와 같은 OS 계정으로 별도 프로세스 실행 | Windows 파일·네트워크·자격증명에 직접 접근하는 악성 코드를 막는 샌드박스는 미구현 |

Core 어댑터에서 SQL·HTTP·원시 secret API를 제공하지 않는 것만으로 OS 접근이
차단되지는 않는다. 모든 설치 Plugin을 이미 Workspace 격리했다고 설명하지 않는다.
제품 계약은 Core의 `doc/SPS-WORKSPACE-PLUGIN-WORKERS.md`를 따른다.

## 이번 로컬 Desktop 보완

- Core가 SDK의 `streams.open/emit/close` 알림을 로컬 SSE bridge와 연결한다.
  선언된 Workspace worker는 현재 UI/action 호출 안에서만 메시지를 보낸다.
  완료·취소·시간 초과는 해당 호출의 채널을 닫고 background 실행 권한을 만들지 않는다.
- 비동기 권한 검사 중 open·emit·close가 뒤섞이던 경합을 worker별 순서와 현재
  채널·호출 확인으로 보완한다. 종료된 worker의 알림은 새 worker로 전달하지 않는다.
- 메시지 크기·큐·채널·구독과 느린 클라이언트 대기를 제한한다. UI는 최신 128개만
  보관하며 Workspace 전환 전 연결의 늦은 응답을 무시한다.
- Core 종료는 worker가 아직 없는 대기 구독도 닫고 신규 구독을 막는다.
  종료 중 세션/DB를 다시 조회해야만 연결이 닫히는 구조를 피한다.

## 검증과 남은 일

아래는 각각의 선택 검사 결과이며 하나의 전체 검사 결과로 합치지 않는다.

- Workspace worker factory: 5개 통과. 기존 호출·정리·소유권 경로의 선택 검사다.
- 로컬 SSE 권한·종료 및 stream bus: 14개 통과. 실제 HTTP 응답 종료와
  owner 없는 대기 구독의 종료를 포함한다.
- UI bridge: 15개 통과. 이전 연결의 늦은 이벤트와 정상 마지막 메시지 보존을 포함한다.
- manager 최종 선택 검사: 2개 파일에서 4개 통과·26개 미선택. 비동기 메시지 순서,
  1,024개 큐 한도 초과, 이전 worker의 늦은 open 차단, exit 이후 stdio close 전
  도착한 정상 응답 보존을 확인했다. flood 검사는 임의 대기 대신 실제 응답 도착을 기다린다.
- UI 타입 검사와 최종 lifecycle 수정 후 서버 타입 검사가 모두 exit 0으로 통과했다.
  서버 검사 전후 변경 소스의 hash가 같았음을 확인했다. 전체 재귀 타입 검사는 아니다.
- compatibility boundary 검사는 통과했다.
- Source의 candidate 문서 생성·동기화 검사와 해당 선택 검사 4개가 통과했다.
- UI token gate는 실패했다. 기존 UI 파일의 color 79개, arbitrary value 36개,
  font-size 1개 위반을 보고했다. 이번 UI 변경은 `plugins/bridge.ts`와 검사 파일이며
  해당 token 위반 파일을 수정하지 않았다. 실패를 통과로 간주하지 않는다.

Source `1d16f36`의 이전 자동 CI에서는 전체 Linux 타입 검사·빌드와 Linux shard들이
통과했지만 보안·Windows 및 PR의 권한 테스트 시간 초과가 남았다. 그 결과는 이번
최신 조합의 전체 통과 증거가 아니다. 권한 경계 테스트는 첫 검사 내부의 cold import를
정적 import로 옮겼고 기존 시간 제한과 assertion을 유지했다. 해당 DB 검사는 로컬에서
반복하지 않았다.

다음에는 이 조합의 CI 결과, 실제 Windows 종료·재시작·복구, OS 격리,
선택적 실제 AI/CLI 실행, 설치·업데이트·데이터 보존을 각각 검증해야 한다.
Zod High `1243066`은 승인된 예외 없이 남아 있으며 major 전환 보류를 유지한다.
전체 로컬 검사·실제 DB·Electron·물리 Host/Member 및 서명 배포 검증은 이번에 실행하지 않았다.

Native의 미완료 항목과 재개 조건은
[Native 개발 보류 기록](../current/NATIVE-DEVELOPMENT-DEFERRED-ko.md)에 남긴다.
Marketplace 정책 변경과 Plugin Builder 구조 개편은 개발 범위에서 제외한다.
