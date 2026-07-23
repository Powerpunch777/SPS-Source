# SPS Plugin Registry 및 Marketplace 계약

## 문서 지위

- 상태: Implementation Contract
- 작성일: 2026-07-23
- 구현 상태: `in_progress`
- 선행 문서: `114-sps-product-and-plugin-platform-contract-ko.md`, `115-sps-plugin-kit-and-bundled-teams-implementation-plan-ko.md`
- 적용 범위: 플러그인 공유·설치·업데이트·발견의 배포 경계. 결제·정산 정책은 포함하지 않는다.

## 1. 목적

SPS 사용자는 자신의 작업 방식에 맞는 Team, Tool, UI, Automation, Integration, Memory Provider 플러그인을 만들고 다른 사람과 공유할 수 있어야 한다. 이를 위해 SPS는 플러그인의 코드 실행 권한과 배포 출처를 분리한다.

```text
Plugin author
  -> build, test, package, sign
Registry
  -> immutable release metadata and artifacts
SPS Desktop / Owner Host
  -> verify, preview permissions, install disabled, enable explicitly
Marketplace
  -> discover, document, review, license entitlement, payment later
```

Registry가 신뢰하는 것은 특정 플러그인의 기능이 아니라 **검증 가능한 release**다. Marketplace가 판매하거나 추천하는 것은 Registry release이며, Marketplace의 구매 상태가 Runtime 권한을 증가시키지 않는다.

## 2. 역할과 소유권

| 객체 | 책임 | 권한이 없는 것 |
| --- | --- | --- |
| Plugin author | 소스·manifest·테스트·release 서명 | 사용자 컴퓨터에 자동 설치·실행 |
| Publisher key | release의 출처와 무결성 서명 | 위험 권한의 자동 승인 |
| Registry | package locator, release record, advisory, catalog metadata | Node·Workspace·비밀 값 접근 |
| Owner Host | package 검사, 정책·호환성·권한 검토, plugin lifecycle | 게시자 계정의 자격 증명 보관 |
| Desktop Node | 자신의 CLI·MCP·Workspace 실행 승인 | Hub가 임의 실행시키는 것 |
| Marketplace | 발견, 문서, 게시자 프로필, entitlement·거래 UX | 패키지 해시 또는 권한 계약 우회 |

## 3. 배포 source

Registry v1은 같은 release record 형식을 세 source에서 읽는다.

| Source | 용도 | 기본 신뢰 상태 |
| --- | --- | --- |
| `local` | 개발, 오프라인, 개인·소규모 팀 공유 | 현재 컴퓨터의 명시적 신뢰 |
| `git` | GitHub Release 또는 정적 HTTPS index | 게시자 키·해시 검증 후 사용자 확인 |
| `official` | SPS 운영 공식 Registry | SPS 공식 키·해시 검증 후 사용자 확인 |

각 source는 `registry.json` index와 release별 metadata를 제공한다. 패키지 artifact는 version별 immutable URL을 사용해야 한다. branch URL, mutable latest URL, 설치 시점에 달라질 수 있는 npm tag는 release artifact locator로 허용하지 않는다.

`git`과 `official` source는 Owner가 미리 신뢰한 Registry root public key로 `registry.json` 자체를 검증해야 한다. release publisher key는 개별 package release를 검증하는 키이며 Registry index를 신뢰하는 근거가 아니다. `local` source는 사용자가 선택한 폴더를 명시적으로 신뢰하는 개발·오프라인 경로로만 unsigned index를 허용하며, UI에는 그 상태를 표시한다.

Owner Host는 source 설정을 아래처럼 저장한다. `local`은 로컬 폴더를 선택한 Owner의 명시적 신뢰이고, `git`·`official`은 URL, root key ID, root public key가 함께 고정되어야 한다. Remote source가 unsigned index를 받아들이는 예외는 없다.

```json
{
  "id": "sps.official",
  "kind": "official",
  "displayName": "SPS Official Registry",
  "indexUrl": "https://registry.sps.example/registry.json",
  "trustedRoot": { "keyId": "ed25519:sps-registry-root-1", "publicKey": "..." }
}
```

