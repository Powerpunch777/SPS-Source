# SPS MCP 상호운용성 계약

상태: 제품 계약 초안. `@sps/mcp-server`의 SPS 브랜딩과 기본 호환 정책은 구현한다. 외부 MCP Connector와 Desktop Node Bridge는 이 계약을 기준으로 후속 구현한다.

## 1. 목적

MCP(Model Context Protocol)는 SPS 밖의 Agent와 도구를 연결하는 표준 프로토콜이다. SPS는 MCP를 별도 회사 구조나 작업 모델로 만들지 않는다. Project, Task, Agent, Agent Session, Node, Runner, 권한과 감사 기록은 계속 Core가 소유한다.

MCP는 다음 두 방향을 명확히 분리한다.

```text
외부 Agent ── MCP ──> SPS Hub 도구
SPS Agent ── MCP ──> 외부 도구와 서비스
```

## 2. SPS MCP Server

`@sps/mcp-server`는 외부 Agent가 SPS Hub의 기존 API를 MCP 도구로 사용할 수 있게 하는 얇은 표준 서버다.

- 기본 명령: `sps-mcp-server`
- 기본 환경 변수: `SPS_API_URL`, `SPS_API_KEY`, `SPS_COMPANY_ID`, `SPS_AGENT_ID`, `SPS_RUN_ID`
- 기본 도구 이름: `spsListProjects`, `spsCreateIssue`, `spsAddComment`처럼 `sps` 접두사를 사용한다.
- 기존 `PAPERCLIP_*` 환경 변수와 `paperclip*` 도구 이름은 `SPS_MCP_LEGACY_TOOL_NAMES=true`일 때만 전환 호환성으로 제공한다.

MCP 서버는 Hub DB를 직접 읽지 않는다. 모든 요청은 기존 Hub API와 bearer 권한을 통과한다. 따라서 MCP 클라이언트가 할 수 있는 일은 그 토큰이 허용한 범위를 넘을 수 없다.

## 3. 외부 MCP Connector Plugin

SPS Agent가 GitHub, Figma, Obsidian, Unity Cloud, Blender 자동화 서비스, 이미지·음성 서비스 등의 MCP 도구를 사용할 때는 `connector` 플러그인으로 만든다.

기본 Agent Tool은 manifest에 정적으로 선언된다. 다만 `agent.tools.dynamic.register` capability를 선언한 Connector는 연결 뒤 발견한 도구를 `ctx.tools.replaceDynamic(...)`으로 교체 등록할 수 있다. Core는 도구 이름·개수·정적 Tool 충돌을 검사하고, 이 목록을 메모리에만 보관해 Plugin 비활성화·제거 때 함께 정리한다. Connector의 allowlist와 Agent·Project 범위 UI는 다음 단계에서 이 기반 위에 추가한다.

### 기본 원칙

1. MCP 서버 하나당 Plugin 또는 명확한 Plugin 내부 연결 프로필을 둔다.
2. Plugin은 MCP 도구를 SPS Agent Tool로 투영하고, 실제 호출에는 Agent·Project·Task 실행 문맥을 전달한다.
3. Plugin manifest에는 필요한 도구와 권한을 정적으로 선언하고, 설치 후 발견되는 도구는 승인 가능한 allowlist로 보관한다.
4. 원격 연결은 HTTPS 기반 transport와 Secret Reference만 사용한다. Secret 값은 실행 순간에만 해석하고 로그·설정·Task·Memory에 기록하지 않는다.
5. 읽기, 쓰기, 실행, 배포, 삭제처럼 위험도가 다른 도구를 같은 권한으로 취급하지 않는다.

초기 Connector는 기존 Plugin 권한을 사용한다.

```text
agent.tools.register
agent.tools.dynamic.register
http.outbound
secrets.read-ref
plugin.state.read
plugin.state.write
activity.log.write
```

필요한 경우에만 `issues.update`, `issue.comments.create`, `workspace.write` 같은 추가 권한을 선언한다. Connector가 Lead 전용 Task 생성 규칙이나 승인 규칙을 우회할 수는 없다.

## 4. Desktop Node의 로컬 MCP

