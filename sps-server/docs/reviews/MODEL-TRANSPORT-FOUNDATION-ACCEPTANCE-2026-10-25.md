# Host 내부 모델 전송 기반 검증

기준일: 2026-10-25 KST. 상태: Stage 3a 내부 transport/Secret 결속의 mock-first
소스 검증 통과. **공개 handle broker 또는 Direct API 제품 기능 완료가 아니다.**
Desktop 0.4.137 미출시 소스이며 설치된 앱·실제 키·유료 호출은 변경/사용하지 않았다.

## 구현 범위

Core에 세 개의 작은 모듈을 추가했다.

| 모듈 | 책임 / 한계 |
| --- | --- |
| sps-model-response | Responses 호환 텍스트/거절과 completed/incomplete, 검증된 보고 토큰만 투영. reasoning 원문·provider metadata/ID·annotation은 반환하지 않고 알 수 없는 tool 출력은 거부 |
| sps-model-transport | 고정된 Host endpoint/model에 한 번 요청. 크기/토큰/전체 timeout/인스턴스별 동시성 제한, 취소와 오류 정리. SDK/RPC/실행 grant가 아님 |
| sps-model-bound-transport | 기존 암호화 company Secret 및 Plugin instance binding을 재사용. 결과에는 키 원문을 반환하지 않으며 새 Secret 저장소를 만들지 않음 |