## 4. Registry index와 release record

### 4.1 Registry index

```json
{
  "registrySchemaVersion": 1,
  "registryId": "io.sps.official",
  "displayName": "SPS Official Registry",
  "updatedAt": "2026-07-23T00:00:00Z",
  "publisherKeys": [
    { "keyId": "ed25519:sps-official-1", "algorithm": "ed25519", "publicKey": "..." }
  ],
  "signature": { "keyId": "ed25519:sps-registry-root-1", "algorithm": "ed25519", "value": "..." },
  "plugins": [
    {
      "id": "sps.team-workplane",
      "name": "SPS Team Workplane",
      "latest": "1.0.0",
      "releases": [
        "releases/sps.team-workplane/1.0.0.json"
      ]
    }
  ]
}
```

Index는 검색·발견용이다. remote source에서는 신뢰된 root key로 index signature를 먼저 검증하고, 설치 판단은 이어서 release record와 다운로드한 artifact의 검증 결과로 한다.

### 4.2 Release record

```json
{
  "registrySchemaVersion": 1,
  "plugin": { "id": "com.example.plugin", "version": "1.0.0" },
  "artifact": {
    "url": "https://example.invalid/releases/com.example.plugin-1.0.0.spsplugin",
    "sha256": "lowercase-hex",
    "sizeBytes": 123456
  },
  "publisher": { "id": "example-studio", "keyId": "ed25519:example-1" },
  "signature": { "algorithm": "ed25519", "value": "base64" },
  "compatibility": { "sps": ">=0.1.0 <1.0.0", "pluginApi": 1 },
  "visibility": "public",
  "permissionsDigest": "lowercase-hex",
  "publishedAt": "2026-07-23T00:00:00Z"
}
```

서명은 canonicalized release record에서 `signature.value`를 제외한 내용을 대상으로 한다. Owner Host는 서명, artifact SHA-256, `permissionsDigest`, package 안의 manifest 및 파일 hash를 모두 검증해야 한다.

### 4.3 Static package manifest

Registry package는 root `package.json` 외에 root `sps-plugin.json`을 반드시 포함한다. 이 파일은 JavaScript를 import하지 않는 정적 JSON이며, 설치 전 권한 미리보기의 유일한 근거다.

```json
{
  "schemaVersion": 1,
  "plugin": { "id": "sps.team-workplane", "version": "1.0.0", "apiVersion": "1" },
  "runtime": { "manifestEntry": "dist/manifest.js", "manifestSha256": "lowercase-hex" },
  "capabilities": ["agent.tools.register", "ui.page.register"],
  "permissionsDigest": "lowercase-hex"
}
```

`permissionsDigest`는 정렬된 `capabilities` 배열의 canonical JSON SHA-256이다. archive inspector는 정적 manifest, runtime entry 경로, capability 중복을 확인한다. safe extractor는 runtime manifest 파일의 SHA-256도 다시 확인한다. 동적 JavaScript manifest import는 **명시적 enable 단계 전까지 금지**한다.

## 5. 설치와 업데이트 흐름

```text
Registry browse or direct source add
-> select one immutable release
-> verify registry/index and publisher key
-> download with bounded size and SHA-256 check
-> inspect archive and static manifest without executing it
-> compare compatibility and permission delta
-> show source, publisher, risk and Node implications
-> Owner explicitly installs disabled
-> Owner explicitly enables, then Core imports the runtime manifest and compares it with sps-plugin.json
```

### 5.1 현재 Core staging 계약

Core는 기존 Plugin 설치 테이블과 별도로 Owner Host의 관리된 staging root에 Registry package record를 보관한다. Stage에는 `packageRoot`를 포함한 내부 경로가 남지만 API 응답에는 경로를 노출하지 않는다.

