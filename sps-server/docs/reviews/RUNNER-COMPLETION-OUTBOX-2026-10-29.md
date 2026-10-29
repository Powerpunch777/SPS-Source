# Runner 완료 결과 보존과 패키지 저장 응답 유실 — 2026-10-29

Core 전체 완료 기록이 아니다. 정상적으로 종료를 확인한 Runner 결과를 Desktop
재시작 뒤에도 다시 전송할 수 있게 연결하고, DB 저장 응답 유실이 패키지 파일 삭제로
이어지는 결함을 보완한다. 실행 중 장애·분실한 claim 응답·새 claim generation 인계는
별도의 미완료 항목이다. Marketplace·Builder·OS 격리·Native 보류 정책은 유지한다.

## 완료 결과의 보관과 전달

`desktop-node/src/command-runner.mjs`의 선택적 `persistCompletion(payload)` hook은
프로세스와 소유 실행 묶음의 종료 확인 뒤 정상 결과를 만들자마자 호출한다. 출력
업로드를 기다리기 전이므로, 업로드 지연 동안 앱이 종료되어도 저장 성공한 최종
결과는 남는다. 실행 전 실패도 결과 전송 전에 저장한다. 종료 미확인 상태에서는
저장·완료 보고를 하지 않는다. hook을 전달하지 않는 기존 실행 계약은 유지한다.

Main은 Agent 명령·Plugin 실행 각각의 결과 전송기에 hook과 outbox를 연결한다.
실행기에 진입하기 전에 연결이 바뀐, 확실히 미시작인 claim의 실패 결과에도 같은
보관 경계를 쓴다. 실행기에 진입한 작업을 미시작으로 추정하지 않는다.

새 `desktop/src/node-completion-outbox.mjs`는 최종 완료 필드만 허용한다.
kind·원래 Hub URL·Node/명령 ID·계정 subject·공개키 지문에 결과를 묶고, 전체를
기존 Electron safeStorage로 암호화한다. 개인키·token·cookie·명령·환경은 outbox에
복사하지 않는다. 계정 전환·로그아웃에서 이전 키를 복구하거나 보존하는 새 정책도
추가하지 않는다. HTTPS 및 기존 Owner Host의 loopback HTTP만 허용한다.

암호문은 기존 identity-checked/serialized/fsynced 임시 파일 저장과 rename 경계를
통해 `encryptedNodeCompletionOutbox`에 기록한다. v13의 선택 필드로 추가하여
state version을 올리지 않으며 기존 자격증명을 변경하지 않는다. 이 저장 방식의
증거는 앱 프로세스 재시작 범위이고, 디렉터리·장치의 전원 손실 내구성이나 여러
프로세스의 동시 쓰기까지 증명한 것은 아니다.

각 전송 전 동일 결과라도 다시 저장 성공을 기다린다. 저장기가 메모리 slot을 바꾼
뒤 디스크 쓰기 오류를 반환할 수 있으므로 메모리 존재를 저장 성공으로 간주하지
않는다. 실패 뒤 다음 결과가 이전 결과를 지우지 않도록 매번 현재 slot을 읽는다.
계정·Hub·Node·공개키 지문이 현재 연결과 모두 같은 기록만 새 인증·서명으로
재전송한다. await 경계에서 연결 소유권을 다시 확인하며 실행 함수를 호출하지 않는다.

HTTP 성공만으로 기록을 삭제하지 않는다. 일반 완료는 Core 행의 ID·Node·최종 상태·
exitCode·signal·timedOut·error가 저장된 완료와 같아야 한다. 사용량 보고가 있으면
기존 Core usage receipt의 report와 run/Node scope도 일치해야 한다. 다르면 기록을
보존하고 이 연결의 새 claim을 중지한다.

