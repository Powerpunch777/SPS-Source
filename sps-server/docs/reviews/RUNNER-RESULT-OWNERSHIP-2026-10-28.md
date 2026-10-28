# Runner 결과와 연결 소유권 보완

범위: 기존 Desktop Runner 실행의 실제 결함 수정. Runner는 실행 컴퓨터이며
Agent/Target과 구분한다. 새 Native 연결·Builder·공개 Marketplace·OS 샌드박스
개발은 포함하지 않는다. 기존 Node wire 계약과 Tailscale/SSH 방향은 유지한다.

## 실제 코드로 확인한 결함과 수정

`desktop-node/src/command-runner.mjs`는 실제 자식의 종료·소유한 프로세스 트리
종료 확인 후에도 출력 전송을 먼저 기다리고 나서 결과를 만들었다. 출력 POST가
실패하면 정상 종료한 작업도 fallback 실패로 보고할 수 있었다. 또 자식이 실행
중일 때 출력 promise가 거절되면 종료 시점까지 rejection handler가 없었다.

출력 queue의 각 tail을 즉시 관찰하되 원래 거절은 유지한다. 실제 종료 확인을
마친 뒤 결과를 먼저 보관하고 출력 전송을 기다린다. 전송 실패는 호출자에게
그대로 알리면서 Core에는 실제 실행 결과를 보고한다. 전송 실패를 실행 실패로
바꾸거나 작업을 다시 실행하지 않는다. 완료 POST 실패 시 기존 한 번의 재시도도
같은 결과 객체를 유지한다. 잃은 출력의 복구를 구현한 것은 아니다.

`desktop/src/main.mjs`의 기존 작업 poll은 await 뒤 바뀐 전역 연결 정보를 다시
읽었고, stop과 오래된 finally가 같은 boolean을 지웠다. 연결 해제·계정/프로필
변경 중 도착한 이전 claim이 새 연결 정보로 실행되거나 새 poll의 상태를 지울
가능성이 있었다.

`desktop/src/node-command-poller.mjs`에 세대와 정확한 ticket 소유권을 추가했다.
시작·정지는 세대를 바꾸며 finally는 자신의 ticket만 해제한다. 각 claim 전후에
현재 연결인지 확인하고, Main은 profile 복사본·Node·identity·계정과 access를
고정한다. 오래된 응답은 실행·새 상태 갱신·새 자격 정리에 쓰지 않는다. 멤버
제거 후 비동기 취소·저장 중 새 연결/poll이 시작되면 이전 정리를 계속하지 않는다.

Main이 넘기는 선택적 `assertCurrent`는 command runner의 기존 preflight·Source
준비 이후·spawn 직전 경계에서도 검사한다. 실행 중 lease의 전후 및 실패 경로에서
연결이 바뀌면 네트워크 장애의 60초 유예와 구별해 해당 작업만 종료한다. 기존
정확한 child/Job 종료 확인을 거쳐서만 완료를 보고한다. 이 callback은 private
Desktop 구성용이며 Plugin SDK 권한이나 원격 API가 아니다.

## 집중 검증

| 검사 | 결과와 한계 |
| --- | --- |
| command-runner usage + connection lifetime | 2개 파일 6개 통과. 출력 실패 시 실제 자식이 살아 있는 동안 완료 없음·unhandled rejection 없음, 종료 후 실제 성공 결과 보존. stale preflight는 spawn 없이 Source 정리. 실행 중 stale 연결은 해당 자식만 종료하고 다른 소유자 작업은 유지 |
| 기존 command limits + cancellation | 2개 파일 8개 통과. Windows에서 실제 기존 Job supervisor 경로로 timeout·ID 중복·동시 실행·정확한 취소·terminal PID 재사용 방지 검사. Native 이름의 기존 검사도 공통 실행 경로 회귀 검증이며 Native 개발 재개가 아님 |
| Desktop poller | 최종 7개 통과. 기존 우선순위, 늦은 claim, 오래된 finally, 새 poll의 cleanup 세대, Main 배선 확인. Main 배선 검사는 정적 검사이며 Electron 동작 증거가 아님 |
| syntax 및 diff | 변경 JS 구문 검사 및 diff 공백 검사 통과 |

새 connection-lifetime 검사의 termination DI는 실제 직접 자식의 close를 확인하는
테스트 도구다. 이 검사만으로 Windows descendant Job이나 전체 OS 격리를 주장하지
않는다. 기존 Job 경로 검증과 구분한다. 테스트 실패 정리는 정확한 소유권으로
cancel/join하며 발견한 PID를 추정 소유하여 종료하지 않는다.

전체 로컬 suite·Core 전체 타입검사·배포 build·실제 DB·Electron/packaged E2E·
물리 두 컴퓨터·설치/업데이트는 이번 수정으로 반복하지 않았다. Core/SDK 코드와
DB schema는 변경하지 않았다.

## 아직 해결하지 않은 복구 경계

Core `sps-node-operations.ts`의 signed completion은 terminal 상태에 멱등 응답하고,
현재 실행 세대와 cancellation을 확인한다. `cancelling` 명령/Plugin run은 Workspace
pending에 계속 포함한다. poll timeout이나 연결 손실을 근거로 행을 terminal로
바꾸고 pending을 없애면 실제 원격 종료 증거가 사라지므로 그렇게 수정하지 않는다.

현재 완료 POST는 메모리에서 한 번 즉시 재시도하고, 둘 다 실패하면 재시작 후
복구할 receipt가 없다. 영속 receipt는 미구현이다. 추후 정확한 Node·명령·claim
세대 및 실제 종료 증거에 결합하고, 현재 승인된 동일 identity로 새 nonce를 서명해
재전송하는 구조가 필요하다. claim 재배정 경합과 취소 세대를 검증해야 하므로
명령 ID만으로 과거 결과를 재전송하는 저장소를 먼저 만들지 않는다. 자격·키·원문
명령·stdout/stderr를 저장하거나 취소된 접근을 자동 복원해서도 안 된다.

Core 비정상 종료 시 Plugin 자손 정리, 패키지 crash recovery, 다중 Runner의
실제 운영 및 data-preserving 배포 검증도 남아 있다. Main의 등록·heartbeat 전체
비동기 경로의 연결 변경 경합은 이번 command poll fence와 별도로 점검해야 한다.

## 이전 후보 CI와 구분

Source `a5b00fc` / Core `115a05f1` 자동 push `40678487164`에서 전체 Linux
타입·빌드와 9개 shard, Identity 22/24/26, Kit/Registry, bundled plugins, Room은
통과했다. 보안 `122782852509` 및 PR의 `122782886449`는 Zod High `1243066`
미승인으로 실패했고 다른 2개는 Low다. 해당 compatibility job의 뒤 단계는
실행되지 않았다. 마지막 확인에서 Windows `122782852512`의 packaged Owner Host
runtime/Job 단계는 통과했고 Workspace execution control/restart 단계가 진행 중이다.
그 뒤 Workspace surfaces·preview·Host Plugin lifecycle E2E는 아직 대기 중이었다.
PR Windows `122782886338`도 진행 중이다.
이전 후보 결과는 이번 미포함 Runner 변경의 CI 통과 근거가 아니다.
