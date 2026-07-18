# SPS Agent Instructions 운영

## 목적

모델, CLI 또는 API 제공자가 바뀌어도 같은 역할은 같은 회사 구조와 Task 흐름을 따른다. Instructions에는 오래 유지되는 행동 계약만 두고, 프로젝트 사실과 실행 상태는 저장소와 SPS이 관리한다.

## 세 층 구조

실제 `AGENTS.md`는 다음 순서로 조립된다.

1. `COMPANY_CONTRACT.md`
   - Company, Project, Agent Room, Task의 차이
   - 공통 권한, 소유권, 위임 해석, 근거와 기억 경계
2. `profiles/*.md`
   - `task-owner`: Manager, Designer, CTO의 Task 생성·검토·보고 흐름
   - `worker`: 전문 Worker의 실행·증거·최종/차단 보고 흐름
3. `roles/*.md`
   - Manager, Designer, CTO, Code, QA, Image, Voice, Document의 전문 책임과 금지 범위

`agent-role-map.json`은 각 Agent ID를 `profile`과 `role`에 명시적으로 연결한다. 모델 이름이나 SPS의 넓은 role 값만 보고 회사 역할을 추론하지 않는다.

## 관리 영역

- `BEGIN/END PAPERCLIP COMPANY CONTRACT` 사이에는 공통 계약과 배정 프로필이 들어간다. 일반 동기화에서 단일 원본으로 갱신된다.
- `PAPERCLIP ROLE` 아래는 역할별 영역이다. SPS의 `Agents > Instructions`에서 수정할 수 있고 일반 동기화에서는 보존된다.
- `-ResetRoleSections`를 사용하면 역할별 영역도 기준 템플릿으로 다시 쓴다.
- 실제 파일은 Windows CLI 호환을 위해 UTF-8 BOM으로 저장한다.

## 명령

전면 배치:

```powershell
.\scripts\Sync-SPSCompanyInstructions.ps1 -ResetRoleSections -RequireApi
```

공통 계약과 프로필만 동기화:

```powershell
.\scripts\Sync-SPSCompanyInstructions.ps1 -RequireApi
```

활성 Agent 전체 검사:

```powershell
.\scripts\Test-SPSCompanyInstructions.ps1
```

Worker 실행 프롬프트와 병렬 실행 수 동기화:

```powershell
.\scripts\Sync-SPSAgyPromptTemplate.ps1
.\scripts\Sync-SPSWorkerConcurrency.ps1
```

`executionClass`는 실행 동시성만 정한다. Task 소유권은 `originatingRoomIssueId`와 `owningAgentId`가 정한다.

## 변경 절차

1. 회사 전체 규칙이면 `COMPANY_CONTRACT.md`를 수정한다.
2. Task Owner 또는 Worker 전체 규칙이면 해당 `profiles` 파일을 수정한다.
3. 전문 역할 규칙이면 해당 `roles` 파일을 수정한다.
4. 새 Agent를 고용하면 ID, 이름, `profile`, `role`, 필요 시 `executionClass`를 역할 맵에 추가한다.
5. 전면 배치 또는 일반 동기화 후 검사를 실행한다.

갱신 전 실제 파일은 `%LOCALAPPDATA%\SPS\instruction-backups`에 백업된다. 서버 시작 스크립트는 역할별 편집을 보존하면서 공통 계약과 프로필만 동기화한다.

## 작성 원칙

- 구체적이고 검증 가능한 문장으로 쓴다. 모호한 가치 선언과 같은 규칙의 반복을 줄인다.
- 자주 바뀌는 프로젝트 상태, Agent의 현재 pause 상태, Task ID, 모델 이름과 계정 정보는 넣지 않는다.
- 긴 도구 절차, 공급자별 사용법과 예시는 Skill 또는 운영 문서로 분리한다.
- 권한, 상태 전이, 깨움, 중복 방지와 UTF-8 저장처럼 반드시 지켜져야 하는 것은 런타임에서도 강제한다.
- 역할별 지침은 전문 판단만 다르게 하고 Task 생명주기는 프로필에 한 번만 둔다.

참고 자료:

- OpenAI Codex AGENTS.md 가이드: https://developers.openai.com/codex/guides/agents-md
- OpenAI Codex 사용자 지침: https://developers.openai.com/codex/concepts/customization
- Anthropic Claude Code 메모리: https://docs.anthropic.com/en/docs/claude-code/memory
- Google Gemini CLI 구성: https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md