| 상태 | 의미 | JavaScript 실행 |
| --- | --- | --- |
| `staged` | archive extractor가 만든 package를 정적 JSON·runtime file hash만 검사한 상태 | 금지 |
| `registered` | Owner가 enable을 눌러 runtime manifest 대조, Plugin DB 등록, lifecycle 진입까지 요청한 상태 | Owner enable에서만 허용 |

Core API는 모두 Instance Admin만 호출할 수 있다.

| API | 역할 |
| --- | --- |
| `GET /api/plugins/registry/stages` | 정적 stage 목록 조회 |
| `POST /api/plugins/registry/stages` | Owner Host가 safe extractor로 만든 package를 static-only stage로 등록 |
| `POST /api/plugins/registry/stages/:stageId/enable` | Owner의 명시적 enable. import 전 source hash를 재검증하고, runtime manifest와 `sps-plugin.json`을 대조한 뒤에만 기존 Plugin lifecycle로 전달 |

`stage` 요청은 임의 폴더를 등록할 수 없다. package root는 Owner Host가 설정한 staging root 안의 일반 디렉터리여야 하며, `sps-plugin.json`, `package.json`, runtime manifest 경로와 SHA-256을 다시 검사한다. import 전 해시 검증이 실패하면 JS module body는 평가되지 않는다.

Desktop은 다음 단계에서 다운로드·archive inspect·safe extract를 수행한 뒤 이 API에 package path를 전달한다. Owner Host는 기본적으로 `PAPERCLIP_HOME/registry-staging`(SPS Desktop에서는 Owner Vault)만 staging root로 사용한다. 즉 현재 Core는 **보관·활성화 경계**를 담당하고, Desktop은 **원격 source와 artifact 취급**을 담당한다. 둘 중 하나만 신뢰해서는 설치가 완료되지 않는다.

업데이트는 같은 흐름을 다시 거친다. 다음 중 하나라도 달라지면 업데이트는 자동 적용하지 않고 새 검토로 전환한다.

- plugin ID 또는 version
- artifact SHA-256, package 파일 목록, worker/UI entrypoint
- publisher key ID 또는 signature
- SPS·Plugin API compatibility
- 권한·외부 도메인·local folder·Node command 선언

### 5.2 Desktop Registry source flow (implemented)

The Desktop Owner stores Registry source definitions in the Owner Vault, not in a shared company database. Source configuration is therefore portable with the Owner Vault and does not grant any Member Node a new capability.

1. `local` sources require the Owner to select a folder. The folder is verified as a Registry before it is saved.
2. `git` and `official` sources require an HTTPS index URL plus a pinned Ed25519 Registry root key. The index signature and every publisher-signed release record are checked before a release is shown.
3. Selecting `Stage for review` re-verifies the source, streams the artifact into an Owner-Vault temporary download with an exact size and SHA-256 check, then uses the existing code-free archive extractor and Core stage API.
4. Downloaded remote archives are removed after extraction. A staged package remains disabled; enable is a separate Owner action and is the first point at which runtime code may be imported.
5. The review queue lists every staged artifact separately. Applying one exact version may install a new plugin, update an installed plugin, or roll an installed plugin back to an earlier verified version. No catalog refresh or source update performs this action automatically.

When an existing plugin is replaced, Core stops its active worker first, verifies the selected stage again, persists both the manifest and resolved package path together, and starts the reviewed version through the normal lifecycle. A capability expansion remains pending for the normal generic upgrade API; the Registry queue can apply it only because the Owner explicitly reviews and confirms the exact staged artifact.

Current Desktop UI: `SPS Desktop > Manage Plugin Registries...` opens the source list, local/remote source form, verified release catalog, disabled stage action, review queue, and explicit apply confirmation. Marketplace discovery, reviews, payment, entitlement, and automatic updates remain out of scope.

### 5.3 Authoring Kit release flow (implemented)

`sps-plugin` is the authoring-side complement to the Desktop Registry flow. It produces no trust bypass: `init` creates a minimal Core-compatible manifest and worker entry, `validate` performs static checks, `pack` refuses symlinks and likely secret files, `keygen` creates Ed25519 keys, `release` signs the immutable artifact tuple, and `registry-index` signs the catalog root. `publish-local` packages one source tree into an explicit local Registry, writes a new immutable release record, and re-signs the index without copying either private key into the Registry.

