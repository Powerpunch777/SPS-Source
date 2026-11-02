# Builder 조건부 상태 저장 증거

2026-11-02. 이 기록은 Core 조건부 상태 저장 기반과 이를 사용한 별도 Builder의
선택된 검사 및 격리 source 앱 수용 시험만 다룬다. Builder 전체 완성이나 출시 승인이 아니다.

## 소스 식별

- Core: `e74bc8011b6681abe4331827030e8854918d8fa8` (부모 `d7d5a5a0d6a0b97ca875f684e2612954fc8d75fb`).
- 공개 SDK: `fb5dbc79ea3b4c321b7558e5b823e44acf3265ba`.
- 시험 당시 Builder 소스는 미커밋 작업 복사본이었고, 같은 5개 변경 파일을
  `c06dcba`로 커밋했다. 확인 fingerprint:
  `45917d164b9a56a9340b4023c7a8e6e15a0ace237d3e7231115bed38f9d8f1f8`.
- Core source operator: `sps-server/desktop/scripts/smoke-builder-conditional-state-isolated.mjs`.
  실행에는 절대 경로의 `SPS_BUILDER_SOURCE_ROOT`가 필요하다. 이 경로는 신뢰된 source 시험용이며
  설치 플러그인이나 Plugin IPC로 노출되는 진입점이 아니다.

## 검사 결과

- Core와 내부 SDK 검사 합계: 109/109 통과.
- 공개 SDK에서 선택한 검사: 63/63 통과. 이는 전체 공개 SDK test suite 통과를 뜻하지 않는다.
- 격리 Builder 검사: 89/89 통과. Builder typecheck, build, 공개 SDK validate 및 test도 통과.
- 실제 source Desktop/Owner Host 수용 시험: exit 0. 구조화 결과에서 실제 UI bridge,
  Workspace 상태·격리, Host 재시작, Lead 선택과 세 세션 준비/재확인/재시작,
  중복 dispatch 방지가 확인됐다. AI는 실행하지 않았다.
- Main/output 요약: 소유한 자식 4/4 정상 종료, 출력 스트림 8개 종료·0 실패.
  로컬 임시 데이터 정리를 확인했다. 이는 모든 자손 프로세스 또는 실기기 정리 자격은 아니다.
- 로컬 원본 로그는 `%LOCALAPPDATA%\Temp\sps-builder-cas-isolated-app.log`에 있다.
  이 문서에는 로그 원문, 계정 식별자, 사용자별 경로를 복사하지 않고 구조화 결과와 최종 요약만 남긴다.

## 보장 경계

조건부 저장은 회사 범위이며 현재 호출에서 허용된 읽기·쓰기 capability만 사용한다.
`expected: { exists: false }`이면 행이 없을 때만 생성하고,
`expected: { exists: true, value }`이면 저장된 JSONB 값이 기대 값과 같을 때만 교체한다.
응답은 `{ swapped: boolean }`이다. 값이 boolean이어야 하거나 반전되어야 한다는 제약은 없다.
응답 유실로 저장 결과가 불명확하면 fallback이나 자동 재시도를 하지 않는다.
전체 요청은 256 KiB, JSON 값 깊이는 64, 기대 값과 새 값의 합계 노드는 50,000개로 제한한다.

PostgreSQL 트랜잭션 시험에서 관찰한 권한 회수 시 변경 롤백은 그 시험 범위의 증거다.
모든 경합에서의 순간적 권한 잠금, exactly-once 실행 또는 다중 키 원자성을 보장한다고
일반화하지 않는다.

앱 시험은 mock Identity를 사용했고 실제 source Desktop/Owner Host에서 Lead 선택·재시작,
세션과 Workspace 상태 격리 및 UI 경로를 확인했다. 실제 AI/provider 실행, 설치 패키지,
물리 기기, 서명/출시 자격은 검증하지 않았다. 사용자 DEV 의존성은 변경하지 않았다.
일반 시험 harness 결과에 포함된 Native recovery는 기존 복구 경로의 관찰이며 새 LAN,
Preview 또는 Marketplace 기능의 구현·완료 증거가 아니다.

