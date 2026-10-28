# Node 연결과 계정 세션 수명 보완

범위는 기존 Tailscale/SSH Desktop Node 등록·heartbeat·연결 해제 및 계정 세션의
실제 경합 수정이다. 공개 Marketplace·Builder 신규 설계·Native 추가 개발·OS 격리
기능을 추가하지 않는다. Core/SDK 버전·계약·DB·키/계정 저장 형식은 유지한다.

## 확인한 결함과 구현

기존 Main 등록은 access·키 저장·CLI scan·원격 등록·heartbeat를 기다린 뒤 현재
전역 state를 다시 사용했다. heartbeat의 늦은 성공/403과 disconnect의 늦은 정리가
새 프로필/Node/키를 덮어쓰거나 지울 수 있었다. 작업 poll 세대는 매 poll마다
바뀌므로 연결 전체의 수명으로 사용할 수 없었다.

`desktop/src/node-connection-lifecycle.mjs`에 별도의 연결 세대와 정확한 ticket을
추가했다. Main은 프로필 복사본·Node·키·계정 subject·private session epoch를 묶어
비동기 단계 전후와 실제 저장 직전에 확인한다. 새 connect/disconnect 또는 스케줄
정지는 이전 연결의 미완료 요청을 무효화한다. 생성/보완한 자기 키와 새 Node ID는
기존 소유권을 확인한 뒤 동기적으로 binding을 갱신한다. 오래된 원격 등록 결과는
채택하지 않고 원격에 이미 생긴 Node를 추정 삭제하지 않는다.

정상 heartbeat와 작업 poll은 현재 연결 ticket을 사용한다. 늦은 provider 오류와
403은 새 연결의 상태나 자격을 바꾸지 않는다. revoke/Member 제거 정리는 취소를
기다린 뒤 정확한 기존 연결과 계정 epoch를 다시 확인한다. disconnect가 자기 키와
Node를 지운 뒤에도 별도의 owner 확인을 유지해, 같은 계정의 새 로그인 중 과거
파일 저장이 커밋되는 경합을 막는다. 계정 컨트롤러가 호출할 때와 직접 IPC로
호출할 때 모두 적용한다. 이는 작업의 실제 종료 확인을 대체하는 세대가 아니다.

`desktop-account-controller.mjs`의 기존 세션 생성·로그아웃은 token refresh 외의
여러 await 뒤 계정 변경을 확인하지 않았다. 취소할 수 없는 cookie set/remove가
새 계정의 cookie와 교차할 수도 있었다.

Core cookie 변경을 직렬화하고 계정 principal/epoch를 확인한다. 늦은 set이 이미
완료됐다면 같은 origin·루트 path·secure 속성·정확한 value의 자기 cookie만
제거한 뒤 새 작업을 허용한다. 제거 응답/재조회로 부재를 확인하지 못하면 고정
오류로 실패하며 정리 완료로 보고하지 않는다. queue의 한 실패가 이후 정상 계정의
세션 생성을 영구 차단하지 않는다. 이 보장은 Main이 소유한 cookie 작업의 조정이며
Chromium 전체나 다른 프로세스의 임의 cookie 변경에 대한 트랜잭션은 아니다.

로그아웃은 자신이 캡처한 계정 세대를 revoke/disconnect/cookie/저장/UI 단계마다
검증한다. 새 로그인이 시작되면 이전 로그아웃은 그 계정을 지우지 않는다. 초대
수락도 session 생성·POST·JSON 완료 뒤 세대를 검사한다. 서버에서 이미 처리된
수락은 재시도/삭제하지 않고 오래된 결과를 새 계정에 반환하지 않는다. 새 private
`currentSessionEpoch()`는 Main 내부 비교용이며 token 회전에는 바뀌지 않고 공개
status나 자격정보에 노출하지 않는다.

## 실제 검증

최종 root 실행:

```text
node --test sps-server/desktop/test/desktop-account-controller.test.mjs sps-server/desktop/test/node-connection-lifecycle.test.mjs sps-server/desktop/test/node-command-poller.test.mjs
```