The authoring Kit rejects URL-like text in relative Registry paths, URL credentials, fragments, symlinked package entries, and package files likely to contain credentials. A resulting local Registry is verified again by the same Local Registry verifier used by SPS Desktop.

## 6. 보안 불변 조건

1. Registry metadata, Marketplace page, 리뷰, 배지는 어떤 Plugin capability도 부여하지 않는다.
2. `git`과 `official` Registry index는 source에 pin된 root key signature를 통과해야 한다. release publisher key만 바꿔 source 신뢰를 획득할 수 없다.
3. package는 설치 전 실행하지 않으며 archive path traversal, symlink escape, oversized entry, duplicate·case-colliding entrypoint, encrypted·unsupported entry를 거부한다. archive inspector와 실제 extractor는 별도 단계에서 같은 크기 경계를 다시 확인한다.
4. package는 Core 또는 다른 Plugin의 source tree를 수정하는 방식으로 설치될 수 없다.
5. 위험 권한이 있는 package는 설치 후에도 기본 비활성 상태다.
6. Node command, local CLI, local MCP, Workspace write는 해당 Node의 소유자 정책과 Agent Runner Grant를 모두 통과해야 한다.
7. Registry advisory는 경고·비활성화 제안만 할 수 있다. 원격 서비스가 이미 설치된 코드를 조용히 교체·삭제·실행하지 않는다.
8. offline mode에서는 마지막으로 검증한 release record와 local policy만 사용한다. 유료 entitlement의 offline cache·만료 규칙은 구매 전에 표시한다.

현재 Core의 기존 `POST /api/plugins/install`은 Registry 설치 경로가 아니다. 이 API는 로컬 개발 Plugin 편의를 위해 build recovery와 JavaScript manifest import를 수행할 수 있으므로, Registry package에는 사용할 수 없다. Registry는 static manifest 검증과 staging extractor를 통과한 package만 review queue에 보관하며, 이 경로는 Owner apply 전에는 dynamic import·worker spawn·plugin migration을 수행하지 않는다.

## 7. Marketplace 단계

### Pilot

- 공식·서명됨·검증됨 표시
- 플러그인 설명, 문서, 버전 이력, 권한 요약
- 공개 무료와 링크 전용 배포
- 게시자 프로필과 신고·advisory 연결

### 거래 단계

거래는 Marketplace가 entitlement를 발급하고 Desktop이 entitlement 상태를 읽는 방식으로 추가한다. `paid` release도 동일한 artifact hash·publisher signature·권한 검토를 사용한다.

아직 확정하지 않는 항목:

- 결제 공급자와 지역별 세금 처리
- 판매 수수료와 정산 주기
- 환불·분쟁·콘텐츠 심사 정책
- 기업용 Registry federation과 SSO
- entitlement의 offline 유예 기간

## 8. 구현 순서와 완료 기준

1. SPS Extension Profile의 Core capability 호환 표와 conformance suite를 고정한다.
2. Plugin Kit의 package, manifest, inspect, validate lifecycle을 검증한다.
3. 이 문서의 Registry schema validator, local fixture, package archive inspector를 구현한다.
4. GitHub-backed static Registry와 official Registry fixture에서 같은 release를 검증한다.
5. Owner Host Core에 static manifest 대조와 Registry disabled staging API를 추가한다. Desktop의 archive safe extractor와 연결해 실제 package를 staging root에 생성한다.
6. Desktop에 Registry source 관리, 설치 전 검토, staged package enable 화면을 추가한다.
7. 실제 사용자와 공식 example plugin으로 설치·업데이트·rollback E2E를 반복한다.
8. 그 결과를 바탕으로 Marketplace Pilot을 연다.

Marketplace는 1~7이 반복 E2E에서 안정적이기 전에는 출시하지 않는다.