Unity, Unreal, Blender, 로컬 파일, 사내 전용 CLI처럼 `stdio`로 실행되는 MCP는 Hub 프로세스가 직접 실행하지 않는다. 실행 설정과 자격 증명, 로컬 경로가 Hub로 넘어가기 때문이다.

후속 `Node MCP Bridge`는 다음을 만족해야 한다.

1. Node가 로컬 MCP 서버의 안전한 별칭·transport·지원 도구 요약만 Hub에 보고한다.
2. 실제 명령, 환경 변수, 토큰, 쿠키, 절대 경로는 Node의 안전한 저장소에 남긴다.
3. Agent는 Node 및 Runner 권한과 별도로 MCP 연결 권한을 가져야 한다.
4. Hub는 서명된 Node 요청으로 특정 MCP 도구 호출만 전달하고, Node는 허용된 server/tool 조합만 실행한다.
5. 호출 로그에는 도구 이름, 안전한 입력 요약, 결과 상태, 시간, Task·Agent·Node 식별자만 남긴다.

이 경로가 구현되기 전에는 로컬 MCP 설정 파일이나 `stdio` 명령을 Hub Plugin 설정에 붙여 넣지 않는다.

## 5. 권한과 승인

MCP Tool은 다음 네 단계로 검사한다.

```text
Plugin 설치 권한
→ Plugin capability
→ Agent·Project·Task 사용 범위
→ Node·Runner·MCP 연결 권한(로컬 MCP인 경우)
```

도구가 파일 삭제, 배포, 결제, 공개 게시처럼 되돌리기 어렵거나 외부 영향이 큰 작업을 요청하면 Team/Workplane의 승인 정책을 따라야 한다. MCP 자체가 사용자 승인이나 Lead의 Task 생성 책임을 대체하지 않는다.

## 6. 실패와 관찰성

MCP 오류는 Agent 실패와 구분해 기록한다.

- `auth_required`: 연결 계정 또는 Secret Reference가 준비되지 않음
- `quota_limited`: 공급자가 일시 사용 제한을 보고함
- `offline`: 원격 endpoint 또는 Desktop Node에 연결할 수 없음
- `tool_denied`: 허용되지 않은 도구 또는 범위 요청
- `tool_failed`: 허용된 도구가 실행 중 실패함

한도 정보는 `Availability Snapshot`처럼 관측 시각과 출처를 포함한 운영 정보다. SPS는 공급자의 청구·사용량 원장을 재구성하지 않는다.

## 7. 구현 순서

1. `@sps/mcp-server` 브랜딩과 SPS 환경 변수, 기존 명칭 호환 모드
2. 원격 HTTPS MCP Connector 예제와 Plugin Studio 템플릿
3. Connector 설정 화면: allowlist, Secret Reference, Agent·Project 범위, 상태와 감사 기록
4. Desktop Node MCP Bridge와 로컬 `stdio` 연결
5. GitHub, Obsidian, 게임 제작 도구 같은 공식 Connector

이 순서는 원격 서비스와 로컬 컴퓨터의 신뢰 경계를 섞지 않기 위한 것이다.

## 8. 현재 제공되는 HTTPS Connector

`@sps/plugin-mcp-connector`는 이 계약의 첫 기본 구현이다. 운영자는 Streamable HTTP MCP endpoint, 선택적 Bearer Secret Reference, 정확한 remote Tool allowlist를 설정한다. Connector는 연결 시 remote Tool 목록을 읽고 allowlist와 일치한 Tool만 `sps.mcp-connector:mcp_<tool>` 이름으로 동적 등록한다.

- HTTPS endpoint만 허용한다. `http://localhost` 계열은 개발용으로만 허용한다.
- `*` 와 같은 wildcard allowlist는 허용하지 않는다.
- secret 값은 연결할 때만 resolve하며 설정, 로그, Task, Memory에 저장하지 않는다.
- Tool discovery 또는 연결에 실패하면 기존 dynamic Tool을 즉시 비워, 오래된 연결 정보가 Agent에게 남지 않게 한다.
- 현재 Connector의 allowlist는 Plugin instance 단위다. Agent·Project별 추가 범위 UI와 호출 감사 화면은 다음 단계에서 Core의 같은 Tool 계약 위에 추가한다.