## 재현 명령

Node 24.22.1을 PATH 앞에 놓고 Core 작업 폴더에서 실행했다.

```powershell
node node_modules/typescript/bin/tsc -p packages/plugins/sdk/tsconfig.json
node node_modules/typescript/bin/tsc --noEmit -p server/tsconfig.json
node node_modules/vitest/vitest.mjs run --project @paperclipai/plugin-sdk --project @paperclipai/server server/src/__tests__/sps-plugin-state-conditional-write.test.ts server/src/__tests__/sps-workspace-state-conditional-write.test.ts server/src/__tests__/sps-workspace-agent-sessions.test.ts packages/plugins/sdk --reporter=dot
```

공개 SDK 작업 폴더에서 아래를 실행했다. 번들 Node 옆에는 npm CLI가 없으므로
실제 설치된 npm CLI 경로를 `npm_execpath`에 지정한 상태였다.

```powershell
node --test worker/index.test.mjs worker/testing.test.mjs worker/consumer-smoke.test.mjs platform/index.test.mjs runtime/index.test.mjs runtime/host-support.test.mjs
```

Source의 `sps-server/desktop`에서 `SPS_BUILDER_SOURCE_ROOT`에 별도 Builder 절대 경로를
지정하고 아래를 실행했다. 연산자는 소유권이 확인된 임시 복사본에서만 의존성 링크·빌드·앱
시험을 수행한다. 원래 Builder의 설치된 의존성을 바꾸거나 DEV에 적용하는 명령이 아니다.

```powershell
node scripts/smoke-builder-conditional-state-isolated.mjs
```

## 남은 Builder 범위

이 증거로 Builder 전체가 완성된 것은 아니다. v15 목표 중 Graph/tools, 공유 기억,
CTO, QA, providers 등은 남아 있으며 여기서 완료를 주장하지 않는다.

## 후속: 프로젝트별 Revision 저장 기반

공개 Builder `c61c1e4`에는 회사/Workspace 안의 프로젝트별 개정 기록과 조건부 현재 버전
갱신을 제공하는 내부 저장 모듈을 추가했다. 실제 역할 권한, 명세 존재/승인 검증과 도구 호출을
연결하기 전이므로 아직 UI나 AI 도구에 등록하지 않았다. 확정 포인터에서 연결되는 기록만
조회하고, 경쟁에서 탈락한 미확정 기록은 자동 삭제하거나 확정된 이력으로 보여 주지 않는다.

새 모듈 검사 24/24와 타입 검사 뒤, 같은 source 연산자에 명시적인 `--build-only` 모드를
추가해 새로운 임시 복사본에서 타입 검사·빌드·Builder 전체113/113·SDK CLI validate/test를
다시 수행했다. `actualSourceHost: false`, `liveAi: false`, `temporaryDataRemoved: true`로
끝났다. 이전 Lead 선택의 실제 앱 증거를 새 모듈의 실제 앱 증거로 대신 쓰지 않는다.

```powershell
node scripts/smoke-builder-conditional-state-isolated.mjs --build-only
```

새 빌드 fingerprint는 `6cb85468e55849a1797ca6c24ac407b8482cc26bad82e5feaafb7ba419cbf14f`다.
기록 모듈이 런타임에 연결되지 않아 Worker/UI 번들 해시는 앞선 빌드와 같다. 새 실행 경로나
사용자 DEV 적용을 주장하지 않는다. 원본 로그는 로컬 Temp의
`sps-builder-revisions-isolated-build.log`이며 공개 문서에는 원시 환경 정보를 복사하지 않았다.

Core와 SDK의 개발 변경은 각 브랜치에 push했으며 Source 지원 매트릭스·gitlink·릴리스 버전을
새 후보로 바꾸지는 않았다. 이 문서의 정확한 개발 revision을 별도로 checkout한 상태의
시험이며 기존 root checkout만으로 새 릴리스 후보를 재현한다는 의미가 아니다.
