# Node의 관리상 실패와 실제 종료 보고 분리 — 2026-10-29

## 확인된 결함

권한·공유 경로·Plugin Grant가 바뀌면 Core는 이미 claimed/running인 작업을
`failed`와 `finishedAt`으로 표시할 수 있다. 이 상태는 실행 권한을 회수한 결정이며
원격 프로세스가 종료됐다는 증거가 아니다. 그런데 기존 부모 취소 확인과 Workspace
pending 집계는 활성 상태만 검사해, 관리상 실패로 바뀐 형제 작업을 종료 확인에서
빠뜨릴 수 있었다. Workspace 삭제는 그 pending 집계를 최종 트랜잭션에서도 사용한다.

또한 해당 Node가 실제로 종료한 뒤 최종 결과를 보내도 기존 completion의 terminal
early return은 그 보고를 저장하지 않았다. Desktop outbox는 자신의 보고가 수신됐다는
증거를 받지 못해 같은 결과를 계속 보류할 수 있었다. 관리상 실패 사유를 Node의
실행 결과로 덮어쓰거나 terminal 상태만 보고 ACK하는 방식은 이 문제를 해결하지 못한다.

## 보고와 관리 결과 보존

실제 signed completion CAS는 기존 digest와 함께 정규화한 보고를
`completionReportJson`에 저장한다. 두 실행 테이블의 nullable JSONB 컬럼만 더하는
additive migration `0175_sps_node_completion_reports.sql`을 사용하며 0174는 유지한다.
요청·서명·nonce·SDK wire 계약을 바꾸지 않는다.

행이 이미 terminal이어도 원래 Node가 active이고 키가 검증됐으며 실제 claimedAt
또는 startedAt이 있는 경우, 기존 인증/서명 검증을 통과한 최종 보고를 별도로
기록할 수 있다. 정확한 Node·Workspace·작업을 잠금 아래 다시 확인한다. 보고 JSON이
NULL인 경우만 CAS하며 기존 digest가 있으면 같은 원본 보고일 때만 채운다.
다른 보고·기존 JSON·digest 불일치는 덮어쓰지 않는다. 행이 없거나 다른 Node에
소속되면 404이며 오래된 snapshot으로 성공을 만들지 않는다.

관리상 status·error·finishedAt은 보존한다. 실제 Node의 보고는 별도 JSON과 v1
digest로 확인한다. queued/unclaimed 작업이나 폐기된 Node의 키를 재승인하거나
작업 권한을 복원하지 않는다. 실행 자체를 다시 시작하지 않는다.

Desktop은 별도 JSON이 있으면 허용된 최종 필드만 검증하고, 저장해 둔 원본 보고와
JSON·digest·작업/Node ID가 모두 같을 때만 ACK한다. 이 경우 관리상 결과와 보고의
차이를 허용한다. partial JSON·잘못된 digest·다른 scope는 기록을 보존한다. JSON이
없는 0174의 digest-only 및 과거 정확한 결과 ACK 계약은 유지한다.

## 종료 증거와 삭제 보호

`hasSpsNodeClosureEvidence()`와 SQL 집계는 같은 경계를 사용한다.

- 상태가 succeeded/failed/cancelled 중 하나이고 finishedAt이 있어야 한다.
- claimedAt·startedAt 둘 다 없으면 Node에 배정되지 않은 terminal 작업으로 본다.
- 배정된 작업은 signed 보고 digest 또는 동일 부모의 기존 signed receipt가 필요하다.
- 과거 데이터에서 status=succeeded, non-null exitCode/signal, timedOut=1은 코드상
  signed completion만 기록한 결과다. finishedAt과 함께 해당 기존 완료 근거를 인정한다.
  failed/cancelled·finishedAt·timedOut=0만으로는 종료를 인정하지 않는다.

실제 writer를 조사하여 권한 해제·관리 실패 경로는 위 완료 전용 필드를 작성하지
않는 것을 확인했다. 과거 불확실한 행을 성공으로 backfill하지 않는다. 이 기준은
동일 OS 사용자 Node의 서명 보고를 신뢰하는 제품 경계이며 악성 Node의 OS 종료를
독립적으로 증명하는 보안 샌드박스는 아니다.

부모 취소는 정확한 Workspace·부모 ID에 소속된 모든 작업의 근거를 확인하고,
실제로 받은 보고만 부모 receipt에 더한다. pending→confirmed 전환에서만 기존
취소 효과를 요청하며 재전송으로 효과를 반복하지 않는다. 관리상 실패한 형제가
종료 보고를 아직 보내지 않았다면 pending을 유지한다.

