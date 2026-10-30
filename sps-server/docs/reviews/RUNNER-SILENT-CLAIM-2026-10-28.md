# 출력 없는 Runner 명령의 중복 배정 방지

Core `2417d613e4157de036a71def8c12fc1cd56e6244`에 구현했다. Runner는 실제 실행
컴퓨터이며 Agent/Target과 구분한다. 기존 Node wire 명칭, SDK·DB 형식·서명/승인·
Workspace 권한 검사는 유지하고 Native 신규 기능은 구현하지 않았다.

## 실제 결함

`server/src/services/sps-node-operations.ts`의 기존 `claim-command`는 같은 Node의
`claimed` 행이 10분 이상 갱신되지 않았으면 다시 `queued`로 바꿨다. 하지만 실제
장시간 명령도 첫 출력 전에는 `claimed`에 머물며, 유효한 signed command lease는
이 timestamp를 갱신하지 않는다. 다른 poll이나 같은 Node의 재연결이 그 명령을
다시 배정받을 수 있었다. 기존 Desktop의 메모리 중복 ID 검사는 다른 프로세스나
재시작을 통틀어 이 가능성을 막지 않는다.

경과 시간은 실제 프로세스 종료 증거가 아니므로 시간에 따른 자동 재큐를 제거했다.
중립 Plugin run은 원래 같은 불확실 claim을 재배정하지 않았고 이번에 legacy Agent
명령도 그 기준에 맞췄다. 내부 `requeueStaleClaims` 필드는 기존 구성 호출과의
호환성을 위해 deprecated no-op으로 남겼다. 원격 작업을 임의 완료/실패 처리하거나
Workspace pending 수를 없애지 않는다.

## 집중 검증

기존 `sps-nodes-routes.test.ts`의 signed-owner 명령 검사에 추가했다. 새 명령을
배정받은 뒤 해당 행의 `claimedAt`·`startedAt`·`updatedAt`을 30분 전으로 만들고,
다음 signed claim이 204이며 원래 행은 미완료 `claimed`, 기존 signed lease는
active인지 확인한다. 이어 기존 순서 있는 출력과 성공 완료 검사를 그대로 수행한다.
기존 Plugin silent-claim 검사도 삭제하지 않았다.

```text
node ./node_modules/vitest/vitest.mjs run server/src/__tests__/sps-nodes-routes.test.ts -t "lets only the signed owner Node claim a command and return ordered output"
```

결과는 1개 통과·30개 미선택, 91.83초다. 해당 harness가 새 OS 임시 디렉터리와
할당 port의 embedded PostgreSQL을 만들고 migration한 뒤 정확한 인스턴스를 중지·
소유 경로만 정리하는 것을 확인했다. 외부 DB URL·기존 DB·고객 데이터는 사용하지
않았다. 단일 실제 DB route 검증이며 전체 Runner 통합 검사는 아니다.

root의 최종 cached 서버 타입 검사는 exit 0이며 대상 service hash가 전후 동일했다.
compatibility boundary와 diff 검사도 통과했다. 전체 suite·recursive build·물리
Runner·배포·설치/업데이트를 반복하지 않았다.

## 복구 한계

이 수정은 불확실한 작업의 자동 중복 실행을 막는다. 사라진 Runner의 프로세스 종료를
증명하거나 완료 보고를 복구하지 않는다. 명시적 ownership 이전에는 실제 종료 증거와
claim 세대 검증이 필요하다. 영속 completion receipt·분산 복구 프로토콜은 미완료다.
단순 timeout을 근거로 terminal 상태로 바꾸는 방식으로 그 결함을 숨기지 않는다.

Source의 Core gitlink·support matrix·생성 candidate를 이 Core와 기존 SDK 조합으로
맞추고 candidate 문서 검사 4개가 통과했다. 새 조합의 CI/Windows 결과는 별도다.
