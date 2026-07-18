# Room 동적 도구 invocation scope 수정

## 증상

2026-07-13 Designer Room에서 다음 도구가 모두 `dynamic tool request failed`로 끝났다.

- `paperclip.list_workers`
- `paperclip.list_active_tasks`
- `paperclip.preview_task`

서버 로그에는 `agents.list`와 `issues.list`가 `missing, expired, or unknown invocation scope`를 참조했다는 실제 원인이 기록되어 있었다.

## 원인

Room 메시지 액션은 Codex 턴을 시작한 뒤 빠르게 반환한다. Codex가 나중에 동적 도구를 호출할 시점에는 원래 플러그인 액션의 invocation scope가 이미 만료되어 있다. 그런데 동적 도구 처리기가 해당 액션에 묶인 `ctx.agents`, `ctx.issues`, `ctx.projects`, `ctx.config`를 다시 사용하고 있었다.

## 수정

- Codex thread별 활성 컨텍스트에 회사, 프로젝트, Room, Agent, SPS API 주소와 Task 할당 설정을 저장한다.
- 액션 종료 후 들어오는 동적 도구 요청은 loopback으로 제한된 SPS REST API를 사용한다.
- Worker/Task/Workspace 조회, Task 생성과 갱신, 댓글, Task Room 문서 작업을 같은 전송 방식으로 통일했다.
- Task 조회 시 현재 회사, 프로젝트와 child Task Room 소속을 다시 검증한다.
- 전송 실패는 `paperclip_tool_request_failed`와 실제 HTTP 상태를 반환해 원인을 Room에서 확인할 수 있게 했다.

SPS 코어는 수정하지 않았다. 변경은 `local.room-chat` 플러그인에만 있어 SPS 업데이트 경로를 유지한다.

## 회귀 방지

`tests/test-task-room-tools.mjs`는 만료된 invocation scope를 강제로 주입한다. 이 상태에서도 다음 흐름이 loopback API만으로 성공해야 한다.

1. Worker 조회
2. 활성 Task 조회
3. 경로 충돌 미리보기
4. 충돌 차단 및 의존성 순서 확인
5. Task 생성과 Task Room 문서 초기화
6. Task 피드백 작성

HTTP 503도 일반 오류로 뭉개지지 않고 구조화된 진단으로 반환되는지 검사한다.

## 검증 및 배포

- `node tests/test-task-room-tools.mjs`: 통과
- `npm test`: 전체 Room Chat 플러그인 테스트 통과
- 실제 `127.0.0.1:3100` 읽기 전용 검증: Agent 9명, 활성 Task 0개, 충돌 0개 정상 응답
- `local.room-chat` 0.3.9 업그레이드 완료
- 플러그인 상태: `ready`, `healthy`

검증 중 Task나 프로젝트 파일은 생성하거나 수정하지 않았다. 기존 실패 댓글은 기록으로 남지만, 다음 Room 턴부터 수정된 경로를 사용한다.
