# Lead 공유 기억 저장과 실제 세션 검증

## 구현 기준

Builder 코드 `53d5c33`, Core `55b5d5b`, 공개 SDK `316c56f`다. Builder 설계 v15의
프로젝트별 Lead 구조화 기억을 연결하는 단계이며 전체 Builder 완료가 아니다.
Core에는 Lead 역할·업무 기억 전략·고객 승인 정책을 넣지 않았다.

`builder.read-lead-memory`와 `builder.update-lead-memory`는 현재 선택된 Lead와 준비된
세 세션의 Host-검증 실행 문맥에서 동작한다. 기억은 프로젝트별 불변 Revision journal과
조건부 head 저장을 재사용한다. 목표·제약·결정·가정·미결정 질문을 구조화하고 실제
상담 또는 현재 main/decisions 사용자 입력의 출처와 SHA-256, 작성 Agent·Run·세션·선택
revision·채널을 남긴다. 해석의 의미는 모델이 판단하며 문자열만으로 사용자의 승인이나
업무 성공을 결정하지 않는다. 일반 state.set이나 실행 재전송으로 충돌을 덮지 않는다.

Lead 변경 후에도 기억과 이력은 보존한다. 새 Lead는 기존 항목을 정확히 유지할 수 있지만
과거 Lead의 비공개 대화 출처로 해석을 바꿀 수는 없다. 바뀐 해석에는 현재 접근 가능한
사용자 입력이 필요하다. 이것은 기존 기억의 인계 기반이지 과거 모든 대화의 자동 공유나
완성된 handoff UI가 아니다. 기억에 적힌 `decision`도 대외 계약·실행·배포 권한을 주지 않는다.

UI는 현재 Workspace UUID를 기본 프로젝트로 사용하며 기존 설계 문서 화면에 읽기 전용
`Lead 공유 기억 · 해석 기록`을 표시한다. 여러 프로젝트 선택 UI나 프로젝트별 Lead 배정
권한까지 이번 검사로 증명하지 않는다. 원본 대화는 기존 채널별 저장 경로에 따로 남긴다.

## 자동 검사

Source Desktop 폴더에서 Node24.22.1/PATH24와 별도 Builder 절대 경로의
`SPS_BUILDER_SOURCE_ROOT`로 실행했다.

```powershell
node scripts/smoke-builder-conditional-state-isolated.mjs --build-only
```

격리 타입 검사·새 빌드·Builder 전체181/181·SDK CLI validate/test가 exit0이다. 새 순수
기억 검증9개, 표시 검증2개, 모의 Host 통합7개가 포함된다. 세 채널의 같은 프로젝트
journal 공유, 프로젝트/Workspace 키 분리, Worker/잘못된 세션 거부, 사용자 출처 확인,
CAS 충돌·응답 유실 후 명시적 조회, 관측한 선택 변경 거부, 새 Lead의 정확한 항목 유지와
기존 Lead 권한 상실을 확인했다. 모의 Host의 세 채널 성공을 실제 AI 세 세션 실행으로
표시하지 않는다. 최초 타입 검사에서 시험 fixture의 타입 오류3개를 수정한 뒤 재실행했다.

기억 내용128KiB와 최종 journal entry192KiB 제한은 별개다. 작성 메타데이터·출처 해시를
합친 최종 크기가 초과하면 저장 전에 거부한다. 단일 키 CAS는 다중 키 transaction이나
모든 순간의 권한 회수를 보장하지 않는다. 본문에 사용자가 넣은 비밀을 완벽히 탐지하는
DLP 기능으로 확대해서도 안 된다. CLI 인증 파일을 기억에 자동 복사하지 않는다.

## 실제 시험과 한계

사용자가 허용한 기본 Codex CLI 계정으로 격리 source Desktop/Host를 사용했다. Identity는
mock이며 실제 Google OAuth·설치본·서명·두 PC 검증은 아니다. 다음 별도 opt-in으로
시작했고 API 키·대체 provider·다른 실계정 시험 모드 혼입은 시작 전에 차단한다.

```powershell
$env:SPS_BUILDER_LIVE_CODEX = '1'
$env:SPS_BUILDER_LIVE_MEMORY = '1'
node scripts/smoke-builder-conditional-state-isolated.mjs --live-memory
```

실제 제공자 실행3회는 **두 채널 main → decisions → main 재개**다. 첫 전송은 실제 UI,
나머지2회는 정상 인증된 Builder action을 사용했다. 질문 큐 UI나 내부 CTO 입력을
사칭한 것은 아니다. Main5/5·출력10개 정상 종료와 최종 임시 데이터 정리가 끝났고 전체
명령은 exit0이다.