Workspace pending 집계도 동일하게 미확인 terminal 작업을 포함한다. 다른
Workspace는 영향을 받지 않는다. 세션 조회는 과거 부모의 낙관적인 confirmed 표시가
있어도 현재 원격 근거가 부족하거나 기록된 로컬 프로세스가 살아 있으면 pending으로
보여 준다. 읽기 전용 생존 확인이며 알 수 없는 PID를 인수하거나 종료하지 않는다.

## 검증 경계

Core signed service 회귀에는 관리상 실패한 Agent/Plugin의 늦은 보고, 같은 보고의
멱등성, 서로 다른 보고 보존, 미배정·폐기 Node 거절, 부모 형제의 종료 근거,
잠금/조건부 쓰기 뒤 missing·reassigned 대상의 404가 포함된다. Drizzle형 메모리
DB 검사는 실제 SQL 잠금·네트워크 경합을 증명하지 않는다.

실제 임시 PostgreSQL에서는 권한 해제로 failed가 된 명령에 늦은 signed 보고를
보내 관리상 결과·끝 시각이 유지되는지, 원본 보고·digest가 남고 재시작한 서비스의
새 nonce 재전송이 같은 결과를 주는지 확인한다. 별도 Workspace 삭제 검사에서는
claimed/started-only의 미확인 실패는 pending, 과거 signed 완료는 종료로 구분한다.
고객/기존 DB에 migration을 실행하지 않으며 소유한 검사 DB만 사용한다.

최종 signed service 회귀 **19개 통과**, 종료 근거·삭제 guard 선택은 앞선 동일
helper 입력으로 **7개 통과**했다. Desktop outbox와 Main 선택 **25개 통과**이며
outbox 입력 hash가 같았다. 서로 겹치는 중간 실행을 합산하지 않는다.

최종 실제 임시 PostgreSQL 선택은 **3개 통과·35개 미선택**이다. 관리 실패 뒤의
signed 보고·service 재생성·멱등성, 세션의 과거 낙관적 confirmed 표시·실행 중인
로컬 PID의 읽기 전용 확인, 미확인 Node 작업의 Workspace 삭제 차단을 포함한다.
앞선 실행 1개는 기존 afterEach 정리의 10초 제한에 걸려 실패했다. 제한·성공 조건을
늘리거나 삭제하지 않고 같은 선택 검사만 다시 실행해 정리까지 통과했다. 다른
중간 실행 중 입력이 바뀐 타입/DB 실행은 최종 검증으로 사용하지 않는다.

DB 패키지 build와 migration 번호·안전성 검사가 통과했다. generated snapshot을
구조 비교해 0175는 nullable JSONB 두 컬럼 외 schema 변경이 없고 0174도 유지됨을
확인했다. 실제 Core digest helper와 Desktop outbox의 Agent/Plugin 두 종류를 연결해
별도 JSON 보고가 있는 관리상 실패 ACK도 확인했다. compatibility boundary·diff·
outbox JS 구문 검사가 통과했다.
최종 cached 서버 타입 검사도 exit 0이며 제품 TypeScript 입력 hash가 전후 같았다.
사용자의 중지 요청에 따라 현재 변경은 로컬 커밋으로 보관하고 push·새 CI는 재개 후
진행한다. 원격 PR/CI의 이전 후보와 이 로컬 후보를 구분한다.

전체 로컬 검사·배포 build·물리 Runner·설치/업데이트는 반복하지 않는다. 새로운
후보의 CI 통과가 필요하다. claim 응답 유실·실행 중 장애·attempt 인계와 기록된
프로세스의 영속 소유권 복구는 이번 구현에 포함되지 않는다.

## 이전 후보 CI

Source `45ac567` / Core `4d0b587b`의 push `40794257537` Desktop
`123186727090`과 PR `40794265220` Desktop `123186754283`은 모두 성공했다.
No-AI Workspace 재시작, packaged Host/Windows Job, packaged 재시작·Workspace
surfaces·Preview·Plugin 생명주기가 통과했다. 두 실행 모두 전체 Linux 타입·빌드와
9개 shard, Identity·Kit/Registry·bundled·Room이 통과했다. 별도 production dependency
보안 gate는 여전히 실패했으므로 전체 CI/출시 완료는 아니다. 이번 0175 변경의
검증 결과로 이전 후보의 성공을 재사용하지 않는다.
