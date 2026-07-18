# Agy 전환과 한도 내구 실행

이 문서는 `02-final-operating-model-ko.md`의 실행 공급자와 한도 회복 계약을
현재 배포에 어떻게 적용했는지 기록한다.

## 역할별 주 실행 경로

| 역할 | 주 실행 경로 | 기본 모델 | 한도 시 처리 |
| --- | --- | --- | --- |
| Manager, Designer, CTO | Codex | `gpt-5.6-sol` | 같은 Room 요청을 Agy로 fallback |
| Code Worker | Agy | `gpt-5.6-luna` | 같은 Task를 30분 뒤 재시도 |
| Image Worker | Agy | `gpt-5.6-luna` | 같은 Task를 30분 뒤 재시도 |
| QA Worker | Agy | `gpt-5.6-luna` | 같은 Task를 30분 뒤 재시도 |
| Voice Worker | Agy | `gpt-5.6-luna` | 같은 Task를 30분 뒤 재시도 |
| Document Worker | Agy | `gpt-5.6-luna` | 같은 Task를 30분 뒤 재시도 |

모델은 운영 중 바꿀 수 있지만 Room과 Task의 역할 계약은 모델과 분리한다.

## Worker Task

1. Agy adapter가 공급자 한도를 감지하면 SPS 표준 `provider_quota` 오류와
   `retryNotBefore`를 반환한다.
2. SPS 코어가 같은 Task의 초기 재시도를 예약한다.
3. 코어의 제한된 자동 재시도가 끝나도 Room 플러그인 watchdog이 같은 Task,
   담당 Worker와 Task Room state를 보존하고 30분 간격으로 계속 재시도한다.
4. 이 과정에서 Task를 복제하거나 다른 Worker에게 재배정하지 않고, Worker를
   pause하지 않으며, 소유 Agent에게 승인 요청을 만들지 않는다.
5. 비한도 오류는 기존처럼 blocker 보고, Task 소유 Agent 깨움과 검토 절차를 따른다.

## 관리 Agent Room

1. Manager, Designer 또는 CTO Room은 매 요청에서 Codex를 먼저 사용한다.
2. Codex가 quota 오류를 반환하면 같은 durable Room Job이 Agy로 이어진다.
3. Agy의 SPS 작업 요청은 자유 REST 호출이 아니라 제한된 JSON tool protocol로
   해석되고 기존 `handleCodexServerRequest` 권한 경로를 통과한다.
4. Agy도 quota에 도달하면 Room Job은 queued 상태로 남고 30분 뒤 다시 실행된다.
5. 다음 사용자의 새 Room 요청은 다시 Codex를 먼저 시도한다. fallback은 Agent의
   영구 설정을 바꾸지 않는다.

## 재시작과 업데이트

- Room과 Task quota 상태, 다음 재시도 시각은 SPS 문서에 저장한다.
- 시작 시 queued Room Job과 quota-hold Task를 재조정해 도래한 작업만 실행한다.
- `scripts/Apply-SPSAgyQuotaCompatibility.ps1`가 설치된 외부 Agy adapter에
  필요한 작은 호환 패치를 검증하고 idempotent하게 적용한다.
- `scripts/Start-SPS.ps1`가 서버 시작 전에 이 검증을 수행하므로
  SPS이나 adapter 업데이트 뒤에도 누락을 탐지할 수 있다.
- Worker와 관리 Room fallback의 Agy print 대기는 기본 5분 대신 2시간으로
  동기화한다. Unity 빌드·QA처럼 정상적으로 오래 걸리는 한 번의 실행을 CLI가
  중간 종료하지 않게 하고, 실제 종료 뒤의 재개는 durable retry가 담당한다.

## 검증 기준

- Agy quota가 Worker pause나 일반 runtime failure로 오분류되지 않는다.
- Task의 `automaticRetry`가 활성화되고 동일 Task/담당자를 보존한다.
- Codex quota fallback에서도 Room Task 생성·피드백 권한이 넓어지지 않는다.
- Codex와 Agy가 모두 quota일 때 사용자 재전송 없이 30분 재시도 상태가 남는다.
- 재시작 후 플러그인 health와 Workplane readiness가 정상이어야 한다.

현재 배포 버전은 Room Chat plugin `0.3.47`이며 관련 회귀 테스트와 시작 준비도
검사를 통과했다.
