# SPS Paperclip Compatibility Migration

최종 갱신: 2026-08-02

## 결론

SPS의 공개 제품명, Plugin SDK, Workspace 계약에는 Paperclip 이름을 추가하지 않는다.
현재 남아 있는 `@paperclipai/*` 패키지명과 `PAPERCLIP_*` 환경변수는 최신 SPS Core를
실행하기 위한 내부 호환 계층이다. 이 이름을 소스 전체에서 일괄 치환하지 않는다.
호환 입력을 먼저 SPS 이름으로 이중 제공하고, 데이터 이전과 플러그인 호환 기간을
거친 뒤 단계적으로 제거한다.

## 현재 남아 있는 이름의 분류

| 분류 | 예시 | 현재 처리 |
| --- | --- | --- |
| Core 내부 패키지 | `@paperclipai/server`, `@paperclipai/db`, 어댑터 패키지 | SPS 공개 API가 아니다. Core가 SPS 패키지명을 제공할 때까지 패키징 경계 안에 격리한다. |
| Core 실행 환경변수 | `PAPERCLIP_HOME`, `PAPERCLIP_CONFIG`, `PAPERCLIP_HOST_VERSION` | Desktop이 내부 Host를 시작할 때만 사용한다. Plugin SDK와 사용자 설정에는 노출하지 않는다. |
| 로컬 데이터베이스 호환명 | 로컬 PostgreSQL 사용자·DB 이름 `paperclip` | 기존 Vault 복원과 업데이트 호환 때문에 즉시 변경하지 않는다. 이전 도구와 롤백을 먼저 만든다. |
| Extension Profile 1.0 | 기존 manifest와 Room Workplane 호환 필드 | 기존 번들 플러그인용으로 유지한다. 신규 플러그인은 SPS Profile 2.0을 사용한다. |
| 테스트·역사 문서 | 과거 동작명, 이전 감사 기록 | 현재 계약과 혼동되지 않게 역사 자료로 표시한다. 사용자 UI 문자열로 재사용하지 않는다. |

## 공개 경계

다음 표면에는 Paperclip 이름을 허용하지 않는다.

- 사용자에게 보이는 Desktop 화면, 오류, 설치·업데이트 안내
- 공개 `@sonparkserver/plugin-sdk` API와 새 예제
- Marketplace의 공개 플러그인 metadata
- SPS Node, Runtime Pack, Workspace Source의 공개 계약
- Redon Games 웹사이트와 공개 SPS 소개 문서

내부 호환 이름이 필요한 코드는 Desktop의 Owner Host bootstrap, Core adapter, 복원
도구처럼 경계가 분명한 모듈 안에만 둔다. 새 기능이 호환 이름을 직접 참조해야 한다면
먼저 SPS 이름의 wrapper 또는 adapter를 만든다.

## 제거 순서

### 1. 격리

- Desktop의 대형 진입점에서 Host bootstrap, update, registry, preview 도메인을
  모듈로 분리한다.
- 공개 SDK 테스트는 `@paperclipai/*` import와 `PAPERCLIP_*` 설정을 계속 거부한다.
- 호환 이름의 신규 사용은 코드 리뷰에서 차단한다.

### 2. SPS 별칭 도입

- Core가 `SPS_*` 환경변수를 우선 읽고 기존 `PAPERCLIP_*`를 fallback으로만 받는다.
- SPS 패키지 export 또는 facade를 먼저 제공한 뒤 Desktop import를 전환한다.
- 두 이름이 같은 값을 받는 동안 충돌 시 SPS 값을 우선하고 진단 기록을 남긴다.

### 3. 데이터와 플러그인 이전

- 빈 Host 복원과 실제 백업을 이용해 데이터베이스명 변경 도구를 검증한다.
- 번들 플러그인을 Profile 2.0 계약으로 이전하고 Profile 1.0 사용량을 확인한다.
- 이전 정식 버전에서 업데이트, 롤백, 다시 업데이트하는 물리 테스트를 수행한다.

### 4. 호환 입력 제거

- 최소 두 번의 정식 Desktop 호환 기간과 실제 베타 증거를 확보한 뒤 제거한다.
- 제거 버전은 support matrix와 Plugin SDK 호환 범위에 명시한다.
- 기존 Vault 또는 플러그인이 발견되면 묵시적으로 깨뜨리지 않고 명확한 이전 오류를
  표시한다.

## 완료 기준

- 공개 SPS 소스와 UI에서 Paperclip 이름이 0개다.
- Desktop은 `SPS_*`와 `@sonparkserver/*` 경계만 사용한다.
- 이전 Vault export를 빈 Host에 복원한 뒤 데이터와 플러그인을 그대로 읽을 수 있다.
- 이전 정식 버전에서 새 버전으로 업데이트와 롤백이 통과한다.
- Profile 1.0 제거 시점과 지원 종료 버전이 support matrix에 기록된다.

이 문서는 호환 계층을 영구 공개 API로 인정하지 않는다. 동시에 이름 정리를 이유로
현재 검증된 설치·복원 경로를 깨뜨리는 것도 허용하지 않는다.
