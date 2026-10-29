# 재시작 뒤 Host Plugin 초기 준비 경합 — 2026-10-29

## 실제 CI 관찰

Source `704f860` / Core `9c5bf8b3`의 push `40734089733` Desktop
`122977829475`와 PR `40734097161` Desktop `122977861987`은 모두 No-AI
Workspace E2E의 `workspace_restart`에서 체크리스트 로드를 기다리다 실패했다.
화면은 체크리스트를 불러올 수 없다고 표시했으며 `checklistReady:false`였다.
이전 후보의 Plugin 설치 400은 이 두 실행에서 재현되지 않았고 그 뒤 시나리오로
진행했다. 이것만으로 이전 400의 내부 원인을 확정하지 않는다.

두 실행 모두 Core 전체 Linux 타입·빌드와 8개 shard는 통과했다. server 1/3만
실패했으며 실제 copier가 요구하는 `native-runtime`을 기존 Core fixture가 만들지
않아 ENOENT였다. 실제 source 자산은 존재한다. 별도 보안 gate 실패도 유지한다.
Windows의 종료·Job 정리는 정상 확인됐지만 이후 packaged 단계는 실행되지 않았다.

## 코드에서 확인한 경합

Core는 bundled Plugin 준비·갱신 뒤 `loader.loadAll()`을 detached chain으로 실행한다.
HTTP listen은 그 chain이 끝나기 전에 시작할 수 있다. 기존 Host Plugin data/action
route는 등록 전 Worker를 바로 호출하고, UI는 WORKER_UNAVAILABLE/TIMEOUT을
150ms·300ms 뒤 두 번 재시도한 후 오류를 유지한다. 첫 helper compile이나 초기
Worker 준비가 그보다 길면 UI가 영구 오류에 머물 수 있다.

이 흐름은 실제 코드로 재현 가능한 경합이며 CI 관찰과 일치한다. 다만 당시 log에는
실패한 bridge 응답의 code/status가 없으므로 해당 실행의 정확한 502 원인을 직접
확인한 것은 아니다. 수정 후 실제 CI를 별도로 확인해야 한다.

## 제품 보완

- App이 non-recovery startup callback 안에서 bundled 준비를 시작하기 전에
  내부 `prepareInitialLoad()`로 대기를 동기 설정한다. `loadAll()`에서만 설정하면
  그 전의 비동기 bundled 준비 구간에 같은 경합이 남으므로 충분하지 않다.
- 첫 ready 목록이 알려지면 Plugin ID별 activation Promise를 등록하고 목록 대기를
  해제한다. Host data/action 호출은 해당 Plugin만 기다린 뒤 현재 manager를 호출한다.
  A가 준비됐으면 B의 느린 activation을 기다리지 않는다. 전체 HTTP 준비를 막거나
  UI/E2E timeout·재시도 횟수를 늘리지 않는다.
- 준비 실패는 finally에서 해제하고, 목록 query 실패도 대기자를 해제한다. settled
  task는 제거해 새 설치·수동 enable·복구를 과거 실패에 영구 묶지 않는다.
  초기 준비를 실행하지 않은 loader는 no-op이며 recovery mode의 차단은 유지한다.
- Host SSE는 준비 뒤 클라이언트 연결·현재 Worker·원래 캡처한 권한/정책/epoch를
  다시 확인하고 headers와 구독을 만든다. 실패하면 기존 고정 403/503을 사용한다.
  선언된 Workspace Worker의 별도 실행·권한 경로는 바꾸지 않는다.

기존 copier를 완화하지 않고 fixture에 `native-runtime`을 추가했다. 원래 nested·
hidden 파일·stale 교체 검사를 유지하며 실제 C# source와 JS transport의 복사 bytes도
확인한다. fixture 삭제 전 canonical 경로·부모·dev/ino/birthtimeNs를 확인한다.

No-AI fixture의 오류 DOM과 실패 snapshot에는 WORKER_UNAVAILABLE·TIMEOUT·OTHER
중 고정 코드만 추가한다. 원문 오류·경로·자격증명은 추가하지 않는다. 기존 UI 문구와
성공 조건은 그대로다. 이는 진단 보완이며 그 자체가 제품 결함 해결 증거는 아니다.

## 선택 증거와 한계

초기 준비 helper·실제 loader delayed-list 연결·Host bridge 대기·Workspace bypass·
Host SSE 대기/대기 중 권한 변경 선택은 4개 파일 **14개 통과·87개 미선택**이다.
초기 stub/working-directory/중간 변수 오류 실행은 수정 전 실패로 보존하며 통과
근거로 합산하지 않는다. No-AI 고정 코드의 실제 렌더 VM 검사와 기존 harness
계약 선택 **2개 통과**, fixture/Main JS 구문 검사가 통과했다.

전체 로컬 suite/build·Windows Electron E2E·설치·물리 Runner를 재실행하지 않았다.
새 후보의 CI 재시작 수용이 필요하며 기존 실패를 완료로 표시하지 않는다.
