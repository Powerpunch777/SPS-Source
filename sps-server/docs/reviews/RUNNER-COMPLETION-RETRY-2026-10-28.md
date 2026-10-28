# Runner 명령 완료 재전송의 현재 상태 응답

Runner는 실제 실행 컴퓨터이며 기존 wire의 Node 명칭은 유지한다. 이 변경은
명령 완료 요청 경합의 응답만 보완하며 신규 Runner 구조·재배정·원격 종료 추정은
추가하지 않는다.

## 실제 결함

Core `sps-node-operations.ts`의 `command-complete`는 transaction 전에 명령을
읽고, Workspace 실행-control lock을 얻은 뒤 활성 상태인 행만 완료로 바꾼다.
같은 명령의 두 서명된 완료 요청이 활성 행을 읽으면 먼저 처리한 요청이 완료를
저장한다. 뒤 요청의 guarded UPDATE는 0행이지만 기존 코드는 transaction 전
`claimed` 또는 `running` 객체를 그대로 200 응답으로 반환했다. DB의 완료 상태와
재전송 응답이 달라 복구·재시도하는 Runner가 잘못된 활성 상태를 받는 결함이다.

기존 Plugin run 완료 경로에는 UPDATE가 0행일 때 현재 행을 다시 읽는 처리가
있다. 명령 경로도 동일한 원칙으로 보완하되 재조회는 정확한 명령 ID·Node ID를
같이 제한한다. 행이 사라졌다면 과거 활성 객체나 임의 성공을 반환하지 않고 기존
404로 거절한다. 실제 UPDATE에 성공한 요청만 기존 완료·부모 취소 효과를 수행하며
중복 요청은 그 효과를 재실행하지 않는다.

서명·nonce·Node/Workspace 권한·lease·완료 보고 계약, epoch와 중지 판단을
유지한다. pending 명령을 시간만으로 재배정하거나 실제 종료한 것으로 바꾸지 않는다.
DB 스키마·공개 SDK 응답 모양·Node 저장 형식은 변경하지 않는다.

## 검증 범위

Core `1ae22bd261e3f201d21432e981904e911b8abe76`으로 커밋·push했다. 새 서비스
집중 검사 2개가 통과했다. 실제 Ed25519 서명 생성·검증과 실제
`createSpsNodeOperations().invoke(command-complete)`를 실행하고, 제어한 Drizzle형
메모리 DB가 활성 사전 조회 이후 다른 완료가 저장되어 UPDATE가 0행이 되는
상황을 확정적으로 만든다. 현재 terminal 행 반환과 행이 사라진 경우 404, 재조회
횟수 및 이 loser 경로의 afterCommit 미호출을 확인했다. SQL 조건은 코드 검토로
명령·Node ID가 함께 제한되는 것을 확인했으며, mock 자체가 DB의 SQL 잠금이나
물리 동시 요청을 검증한다고 주장하지 않는다.

서버 cached 타입 검사 exit 0·서비스 입력 hash 동일, compatibility boundary와
diff 검사가 통과했다. 서버 tsconfig의 기존 제외 규칙에 따라 테스트 파일은 해당
타입 검사 대상이 아니며 실제 실행은 Vitest가 검증했다. 새 테스트의 첫 실행은
잘못된 config working directory로 수집하지 못했고, 올바른 server 디렉터리에서
실행한 뒤 fixture nonce가 기존 32자 규칙보다 짧은 것을 고쳤다. 제품 nonce 검사나
서명 규칙은 변경하지 않았다. 최종 2개 실행은 약 25초이며 실제 검사 본문은 71ms,
대부분 기존 서비스 import·변환이었다.

전체 suite·DB·네트워크·Electron·실물 Runner·배포 검사는 반복하지 않았다.
단순 Promise.all이나 기존 순차 재전송 검사를 실제 경합 재현으로 대신하지 않았다.

이 응답 보완은 영속 completion receipt, claim generation 인계, 실제 원격
프로세스 종료 증명 또는 비정상 종료 후 고아 claim 복구의 구현이 아니다. 그 기능은
계속 미완료다. [출력 없는 명령 재배정 방지](RUNNER-SILENT-CLAIM-2026-10-28.md)의
불확실한 실행을 자동 재생하지 않는 원칙을 유지한다.
