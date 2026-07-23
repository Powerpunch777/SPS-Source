# SPS Plugin Platform

SPS Plugin Platform은 Core plugin SDK를 대체하지 않는다. SPS 제품이 플러그인을 만들고 공유할 때 필요한 Profile, package, Registry, Marketplace 경계를 Core의 실제 manifest·capability·lifecycle 위에서 표준화한다.

## 현재 구현

- `profile/`: SPS Extension Profile v1 conformance 검사
- `registry/`: release record·Registry index 서명, archive 검사·안전한 압축 해제, local source 검사
- `authoring/`: 실행 없는 source 검사, `.spsplugin` package 생성, Ed25519 key 생성, release record·Registry index 서명
- `sps-plugin` CLI: `init`, `validate`, `pack`, `keygen`, `release`, `registry-index`
- SPS Desktop: Owner Vault의 trusted Registry source 관리, remote signature 검증, disabled stage, review queue, 명시적 apply

## 아직 구현하지 않은 범위

- Test Kit의 mock project·Agent·Room lifecycle harness
- Plugin Studio의 manifest form, code diff, local test UI
- 공식 example Registry 운영과 실제 사용자 반복 E2E
- Marketplace catalog, entitlement, 결제와 정산

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
```

개인 키는 source tree와 Registry에 올리지 않는다. `release`와 `registry-index`는 immutable artifact URL, publisher key, Registry root key를 각각 명시적으로 요구한다.

제품·보안·배포 결정은 [Plugin Registry 및 Marketplace 계약](../120-sps-plugin-registry-and-marketplace-contract-ko.md)을 따른다.