3개 파일 37개 모두 통과했다. 계정 파일 18개, 연결/기존 poller 파일 합계 19개이며
앞선 에이전트 실행과 겹치므로 별도의 통과 수로 합산하지 않는다.

- 계정: 기존 token 회전·만료·기존 Host 호환성·초대·로그아웃 유지, 늦은 cookie set/
  enumeration/revoke/disconnect, 정리 미확인, 같은 계정의 epoch 및 늦은 초대 결과.
- 연결: 실제 Main의 `connectNode`, `sendNodeHeartbeat`, `disconnectCurrentNode`
  선언을 원본 파일에서 추출해 VM의 DI state/network/persist로 실행했다. 늦은
  등록, 같은 subject의 새 로그인 뒤 403, 취소/저장 중 교체 연결 보호와 정상 등록·
  heartbeat·disconnect 경로가 통과했다. helper 경합·정적 배선 검사와 구분한다.
- 리뷰 중 신규 Node ID를 state에 쓴 뒤 이전 binding을 검증하는 순서 회귀를
  발견했다. 이전 값을 확인한 다음 동기적으로 새 값을 채택하도록 수정하고 정상
  등록 검사를 추가한 후 최종 37개 실행이 통과했다.
- 변경 JS 구문·diff 검사 및 기존 candidate 문서 check가 통과했다.

VM/DI 검사는 실제 Main 함수 코드를 실행하지만 Electron cookie 저장소·실제 원격
Core·물리 두 컴퓨터·설치/업데이트 검증은 아니다. 전체 로컬 suite·Core 타입/빌드·
AppContainer·Native E2E를 반복하지 않았다. 실제 고객 자격·cookie·키를 조작하지 않았다.

## 남은 범위

영속 Runner completion receipt와 claim 세대 복구, Plugin 자손 종료, 패키지 crash
recovery, 실제 DB/Windows/Runner/데이터 보존 배포 수용은 계속 미완료다. 원격
side effect나 실제 프로세스 종료를 단순 timeout·로컬 ticket 폐기로 확정하지 않는다.

Main의 team-context/projects 등 모든 비동기 경로를 이 수정만으로 점검 완료했다고
하지 않는다. Core 완성 및 전체 보안/출시 통과 판정도 하지 않는다. 기존 Zod major
전환 보류와 미승인 High audit, 기존 UI token 문제의 기준은 약화하지 않았다.

## 이번 수정 전 CI에서 확정한 실패

Source `a5b00fc` push `40678487164`는 Linux 전체 타입·빌드와 9개 shard가
통과했지만 Windows `122782852512`의 packaged plugin preview `builder_tools`
assertion으로 실패했다. 로그는 원문 대신 hash를 기록하므로 정확한 assertion
값은 확인되지 않았다. 같은 Source의 PR `40678498351` / Windows `122782886338`은
No-AI 기능·Main exit 0 이후 `temporary_data` 정리가 약 20초의 한도를 넘었다.
`rm_start` 이후라는 사실만 확인했고 파일 수·특정 잠금이 원인이라고 단정하지 않는다.

Source `d2aa382` PR `40680650647` / Windows `122790203304`는 No-AI와 그 정리를
통과했지만 두 번째 prepared Native Host 검사 `bootstrap`에서 실패했다. 진단의
Settings API/준비된 identity 표식이 false였으나 원문 예외는 hash만 남아 있어
실제 원인은 조사 중이다. Native 추가 개발은 보류하되 이 기존 회귀를 완료 기준에서
제외하지 않는다. timeout·권한·정리·기존 검증을 낮추지 않는다.

각 실행의 별도 보안 실패는 같은 미승인 Zod High `1243066`이다. 관련 job의
후속 compatibility 단계는 실행되지 않았다. [공식 보안 권고](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)도
2026-10-28 확인에서 영향을 받는 범위를 `<4.6.6`, 수정 버전을 `4.6.6`으로 표기한다.
기존 v3 로컬 완화가 버전 기반 audit 통과나 승인 예외를 뜻하지 않는다.

`d2aa382` push `40680643345`는 마지막 확인에서 진행 중이고 Linux 전체 타입·빌드와
9개 shard는 통과했다. 이번 미포함 Node/계정 변경의 CI 증거로 재사용하지 않는다.