요청에는 store/stream/background false와 tool 비활성화를 명시한다. model 이름은
Host 설정이며 실제 유료 모델을 기본값으로 넣지 않았다. HTTPS 외에는 Host가
명시 opt-in한 숫자 loopback HTTP만 허용하고 HTTP localhost는 127.0.0.1로 고정한다.
자동 redirect/retry/backend fallback이나 session/도구 실행은 없다. 고정 HTTP
계약은 [OpenAI Responses create 공식 스키마](https://developers.openai.com/api/reference/resources/responses/methods/create)를
조회해 확인했다. 외부 SDK/소스 복사나 새 dependency/license 변경은 없다.

기존 Secret binding의 목적 경로는 sps.models.<connection-uuid>.apiKey이다.
Workspace, Plugin instance, 목적, binding ID, Secret scope/status와 사용 가능한
버전을 확인한다. selector와 material은 **한 SQL statement snapshot**으로 읽는다.
latest는 current만, 명시적 pin은 current/previous를 허용한다. 키 조회 후 다시
검사해 binding 삭제/재결속/latest rotation/버전 철회를 전송 전에 거부한다.
기존 Secret access event도 재사용하며 원문 키를 기록하지 않는다. 기존 감사 저장의
best-effort 의미를 강화한 것으로 주장하지 않는다. secrets.resolve RPC는 계속 차단된다.

전체 대기 시간에는 키 조회가 포함된다. timeout/cancel을 무시하는 조회/전송/정리는
완료될 때까지 인스턴스의 슬롯을 유지한다. 영구 pending이면 해당 transport는 busy로
남는다. 동시성×(최대 요청+최대 응답) 버퍼 합계는 8MiB 이하이며 응답은 고정 bounded
buffer로 읽는다. 이는 엄격한 JS heap/OS 제한이나 process-wide/distributed quota가
아니다. 취소/timeout 후 provider 작업·과금 중단도 증명하지 않는다.

미전송 오류와 외부 효과 unknown을 구분하고 provider body/URL/오류 cause는 노출하지
않는다. 정확한 키 echo는 거부한다. 승인된 악성 provider가 키를 변형/유출하는 상황,
키의 JS 메모리 소거 또는 외부 provider의 보관 정책 준수까지 보장하지는 않는다.
키는 Host 내부와 선택한 endpoint의 Bearer header에서만 사용한다. usage 미제공은
unknown이며 0/가격을 만들지 않는다. 기술적 completed는 업무 성공 판단이 아니다.

## 고정값과 실제 결과

| 항목 | 고정값 / 결과 |
| --- | --- |
| 시험 Source | fe5aec86dfea75ab2dc8176dbf4489cc229986e9 |
| Core | c022f52d07fdfd3b40111ce1a6be80f97e7fe563 |
| 공개 SDK | 3feb5c4289718857e068f482ad22a49f925c4ae1, package 0.11.0 미출시 추가분. 이번 SDK 소스 변경 없음 |
| Core 최종 통합 표적 | 13파일 192/192, 실패/skip 0. 새 기반과 기존 Runtime/Agent/Worker/Job/권한 회귀이며 full Core 전체는 아님 |
| 새 기반 집중 회차 | 5파일 110/110. 위 최종 192개와 중복되므로 합산하지 않음 |
| Desktop 전체 | 532/532, 실패/skip 0 |
| SDK 전체 | 166/166, 실패/skip 0 |
| 타입/빌드 | 최종 Core 30개 package typecheck, 서버 build와 compatibility boundary 통과 |
| 실제 source Electron | 기존 runtime-discovery superset 단일 연속 실행, 정상 종료·임시 Host/userData 정리 exit 0 통과 |

후속 Source 변경은 이 기록/계획뿐이다. 새 runtime/harness 변경 뒤 과거 결과를
새 tuple의 증거로 재사용하지 않는다. 최종 시험은 깨끗한 Source와 Core pin에서
수행했고 실제 앱 시험 중 Core build 산출물을 덮어쓰지 않았다.

### 구체적으로 확인한 것

1. 가짜 키를 기존 local_encrypted provider로 실제 격리 Postgres DB에 암호화 저장.
   기존 binding으로 해석한 키를 실제 로컬 HTTP mock의 Bearer header로 전송했다.
   prompt/반환값/Secret access event에는 키 원문이 없음을 확인했다.
2. 다른 Workspace/Plugin/connection/binding/목적과 모순된 foreign Secret 행,
   disabled/deleted/failed/revoked 버전 및 비정상 selector를 전송 전에 거부했다.
3. latest rotation과 명시적 이전 버전 pin을 구분했다. 조회 중 삭제/재결속/rotation/
   버전 철회, stale latest + previous 상태를 거부했다.
4. 실제 HTTP redirect와 잘린 body, 401/403/429/5xx, 네트워크 오류에 재요청하지
   않았다. 크기/UTF-8/JSON/출력 종류/토큰 검증, exact key echo 차단을 확인했다.
5. 미전송 취소, 전송 후 취소, hanging fetch/body/키 조회, 늦은 완료와 cleanup,
   pending 동안 busy 및 완료 후 슬롯 복원, 인스턴스별 한계와 총 버퍼 한도를 시험했다.
6. 기존 source Desktop의 No-AI UI/action/state/event/Workspace Job, A/B 및 capability
   거부, UI-less Worker, Host 재시작·데이터 보존·Native 복구와 Node/Agent 관측을
   다시 통과했다. 620/1000px 및 Native 캡처도 검토했다. 이 앱 시험은 새 모델 API를
   UI에서 호출한 것이 아니다. 새 전송 경로는 위 DB/HTTP 시험으로 별도 검증했다.

## 검토에서 고친 점

Luna gpt-6-luna/xhigh가 parser 구현 및 읽기 전용 검토를 맡고 총괄이 transport,
Secret 결속, 수정과 최종 검증을 수행했다. timeout 뒤 미완료 키 조회가 슬롯 밖에
남던 문제와 동시성×응답 크기의 메모리 조합을 보강했다. 두 번 읽은 최신 버전과
회전된 previous material이 섞일 수 있는 경계는 단일 SQL snapshot으로 바꿨다.
마지막 범위 검토에는 남은 지적이 없었다. 독립 GitHub 리뷰/출시 승인이 아니며,
delegation 도구에 Fast 강제 parameter가 없어 Fast 적용을 보증하지 않는다.

## 재현

Core의 최종 단일 표적 명령:

```powershell
pnpm exec vitest run server/src/__tests__/sps-model-response.test.ts server/src/__tests__/sps-model-transport.test.ts server/src/__tests__/sps-model-bound-transport.test.ts server/src/__tests__/plugin-secrets-handler.test.ts server/src/__tests__/sps-agent-execution-descriptor.test.ts packages/plugins/sdk/tests/host-client-factory.test.ts server/src/services/sps-node-execution.test.ts server/src/__tests__/plugin-agent-session-context.test.ts server/src/__tests__/sps-host-support.test.ts server/src/__tests__/plugin-worker-manager.test.ts server/src/__tests__/plugin-job-workspace-scheduler.test.ts server/src/__tests__/sps-runtime-connection.test.ts server/src/__tests__/sps-runtime-discovery.test.ts
pnpm -r typecheck
pnpm --filter @paperclipai/server build
pnpm check:sps-compat-boundary
```

SDK: external/sps-plugin-sdk에서 npm test. Desktop: sps-server/desktop에서:

```powershell
npm test
$env:SPS_DESKTOP_E2E_SOURCE = '1'
$env:SPS_DESKTOP_E2E_SCREENSHOT = Join-Path $PWD '.tmp-model-transport/acceptance.png'
npm run test:e2e:runtime-discovery
```

## 다음 단계와 롤백

connection UUID는 지금 내부 binding 목적 식별자일 뿐 endpoint/model의 영속 연결
레코드가 아니다. binding만으로 실행 권한이 되지 않는다. 현재 primitive를
Plugin/renderer가 호출하는 route/RPC/SDK/capability/Host-support/UI는 추가하지 않았다.
새 DB migration, 설치본 생성/교체, 고객/실제 키·유료/원격 PC/Gateway/OCE 호출도 없다.

Stage 3b에서 Host 소유의 durable connection/Plugin grant, 인증된 invocation과
활성화·capability, model 전용 실행 lane·중복 방지/기록/복구/사용량, 결과 전달 시
철회를 연결한다. 공개 호출마다 factory를 새로 만들어 limit를 우회하지 않는 수명주기가
필요하다. 최종 DB 확인과 네트워크 전송은 원자적이지 않고 이미 전송된 작업을
Secret 철회만으로 멈출 수 없다는 점도 그대로 유지한다.

전체 Core/Linux CI·최신 보안 감사·의존성 major 전환·Identity 운영·코드 서명·동일
서명본 두 PC·저장소 보호/독립 리뷰·production 보호 자격은 이 증거로 완료 처리하지
않는다. 사용자의 의존성/설치본 보류를 유지한다. 롤백은 새 내부 모듈과 Core/Source
pin을 함께 되돌리는 범위이며 기존 DB/Secret 저장값 변환이나 down migration은 없다.
