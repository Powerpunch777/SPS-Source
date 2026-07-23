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

## 5. 설치와 업데이트 흐름

```text
Registry browse or direct source add
-> select one immutable release
-> verify registry/index and publisher key
-> download with bounded size and SHA-256 check
-> inspect archive and manifest without executing it
-> compare compatibility and permission delta
-> show source, publisher, risk and Node implications
-> Owner explicitly installs disabled
-> Owner explicitly enables
```

업데이트는 같은 흐름을 다시 거친다. 다음 중 하나라도 달라지면 업데이트는 자동 적용하지 않고 새 검토로 전환한다.

- plugin ID 또는 version
- artifact SHA-256, package 파일 목록, worker/UI entrypoint
- publisher key ID 또는 signature
- SPS·Plugin API compatibility
- 권한·외부 도메인·local folder·Node command 선언

## 6. 보안 불변 조건

1. Registry metadata, Marketplace page, 리뷰, 배지는 어떤 Plugin capability도 부여하지 않는다.
2. `git`과 `official` Registry index는 source에 pin된 root key signature를 통과해야 한다. release publisher key만 바꿔 source 신뢰를 획득할 수 없다.
3. package는 설치 전 실행하지 않으며 archive path traversal, symlink escape, oversized entry, duplicate entrypoint를 거부한다.
4. package는 Core 또는 다른 Plugin의 source tree를 수정하는 방식으로 설치될 수 없다.
5. 위험 권한이 있는 package는 설치 후에도 기본 비활성 상태다.
6. Node command, local CLI, local MCP, Workspace write는 해당 Node의 소유자 정책과 Agent Runner Grant를 모두 통과해야 한다.
7. Registry advisory는 경고·비활성화 제안만 할 수 있다. 원격 서비스가 이미 설치된 코드를 조용히 교체·삭제·실행하지 않는다.
8. offline mode에서는 마지막으로 검증한 release record와 local policy만 사용한다. 유료 entitlement의 offline cache·만료 규칙은 구매 전에 표시한다.

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
3. 이 문서의 Registry schema validator와 local fixture를 구현한다.
4. GitHub-backed static Registry와 official Registry fixture에서 같은 release를 검증한다.
5. Desktop에 Registry source 관리, 설치 전 검토, disabled install, update preview를 추가한다.
6. 실제 사용자와 공식 example plugin으로 설치·업데이트·rollback E2E를 반복한다.
7. 그 결과를 바탕으로 Marketplace Pilot을 연다.

Marketplace는 1~6이 반복 E2E에서 안정적이기 전에는 출시하지 않는다.
