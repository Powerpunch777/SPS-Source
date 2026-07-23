# SPS Plugin Platform

SPS Plugin Platform은 Core plugin SDK를 대체하지 않는다. SPS 제품이 플러그인을 만들고 공유할 때 필요한 Profile, package, Registry, Marketplace 경계를 Core의 실제 manifest·capability·lifecycle 위에서 표준화한다.

## 현재 구현

- `profile/`: SPS Extension Profile v1 conformance 검사
- `registry/`: release record·Registry index 서명, archive 검사·안전한 압축 해제, local source 검사
- `authoring/`: 실행 없는 source 검사, 최소 Host RPC lifecycle Worker, `.spsplugin` package 생성, Ed25519 key 생성, release record·Registry index 서명, 서명된 catalog metadata, local Registry 발행
- `sps-plugin` CLI: `init`, `validate`, `pack`, `keygen`, `release`, `registry-index`, `publish-local`
- SPS Desktop: Owner Vault의 trusted Registry source 관리, remote signature 검증, disabled stage, review queue, 명시적 apply

`sps-plugin init`이 만드는 시작 Worker는 의존성 없이 `initialize`·`health`·`shutdown`만 처리한다. 따라서 생성 직후에도 패키지 설치와 Host lifecycle 검증은 가능하지만, Tool·UI·Automation 같은 실제 기능을 추가할 때는 SDK 기반 Worker를 bundle하고 정적 manifest의 capability·hash를 함께 갱신해야 한다.

## 아직 구현하지 않은 범위

- Test Kit의 mock project·Agent·Room lifecycle harness
- Plugin Studio의 manifest form, code diff, local test UI
- 공식 example Registry 운영과 실제 사용자 반복 E2E
- 게시자 프로필, advisory·신고, entitlement, 결제와 정산

## 검사

```powershell
cd .\sps-server\plugin-platform
npm test
```

## 제작자 빠른 시작

```powershell
cd .\sps-server\plugin-platform
node .\cli\sps-plugin.mjs init .\my-plugin --id com.example.my-plugin --package @example/my-plugin
node .\cli\sps-plugin.mjs validate .\my-plugin
node .\cli\sps-plugin.mjs pack .\my-plugin --out .\release\my-plugin.spsplugin
node .\cli\sps-plugin.mjs keygen --private .\keys\publisher-private.pem --public .\keys\publisher-public.pem
node .\cli\sps-plugin.mjs keygen --private .\keys\registry-root-private.pem --public .\keys\registry-root-public.pem
node .\cli\sps-plugin.mjs publish-local .\my-plugin --registry .\team-registry --registry-id io.example.team --display-name "Example Team Registry" --publisher-id example-studio --publisher-key-id ed25519:example-publisher --publisher-private-key .\keys\publisher-private.pem --root-key-id ed25519:example-root --root-private-key .\keys\registry-root-private.pem --catalog-name "My Plugin" --summary "What this plugin does." --docs-url "https://docs.example.com/my-plugin"
```

`publish-local`은 package·release record·Registry index를 한 번에 생성하거나 갱신한다. `--catalog-name`, `--summary`, `--docs-url`은 선택 사항이며 release signature에 포함되는 표시 정보다. 기존 release는 덮어쓰지 않으며, 기존 index를 갱신할 때는 같은 Registry root key 서명을 다시 검증한다. 개인 키는 source tree와 Registry에 올리지 않는다.

제품·보안·배포 결정은 [Plugin Registry 및 Marketplace 계약](../120-sps-plugin-registry-and-marketplace-contract-ko.md)을 따른다.