정상 중지 시 Core는 상태·오류를 cancelled와 중지 사유로 바꿀 수 있다. 이 경우는
원래 Node 보고의 영속 `completionReceiptDigest`가 정확히 일치해야 차이를 허용한다.
digest는 버전·kind·Node/명령 ID·정규화한 원래 최종 보고의 canonical JSON을 SHA256한
값이다. Core는 실제 Node 완료 CAS가 성공할 때 상태·결과와 같은 UPDATE에 저장한다.
단순 대기 취소·관리상 실패에는 만들지 않고, terminal 재시도도 원래 저장된 digest를
그대로 반환한다. 따라서 cancelled라는 상태만으로 종료 보고를 받았다고 추정하지
않으며, 정상 취소가 다음 작업을 영구 차단하는 회귀도 피한다.

두 실행 테이블에 nullable text를 더하는 migration 0174를 사용한다. 과거 행에는
증거를 backfill하지 않으며 요청 필드는 바꾸지 않는다. 일반 완료의 과거 null/없는
digest는 기존 필드의 정확한 일치를 요구하고, digest가 있으면 일치해야 한다.
취소 상태 변환은 null/없는 digest로는 인정하지 않는다. 이전 키·다른 결과·불확실한
실행을 자동 복구하거나 실행을 재생하는 기능은 추가하지 않는다.

기록 64개, 결과당 64KiB, 평문 slot 2MiB·암호문 4MiB 한도를 두고, 손상·빈
암호문·알 수 없는 필드·복호화/저장 실패는 기존 기록을 버리지 않는다. claim 전에
읽기·용량을 확인한다. 이것은 여러 이전 연결의 실행 결과에 대한 영속 예약이나
실행 시작 저널이 아니므로, 실행 후 저장 실패의 모든 경우를 복구한다고 주장하지 않는다.

## Core 완료 경합

명령·Plugin 완료 UPDATE에 정확한 Node ID를 함께 제한한다. Plugin 완료 CAS가
0행이면 같은 run ID·Node ID로 재조회하고, 없거나 다른 Node로 바뀌었으면 404다.
이전 활성 객체나 undefined 200으로 완료를 인정하지 않는다. 기존 wire 응답·서명·
nonce·권한·Workspace epoch·중지 판단은 유지한다.

서명한 완료의 응답을 버리고 같은 backing 상태로 서비스를 새로 만든 뒤 새 nonce로
재시도하는 검사는 저장된 결과·부모 취소 receipt를 유지하며, 명령/부모 쓰기·audit·
afterCommit enqueue가 다시 발생하지 않음을 확인한다. 실제 SQL 잠금이나 DB 물리
동시성은 Drizzle형 메모리 DB 검사의 증명 범위에 포함하지 않는다.

## 패키지 저장 응답 유실

기존 설치는 `db.transaction()`이 resolve한 다음에만 committed를 설정했다.
실제 postgres-js는 callback이 끝난 뒤 COMMIT을 전송한다. 따라서 callback은
완료됐지만 COMMIT 응답이 유실되어 reject하면, 이미 DB가 참조하는 UUID stage를
실패 정리에서 삭제할 수 있었다.

이제 transaction callback의 마지막에서 COMMIT이 시도될 수 있음을 표시한다.
그 전의 검증·callback 실패는 기존처럼 전용 stage를 정리한다. 이후의 불확실한
실패나 catalog finalizer 실패는 정확한 artifact를 보존하고 오류를 전달한다.
직접 loader upgrade의 단일 autocommit UPDATE도 reject가 미저장을 증명하지
못하므로 쓰기 시도 뒤 stage를 삭제하지 않는다. 쓰기 전 capability 승인 거절은
기존대로 정리한다. 자동 재실행·성공 변환·임의 rollback은 추가하지 않는다.

이 판단은 설치된 Drizzle postgres-js session과 postgres.begin의 실제 callback→
COMMIT 순서를 읽어 확인했다. 알려진 미저장 실패에서도 후보가 남을 수 있다.
영속 package 작업 저널과 orphan artifact 회수는 여전히 필요하다.

## 선택 검증

