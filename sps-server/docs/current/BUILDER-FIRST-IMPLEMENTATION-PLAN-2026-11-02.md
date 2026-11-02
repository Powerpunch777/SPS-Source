# 첫 번째 목표: Builder 완성

2026-11-02 최신 사용자 지시: 첫 목표를 Builder 완성으로 바꾸고, 안전한 완성에 필요한
선행 기반이 있으면 먼저 보완한다. 앞선 문서 전용 중단 지시는 이 범위의 구현 재개 요청으로
바뀌었다. Marketplace·Preview·자체 LAN 개발·추가 시험 보류는 유지한다.

## 완료 기준과 소유권

- Builder의 업무·기능·화면은 별도 [SPS-MY-PluginBuilder](https://github.com/Powerpunch777/SPS-MY-PluginBuilder)
  레포의 통합 설계 v15, UI v9 및 최신 적용 기준을 따른다.
- 전체 AC-01–118 대조는 그 레포의 `docs/implementation/BUILDER-V15-COMPLETION-PLAN-2026-11-02.md`를 따른다.
  단순 채팅 성공이나 Core 선행 계약 완료를 Builder 완성으로 바꾸지 않는다.
- 최신 사용자 보류 결정은 과거 설계의 관련 요구보다 우선한다. Preview가 포함된 AC는
  그 부분을 보류·미완료로 구분하고, 나머지 기능의 구현·검증을 포기하지 않는다.
- Core는 공통 실행·저장·권한·취소·복구만 제공한다. Lead/CTO/Worker, 공유 기억의 의미,
  Graph·명세·업무 승인·품질 판단은 Builder에 남긴다.
- 전체 Core/Stable 출하를 Builder 착수 조건으로 만들지 않는다. 단, 안전하게 지원할 수
  없는 기능은 실행하지 않고 미지원/미연결 상태를 표시한다.

## 필요한 선행 작업만 고르기

| 순서 | 선행 항목 | 필요한 이유 | 범위 제한 |
| --- | --- | --- | --- |
| 1 | 작성 충돌과 내구 저장 | 여러 AI 세션·비동기 결과·재시작이 같은 명세나 상태를 덮어쓰지 않아야 함 | 기존 Plugin KV와 DB 키 재사용. 일반 조건부 저장 계약 검토. Builder 역할을 DB 모델에 넣지 않음 |
| 2 | 호출자·역할·Workspace 경계 | 사용자 UI 입력을 Lead의 실제 도구 실행으로 오인하지 않아야 함 | Core는 기술 호출자/권한, Builder는 Lead/CTO 권한과 revision 검사 |
| 3 | 실행·취소·복구 연결 | 실행 ID와 실제 상태를 보존하고 미확인 요청을 재전송하지 않아야 함 | 이미 기록된 durable session/dispatch 및 공개 SDK 재사용. 새로운 AI 실행기 금지 |
| 4 | 독립 설정·오류 복구 | Builder가 고장 나도 중단/비활성화 및 복구에 접근할 수 있어야 함 | 기존 Core 기능의 빈칸만. 자체 LAN이나 새로운 업무 관리 기능은 제외 |
| 5 | 코드 실행·자격증명 경계 | 생성 코드가 실제 사용자 파일·Vault·다른 고객 자료에 접근하지 못해야 함 | 지원 경로만 활성화. OS 보호가 미입증인 경로를 안전하다고 표시하거나 자동 허용하지 않음 |

각 항목은 현재 구현을 먼저 대조한다. 이미 충분한 계약은 새로 만들지 않는다.
독립적으로 안전한 Builder 데이터·질문·명세·UI 작업은 계약 확정 후 병행한다.

## Builder 구현 순서

1. 기존 실제 Lead 대화와 분할 기록을 유지하면서 상담 자료·요구사항·질문·명세 기록을 완성한다.
2. Lead만 변경하는 Graph/계약과 불변 Revision, 충돌 검증, UI 갱신을 연결한다.
3. 레포 설계에 따른 공유 Lead 기억, 프로젝트별 CTO, 독립 Worker/QA와 Task Packet을 구현한다.
4. 승인된 실제 GitHub/Codex/Runner 계약을 재사용해 실행·검증 근거·변경 전파·납품을 연결한다.
5. 각 단계의 자동 검사와 실제 앱 흐름을 확인한다. 필요한 외부 계정·원격 PC·권한·실행 비용의
   변경은 별도 범위를 확인하고, 모의 결과를 실제 연동 성공이라고 표시하지 않는다.

Marketplace·Preview·자체 LAN은 이 순서에 끼워 넣지 않는다. v15 장기 원문과 과거 기록은
보존하되, 보류 기능의 구현을 Builder 안전 기반이나 완료 조건으로 몰래 되돌리지 않는다.

## 이번 착수의 확인 사실과 다음 구현

현재 Core Plugin KV는 단일 행 upsert와 복합 unique 키가 있지만, 공개 SDK에는
조건부 저장이나 다중 키 트랜잭션 계약이 없다. Builder의 로컬 serialize는 한 Worker 안의
호출 순서를 맞출 뿐 여러 작성자의 원자적 read-modify-write를 보장하지 않는다.
이는 지금 사용자 데이터 손상이 발생했다는 보고가 아니라 확장 전에 확인한 계약 공백이다.

우선 기존 테이블에서 기대 값이 맞을 때만 단일 키를 변경하는 내부 기반을 실제 PostgreSQL
경쟁 쓰기로 검증한다. 누락과 JSON null을 구분하고 다른 Plugin/Workspace 키를 침범하지
않아야 한다. 공개 SDK·권한 회수·실제 Builder 연결은 별도의 후속 단계이며 내부 함수나
단위 검사만으로 완성 처리하지 않는다. 업무 Revision 식별자는 Builder가 값에 포함한다.

### 첫 내부 저장 기반의 검증 기록

Core `d7d5a5a0d6a0b97ca875f684e2612954fc8d75fb`에서 기존 `plugin-state-store.ts`에
조건부 저장을 추가했다. 기존 get/set/delete/list와 DB schema/migration은 바꾸지 않았다.
공개 API/SDK에는 아직 연결하지 않았으므로 Builder에서 사용할 수 있다고 표시하지 않는다.

Node24/PATH24에서 다음을 실행했다.

```text
node node_modules/vitest/vitest.mjs run --project @paperclipai/server server/src/__tests__/sps-plugin-state-conditional-write.test.ts --reporter=verbose
node node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json
```

실제 임시 PostgreSQL의 두 독립 연결로 경쟁 생성/같은 기준 값 교체, instance null scope,
JSON null·false·0, JSONB 객체 비교, 전체 Plugin/scope 키 경계, 삭제 후 재생성 금지와
기존 쓰기 보존을 검사했다. 최초 실행에서 JSON null이 SQL NULL로 처리되는 실패를
확인해 새 조건부 저장의 JSONB 바인딩을 수정했다. 최종6/6, server 타입 검사 exit0이다.
테스트의 DB 정리 hook까지 정상 종료했으며 사용자 DEV/DB를 대상으로 하지 않았다.

이 검사는 내부 단일 키 저장 primitive의 근거다. 다중 키 transaction, 호출자/권한 회수
중 경합, public SDK, Builder 통합이나 실제 앱 완료 증거는 아니다. 다음은 필요한 공개
계약·권한 경계를 연결하고 Builder의 불변 revision 저장에 적용하는 단계다.

## 목표 등록 상태

사용자는 목표 교체와 작업 재개를 요청했다. 그러나 현재 목표 도구는 미완료인 기존 목표를
교체·수정할 수 없고 새 등록도 거부했다. 기존 목표를 허위 완료로 바꾸지 않았다.
따라서 이 문서의 첫 제품 목표와 도구에 남은 이전 paused 목표는 현재 불일치하며,
앱에서 기존 목표가 해제되면 위 범위로 새 목표를 등록해야 한다. 이 제한은 작업 내용을
이전의 좁은 선행 목표로 되돌리는 이유가 아니다.

기존 DEV·설치본·로그인·사용자 데이터는 보존한다. Private Core를 공개 Builder 레포로
복사하지 않으며 구현/자동 검사/실제 AI·앱/실기기·출시 자격을 나눠 기록한다.
