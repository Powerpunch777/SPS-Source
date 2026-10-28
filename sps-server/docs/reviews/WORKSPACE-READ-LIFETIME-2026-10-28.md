# Workspace 목록 조회의 수명과 기존 검증 복구

기존 Desktop의 팀·프로젝트 조회와 연결 버튼을 보완하는 범위다. 새 Workspace
제품 기능·Native 연결·Builder 구조는 추가하지 않는다. Core/SDK 확장 계약과
권한·키/계정 저장 형식을 유지한다.

## 실제 결함과 변경

Main의 팀·프로젝트 목록 조회는 네트워크 응답을 기다린 뒤 현재 `state.profile`과
계정에 결과를 적용했다. 계정이나 선택 Workspace가 바뀌면 이전 목록을 새 연결에
저장하거나 기본 Workspace를 잘못 선택할 수 있었다. 같은 연결의 동시 조회도
늦은 이전 요청이 최신 결과를 덮을 수 있었다.

조회는 프로필 복사본, 계정 subject/session epoch, 팀 접근 상태를 캡처하고 단계
전후 및 저장 직전에 확인한다. 동일 목록의 요청 세대도 확인한다. 로컬 Owner Host
조회에는 manager·주소·시작 정보·명시적 Host 재시작 세대를 추가한다. Node 등록을
목록 조회의 선행 조건으로 만들지 않는다. 자신의 기본 Workspace 선택은 소유권을
확인한 뒤 snapshot에 반영하며, 준비 중인 동일 Host가 정상 ready가 되는 흐름은
유지한다. 오래된 조회에 새 연결의 목록을 반환하지 않는다.

내부 `ownerHostApi`에 선택적 조회 scope 확인을 추가해 Host 준비·세션 생성·응답
본문 완료 전후에 검사한다. 기존 mutating 호출의 승인·Origin·Desktop proof·쿠키
규칙은 유지한다. 이 조회 guard가 모든 Main 쓰기 작업의 수명을 보장하는 것은 아니다.

등록 함수가 private ticket 인자를 받도록 변경된 뒤 직접 IPC handler로 등록돼
Electron event를 ticket으로 오인하는 회귀도 확인했다. IPC adapter가 event를
내부 인자로 넘기지 않도록 수정한다. 함수 직접 호출 검사만으로 실제 IPC 배선의
정상 동작을 입증할 수 없으므로 해당 배선의 실행 검사를 별도로 둔다.

## 이전 CI와 기존 검증

Source `2c307b4` 자동 push `40684626508`과 PR `40684636013`은 모두 실패로
종료했다. 양쪽 Linux 전체 타입·빌드와 9개 test shard, Identity 22/24/26,
Kit/Registry·bundled plugins·Room은 통과했다. Desktop은 각각 `122803703409`와
`122803735119`의 `Test SPS Desktop invite and update flow`에서 실패해 실제
Windows E2E 단계는 실행되지 않았다.

4개 실패는 recovery 시작 함수 signature, 로그아웃의 guarded disconnect/save,
만료 token의 guarded save, Member Node metadata refresh 호출을 기존 정적
기대식이 인식하지 못한 것이었다. 함수 인자가 바뀌어도 초기 recovery 거부와 기존
로그아웃·알림·연결 보존·재등록 검증을 모두 유지하도록 기대식을 고쳤다. Owner Host
프로젝트 호출에 새 guard 인자가 추가된 기대식도 같은 endpoint·fallback·mapping·
저장 검증을 유지한다. 기존 검사를 지우거나 범위를 축소해 통과시킨 것이 아니다.

Core compatibility job의 별도 실패는 미승인 Zod High `1243066`이고 뒤 단계는
실행되지 않았다. 기존 Windows bootstrap·임시 데이터 정리 timeout도 해결됐다고
주장하지 않는다. 새 조합의 CI/실제 Windows 수용 결과는 별도로 확인해야 한다.

## 집중 검증 결과

root는 변경과 인접 회귀에 해당하는 7개 파일만 선택해 실행했고 **85개 모두
통과**했다. 새 조회 수명 13개, 실제 IPC 경계 5개, 기존 Node 연결·poll·계정 및
contract 67개를 포함한다. 앞선 개별 실행과 겹치므로 별도 합산하지 않는다.

```text
node --test sps-server/desktop/test/workspace-auth-ipc-lifecycle.test.mjs sps-server/desktop/test/workspace-read-lifecycle.test.mjs sps-server/desktop/test/node-connection-lifecycle.test.mjs sps-server/desktop/test/node-command-poller.test.mjs sps-server/desktop/test/desktop-account-controller.test.mjs sps-server/desktop/test/core-settings-main-contract.test.mjs sps-server/desktop/test/preload-contract.test.mjs
```

VM/DI는 원본 Main의 실제 조회 함수·IPC handler·등록 문장을 실행한다. 정상 목록,
같은 계정 새 session, 늦은 A 응답과 교체 B 상태, 최신 요청 저장 우선, Owner Host
초기 ready 전환/재시작과 회사 선택 변경을 검사한다. 오래된 호출에 B 목록을
반환하지 않는 것도 확인한다. 연결 IPC에 event/renderer 인자를 줘도 내부 등록
함수에는 인자가 전달되지 않는다. start-auth/poll-auth는 자신의 기본 Workspace
선택을 유지하고 지연 응답 뒤 다른 연결의 화면을 열지 않는다.

중간 검사에서 VM realm이 다른 빈 배열을 직접 deep equality로 비교한 새 테스트
1개가 실패했다. 배열 여부/길이와 새 데이터 미포함을 검증하도록 고친 후 최종
실행이 통과했다. 제품 성공 기준이나 기존 보안 검사를 줄인 변경은 아니다.
구문·diff 검사 및 새 Core pin의 candidate 문서 검사 4개도 통과했다.

VM·정적 검사는 실제 Electron·원격 Host·Windows ACL·물리 Runner 검증이 아니다.
전체 suite·실제 Desktop E2E·설치/업데이트를 반복하지 않았다. Core 중복 배정 수정의
실제 임시 DB 검사 1개와 서버 타입 검사 결과는 별도 리뷰에 기록한다.

## 한계

출력 없는 Runner 명령의 자동 재배정 제거는 별도 Core 변경으로
[실제 임시 DB 검증](RUNNER-SILENT-CLAIM-2026-10-28.md)을 기록했다. 목록 조회의
scope 폐기는 원격 작업 취소나 종료 증거가 아니다. 영속 완료 receipt, claim 세대
복구, Plugin 자손 관리, 패키지 crash recovery, 실제 설치·업데이트·복원은 남아 있다.
전체 로컬 suite를 반복하지 않고 변경에 직접 관련된 검사를 사용한다.

별도 read-only 검토에서 Source/project-share grant/revoke/create/rename/remove의
비동기 상태 변경 경로는 이 조회 guard를 넘기지 않는 것을 확인했다. 예를 들어
`grantHostWorkspaceSourceToNode`는 Source 상태 요청을 기다린 뒤 로컬 Windows
SMB 권한·자격 저장·Core 요청을 수행한다. 도중 계정/Host가 바뀌는 경합의 실제
재현 검사는 아직 없으며 이번 조회 검사로 해당 mutation을 완료 처리하지 않는다.
후속 구현은 단계별 소유권 확인과 이미 처리된 원격/로컬 변경의 사실에 맞는 복구를
함께 다뤄야 한다. 여기서는 실제 공유·ACL·고객 자격을 변경하지 않았다.