| 항목 | 결과 |
| --- | --- |
| 메인: 상담 출처를 읽어 목표 저장·재조회 | 성공, 쓰기1회 |
| 질문 세션: 같은 기억 읽기·사용자 결정 추가 | 성공, 쓰기1회 |
| 메인 재개: 두 항목 조회 | 성공, 쓰기0회 |
| 실제 Host 기억 문서 UI | 두 항목·출처·revision 표시 |
| 재시작 후 기억·채널별 원본 대화 | 동일 |
| 다른 Workspace | 변경 없음 |
| 명령/코드/파일 편집·웹/다른 앱·하위 Agent | 실행 없음 |
| 내부 CTO 질문 수신 세션의 실제 실행 | 미검증 |

내부 CTO 세션은 정상 질문 전달 경로가 아직 없어 시험용 사용자 입력을 열지 않았다.
세 실제 세션 통합을 완료했다고 보고하지 않으며 CTO 생성·질문 intake 연결에서 이어서
검증해야 한다. 이번 trial Agent의 MCP 두 wrapper만 명시적으로 승인한 설정은 일반
Agent의 기본 승인 UX 완성을 뜻하지 않는다. 사용자 DEV·설치본·기존 Agent 설정과
의존성은 교체하지 않았다.

## 발견하고 수정한 Core 재개 연결

이전 Core에서 첫 두 실행은 성공했지만 main 재개의 MCP 호출은 실패했다. 두 번째
진단 시험에서는 실제 오류 `user cancelled MCP tool call`을 확인했다. 인증 토큰 만료나
DB 기억 손상으로 단정하지 않았다. 실패 시험은 각 Main3/3으로 정상 종료했고 내부 시험
데이터는 정리됐지만 바깥 빌드 복사본은 진단용으로 남았다.

Codex 어댑터가 MCP `-c` 설정을 `resume <id>` 뒤에 넣고 있어, 명령 단계별 전역 옵션을
처리하는 일부 CLI에서 앞쪽의 모델/승인 설정과 갈라질 수 있었다. 공식 Codex 소스도
Clap의 가장 깊은 명령 단계 값 보존 문제를 설명한다. Core `55b5d5b`는 MCP 설정을
`resume` 앞의 기존 exec 옵션과 같은 단계에 배치한다. sandbox·도구 허용·사용자
승인 정책 값 자체를 완화하거나 이전 실행 토큰을 재사용하지 않는다.

```powershell
node node_modules/vitest/vitest.mjs run --project @paperclipai/adapter-codex-local packages/adapters/codex-local/src/server/codex-external-tools.test.ts packages/adapters/codex-local/src/server/codex-args.test.ts --reporter=dot
node node_modules/typescript/bin/tsc --noEmit -p packages/adapters/codex-local/tsconfig.json
```

집중16/16과 타입 검사 exit0이며, 변경 후 실제 동일 세션 재개에서 MCP 호출이 성공했다.
이는 설치된 CLI 경로의 회귀 근거이지 모든 Codex 버전의 호환성 인증은 아니다. 전체
Core 회귀·새 보안 감사·Stable 자격 검사도 이번에 다시 수행한 것이 아니다.

## 산출물 식별

- 최종 시험 source fingerprint: `a7bf8c0e0fac42b76db27ea17fa3fe5afb2c55035e4368e92076b3ea255b269b`
- manifest SHA-256: `bfe7cc6a216501cea6469cf95c2cfdda584369ab6d0cc2ef31e887573c42ffc4`
- Worker SHA-256: `d4ac72ed4e340d12893d3fddc07648a31696277c571390dbcc51b3e90b476865`
- UI build SHA-256: `926123eab02bc45d3e7371d24d265830f28d7ab9906ff90449ae1bf74b1092ad`
- 실제 기억 DTO SHA-256: `197b447eb342f77a8fd2d2f2a3090cc9e3257cea9d1b2dc953f04125f1f6c90f`

Source guard 자동 검사1개는 시작 전16개 거부 사례를 확인했다. 원본 로그는 로컬 Temp의
`sps-builder-shared-memory-build-verified.log`, `sps-builder-live-memory-app.log`,
`sps-builder-live-memory-diagnostic.log`, `sps-builder-live-memory-verified.log`,
`sps-codex-resume-mcp-options.log`다. 공개 Builder에는 계정·사용자 경로·원시 로그·사설
Core 코드를 복사하지 않는다. 문서 추가 후 HEAD 전체를 위 시험 복사본과 같은
fingerprint로 표시하지 않는다.

다음은 사용자 답변을 명세·Graph의 실제 Revision에 반영하는 경로와 CTO/질문 intake다.
전체 Builder 목표는 active·미완료이며 Marketplace·Preview·자체 LAN 보류와 기존
Tailscale 유지는 바뀌지 않았다.

공식 참고:
[MCP 도구 계약](https://modelcontextprotocol.io/specification/2025-06-18/server/tools),
[PostgreSQL 동시성](https://www.postgresql.org/docs/current/transaction-iso.html),
[Codex 전역 옵션 수집 구현](https://github.com/openai/codex/blob/main/codex-rs/utils/cli/src/config_override.rs).
