# Builder 선행: Workspace 도구 호출 경계

2026-11-02. Builder의 Lead 전용 설계 도구가 사용할 수 있는 업무 중립 호출 경로를
Core에 보완한 기록이다. Lead의 Graph 작성 기능이나 전체 Builder 완료 기록이 아니다.

## 정확한 개발 소스

- Core `32a3f9fed99a09c989440d16319be73b551560d8`.
- 공개 SDK `316c56f247813e3ec19037b3a3f079d1caa7b739`.
- Builder `7f04887`: 명세 데이터 검증과 위 SDK pin. Graph/명세 저장 및 도구는 아직 미연결.

각 개발 브랜치에 push했다. Source의 Core/SDK gitlink, 지원 매트릭스와 설치본 버전을
새 후보로 바꾸지는 않았다. 이 기록은 위 개발 revision을 따로 checkout한 환경의 근거다.

## 보완한 공통 계약

`workspaceWorker`가 있는 플러그인의 선언된 도구는 해당 Workspace 프로세스로 보낸다.
기존 도구 API·등록·capability/Agent grant를 재사용하고, 실패하면 전역 Host Worker로
대신 보내지 않는다. Workspace Worker가 도구를 동적으로 등록할 권한을 새로 준 것은 아니다.

Core는 요청의 `agent_jwt` Agent/Run/Workspace와 DB의 활성 Plugin Agent 세션을 대조한다.
활성 Agent, 실행 중이며 취소되지 않은 Run, 해당 플러그인의 열린 세션이 필요하다.
사용자 입력의 `role`, `sessionId` 같은 추가 필드는 버리고 서버가 확인한 `sessionId`를
동결된 ToolRunContext에 넣는다. 유지 호환용 Core project는 필수가 아니다.

Host RPC를 할 때 실행·세션·플러그인 활성화·도구 등록·grant·Provider 선택과 기존
Workspace epoch/설정/패키지 정책을 재확인한다. 관찰한 회수는 실패시키며 자동 재전송하지
않는다. 거부는 원시 오류/도구 인자 없이 고정 코드로 audit에 남긴다.

Core가 Lead/CTO/Worker 역할을 판정하지는 않는다. Builder는 준비된 Lead 세션·선택 버전,
현재 명세와 프로젝트별 업무 권한을 검증한 뒤 설계 변경을 허용해야 한다. 이 후속 연결은
남아 있다. 모든 권한 행을 transaction 동안 잠그는 계약, 동일 OS 사용자 프로세스의 직접
접근을 막는 sandbox 또는 순간적인 전역 권한 회수 보증으로 확대하지 않는다.

## 검증

Node 24.22.1/PATH24에서 Core 작업 폴더 기준:

```powershell
node node_modules/typescript/bin/tsc -p packages/plugins/sdk/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json
node node_modules/vitest/vitest.mjs run --project @paperclipai/server server/src/__tests__/sps-workspace-plugin-tools.test.ts server/src/__tests__/plugin-routes-authz.test.ts server/src/__tests__/sps-workspace-plugin-process.test.ts server/src/__tests__/sps-workspace-plugin-workers.test.ts server/src/__tests__/sps-workspace-agent-sessions.test.ts server/src/__tests__/plugin-worker-manager.test.ts server/src/__tests__/plugin-worker-workspace-owner.test.ts --reporter=dot
```

타입 검사 exit0, 집중7개 파일185/185다. 새 Express 사례17개는 승인된 callback에 진입한
뒤 두 번째 검사에서 취소·grant 회수·비활성화·등록/세션/actor Run 변경을 감지해 쓰기를
막고 denied audit가 남는지 확인한다. DB 행·정책/grant는 fixture이며 실제 Google JWT나
운영 DB 검증으로 표시하지 않는다.

실제 자식 프로세스 lifecycle2개에는 새 도구 호출 사례가 포함된다. Workspace A/B의 서로
다른 PID와 상태 조회, 전역 Worker 미기동, 잘못된 scope/누락 Agent·Run·세션/접근자 속성
거부, Host RPC 중 권한 회수 시 결과 거부 및 정상 종료를 확인했다. 첫 실증에서 남아 있던
두 런타임 allowlist를 발견해 `executeTool`만 좁게 확장했다. 모의 Worker 호출 성공을 실제
프로세스 시험의 대체 근거로 쓰지 않았다.

공개 SDK에서 다음 선택 검사는44/44다. npm CLI가 번들 Node 옆에 없으므로 설치된
npm CLI 경로를 `npm_execpath`에 지정했다. consumer는 npm pack/install/타입 검사를
수행했고, project 없는 ToolRunContext와 선택적 session 필드를 확인했다.

```powershell
node --test worker/consumer-smoke.test.mjs platform/index.test.mjs worker/index.test.mjs
```

원본 로그는 로컬 Temp의 `sps-workspace-tools-combined.log`,
`sps-workspace-tools-public-sdk.log`에 있다. 이 문서에는 사용자 경로·계정·원시 로그를
복사하지 않았다. 전체 Core/SDK 회귀·보안 감사·실제 앱/AI·설치본/서명·두 PC 자격은 아니다.

## 병행한 Builder 명세 검증

v15 ApprovedSpecRevision 개념 스키마에 맞춰 프로젝트 경계, 요구사항·수용 기준 참조,
납품 대상과 정책/승인 근거 참조를 검증하는 순수 모듈9/9를 추가했다. 참조 문자열을 실제
사용자 승인이나 존재 증거로 오인하지 않는다. UI·저장·실행에는 아직 연결하지 않았다.

새 SDK를 넣은 소유권 확인 임시 복사본에서 Source 연산자
`node scripts/smoke-builder-conditional-state-isolated.mjs --build-only`를 실행했다.
Builder 타입/새 빌드/전체122/122/SDK CLI validate/test가 통과했고 임시 데이터를 정리했다.
fingerprint는 `246da081d5e9680ef7ec8e8c9c1ccc3739e7b22ea2088cf78572ad231ac6636f`다.
`actualSourceHost: false`, `liveAi: false`인 빌드 전용 결과다. 사용자 DEV 의존성은 교체하지
않았으며, 앞선 Lead 선택의 실제 앱 기록을 이 모듈의 앱 증거로 대신 쓰지 않는다.

Marketplace·Preview·자체 LAN은 보류다. 다음은 Builder의 실제 역할/명세 근거/Graph
저장과 도구 연결이며, 이 기록만으로 어느 전체 AC도 통과 처리하지 않는다.
