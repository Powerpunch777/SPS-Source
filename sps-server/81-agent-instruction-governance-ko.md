# Agent Instructions 거버넌스

작성일: 2026-07-14

## 재작성 이유

기존 `AGENTS.md`는 회사 구조, 역할 설명, Worker 최종 보고, 런타임 복구 절차와 현재 상태 예외가 한 문서에 반복되어 있었다. 이 때문에 `Worker를 자동 재개하지 않는다`는 규칙이 `일시정지 Worker에게는 Task도 만들지 않는다`로 잘못 해석됐고, 모델이 바뀔 때마다 같은 흐름을 다르게 실행할 여지가 생겼다.

또한 지침은 Task 생성을 요구하지만 실제 `create_task` 도구는 paused Worker를 만나면 생성을 거절했다. 문서와 런타임이 서로 다른 계약을 가진 것이 직접 원인이었다.

## 작성 원칙

- `AGENTS.md`에는 오래 유지되는 구조, 권한, 책임, 중단 조건과 증거 기준만 둔다.
- 공통 규칙, 배정 방식, 전문 역할을 서로 다른 단일 원본으로 관리한다.
- 특정 모델, CLI, API 서비스 또는 현재 Agent 상태에 지침을 종속시키지 않는다.
- 현재 요청, Task 상태와 승인된 저장소 산출물이 오래된 체크포인트보다 우선한다.
- 긴 공급자별 절차는 Adapter 프롬프트나 Skill에 두고 역할 지침에서 반복하지 않는다.
- 권한, 상태 전이, 깨움, 중복 방지, 동시 실행과 인코딩은 런타임에서도 검사한다.

참고한 자료:

- OpenAI Codex AGENTS.md 가이드: https://developers.openai.com/codex/guides/agents-md
- OpenAI Codex 사용자 지침: https://developers.openai.com/codex/concepts/customization
- Anthropic Claude Code 메모리: https://docs.anthropic.com/en/docs/claude-code/memory
- Google Gemini CLI 구성: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md

## 새 구조

실제 Agent Instructions는 세 층이다.

1. `agent-instructions/COMPANY_CONTRACT.md`
   - 회사 구조, 공통 권한, Room/Task 구분, 소유권, 기억과 근거
2. `agent-instructions/profiles/task-owner.md` 또는 `profiles/worker.md`
   - Task를 만드는 책임자와 생산 Worker의 서로 다른 생명주기
3. `agent-instructions/roles/*.md`
   - Manager, Designer, CTO, Code, QA, Image, Voice, Document의 전문 범위

`agent-role-map.json`이 9개 Agent ID를 프로필과 역할에 연결한다. 두 CTO는 같은 `task-owner + cto` 조합을 사용한다. 모든 Worker는 `worker` 프로필을 공유하되 전문 역할 파일만 다르다.

공통 계약과 프로필은 관리 마커 안에 동기화한다. 역할 영역은 SPS의 `Agents > Instructions`에서 편집할 수 있고 일반 동기화에서 보존한다. 전면 재배치할 때만 `-ResetRoleSections`를 사용한다.

## 핵심 행동 계약

- Manager, Designer와 모든 CTO는 동등한 Task Owner이며 어느 공용 Worker도 사용할 수 있다.
- SPS Company/Org는 하나의 기술적 시스템 컨테이너일 뿐이며 운영 Agent는 `reportsTo = null`인 평면 풀로 유지한다.
- `reportsTo`가 아니라 `originatingRoomIssueId`와 `owningAgentId`가 Task 소유권을 정한다.
- 자연어 위임의 범위가 충분하면 책임자는 같은 응답에서 가장 작은 Task를 만든다.
- 지정 Worker가 paused 상태여도 Task를 생략하지 않는다. 같은 Worker에게 `blocked` Task 하나를 만들고, Owner가 Worker를 재개한 뒤 같은 Task를 시작한다.
- Worker는 배정 Task만 수행하고 최종 또는 차단 보고를 정확히 하나 남긴다. 상태 전환과 소유 Room 깨움은 런타임이 처리한다.
- 사용자 질문, blocker와 최종 결과는 Task를 만든 장기 Agent Room에서 보고한다.

## 런타임 일치

Room 플러그인도 같은 계약으로 변경한다.

- `create_task`: paused Worker를 거절하지 않고 동일 Worker에게 배정된 `blocked` Task를 원자적으로 초기화한다.
- `start_task`: Worker가 사용 가능해진 뒤 동일 Task만 `todo`로 전환한다. Worker를 재개하거나 assignee를 바꾸거나 대체 Task를 만들지 않는다.
- Worker 최종/차단 보고: 댓글, 상태 전이와 소유 Room 깨움을 런타임이 연결한다.
- Adapter 프롬프트: 관리된 `AGENTS.md` 읽기와 현재 Task 문맥 전달만 담당하고 회사 정책을 중복하지 않는다.

## 검증 기준

- 활성 Agent와 역할 맵의 1:1 대응
- 모든 Agent에 정확한 공통 계약, 프로필 마커와 역할 마커 존재
- UTF-8 BOM, 최대 파일 크기와 모델 정체성 종속 문구 검사
- Task Owner/Worker 핵심 경계 문구 검사
- paused Worker Task 생성, 동일 Task 재개와 중복 생성 방지 회귀 테스트
- Room 플러그인 전체 빌드·테스트와 배포 후 health 검사

## 적용 결과

- 활성 고용 Agent 9명: 공통 계약, 프로필, 역할 동기화 완료
- 프로필: Task Owner 4명, Worker 5명
- Instructions 검사: 오류 0, 경고 0, UTF-8 BOM 정상, 파일당 약 8.9~9.7KB
- Worker 실행 프롬프트: 5명 동기화 완료
- Room 플러그인 전체 회귀 테스트: 통과
- 배포: `local.room-chat` `0.3.19`, 상태 `ready`, health `healthy`
- 권한 회귀: SPS role이 `designer`인 Worker도 관리 역할이 `image-worker`이면 Task 생성 거절
- 상태 보존: paused 상태인 Image Worker와 Document Worker를 자동 재개하지 않음
- 배치 전 백업: `%LOCALAPPDATA%\SPS\instruction-backups\20260714-130627`