- 최종 Core 관련 8개 파일 **45개 통과**: 설치·prepare upgrade·Workspace install fence·
  기존 lifecycle rollback·서명 완료 경합/응답 유실·digest golden vector·초기 준비·자산 복사.
  제품 입력 hash 전후 동일.
  callback 완료 후 reject여도 DB가 참조할 수 있는 파일이 남고, callback 이전
  거절과 capability 승인 거절의 기존 정리는 유지됨을 확인한다.
- 최종 Core cached 서버 타입 검사 exit 0, TS 입력 hash 동일. DB 패키지 build와
  migration 번호·안전성 검사도 통과했다. 기존 baseline은 바꾸지 않았으며 generated
  snapshot을 이전 것과 구조 비교해 nullable 두 컬럼 외 schema 변경이 없음을 확인했다.
- 실제 새 소유 임시 PostgreSQL의 서명 owner route 선택 **1개 통과·30개 미선택**:
  새 migration이 적용된 DB에서 정상 완료와 cancelling→cancelled의 digest를 읽고,
  서비스 App을 다시 만들어 새 nonce로 재전송해 같은 행·digest·updatedAt을 확인했다.
  기존 출력 순서·오래된 claim 무재배정 검사도 유지했다. 테스트 전용 DB만 사용했고
  기존/고객 DB에는 migration을 실행하지 않았다.
- Source 최종 관련 4개 파일 **48개 통과·2개 환경상 건너뜀·실패 0**: Main 실제 poll 함수
  VM 실행, outbox restart/ACK/계정·키 격리, state 저장·손상 보존, 실제 Node child의
  종료 후 출력 대기 전 hook 호출. 두 skip은 기존 파일 symlink 생성 EPERM이며
  디렉터리 junction 검사는 통과했다. Core가 다른 최종 결과를 반환하면 Main도
  기록을 남기고 새 claim을 멈추는 검사까지 포함한다. 제품 Source hash가 동일했다.
  test codec은 주입형이며 실제 DPAPI 검증이 아니다.
- 실제 Core digest helper와 실제 Desktop outbox를 연결한 두 kind의 취소 영수증이
  일치했다. Core에 고정 golden vector도 남겼다. 임의 취소 상태나 잘못된 digest는
  ACK로 인정하지 않고, 올바른 digest의 정상 취소는 기록을 정리해 다음 poll을 막지 않는다.
- 기존 인접 7개 파일 **33개 통과**, 제품 Source hash 동일: Runner 연결 수명·제한·
  사용량과 출력 실패, 계정 연결, poll 우선순위, 종료/drain 계약. 겹친 실행 수를
  합산한 전체 suite 통과 수로 제시하지 않는다.

전체 로컬 suite/build·물리 Runner·실제 설치/업데이트·Electron 재시작으로
outbox를 수용한 증거는 아직 없다. 이번 코드는 새 후보의 실제 CI 확인이 필요하다.

## 남은 복구 범위

프로세스가 실행 중 사라지거나 결과 저장 전에 디스크 실패가 나면 이 outbox에
확정 결과가 없을 수 있다. claim 응답 자체가 유실되어 ID를 받지 못한 경우,
기존 키가 교체·폐기된 경우, Core의 다른 최종 상태와 맞지 않는 경우도 자동 해결하지
않는다. 영속 claim/실행 시작 저널·attempt generation·권한 있는 복구·보류 결과의
명시적 확인 경로가 필요하다. 시간만으로 재배정·완료 처리하거나 알 수 없는 실행을
재생하지 않는다. 후속 작업을 빼고 Core가 완성됐다고 표시하지 않는다.

후속 [관리상 실패와 Node 종료 보고 분리](NODE-CLOSURE-AND-LATE-REPORTS-2026-10-29.md)는
0175의 별도 원본 보고 JSON을 추가하고, 권한 해제 뒤 늦은 종료 보고를 기존 관리
결과와 함께 보존한다. 종료 미확인 terminal 작업의 Workspace 삭제와 부모 취소
확인도 보강한다. 원래 계정·Node 권한과 실행 무재생 원칙은 유지한다.
