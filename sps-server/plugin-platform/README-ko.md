# SPS Plugin Platform

이 디렉터리는 SPS Core가 제공하는 플러그인 개발 기반의 현재 compatibility tooling이다. 제품 경계는 [현재 Core/Plugin 계약](../docs/current/CORE-PLUGIN-BOUNDARY-ko.md)을 따른다.

이 코드는 제품의 업무 방식이나 사람 권한을 정하지 않는다. manifest, package, Catalog/Registry record, source 검사, 서명, archive 검증 같은 제작·배포 기반만 제공한다.

## 현재 구현

- `profile/`: SPS Extension Profile v1 conformance 검사
- `registry/`: release record·Registry index 서명, archive 검사·안전한 압축 해제, local source 검사
- `authoring/`: 실행 없는 source 검사, 최소 Host RPC lifecycle Worker, `.spsplugin` package 생성, Ed25519 key 생성, release record·Registry index 서명, 서명된 catalog metadata, local Registry 발행
- `sps-plugin` CLI: `init`, `validate`, `inspect`, `pack`, `keygen`, `release`, `registry-index`, `publish-local`
- SPS Desktop: 연결한 Catalog source, remote signature 검증, 설치 상태, update/rollback lifecycle
- `templates/github-static-registry-publish.yml`: GitHub Actions Secret으로만 key를 읽어 정적 Registry release를 수동 발행하는 템플릿

`sps-plugin init`이 만드는 시작 Worker는 의존성 없이 `initialize`·`health`·`shutdown`만 처리한다. 따라서 생성 직후에도 패키지 설치와 Host lifecycle 검증은 가능하지만, Tool·UI·Automation 같은 실제 기능을 추가할 때는 SDK 기반 Worker를 bundle하고 정적 manifest의 capability·hash를 함께 갱신해야 한다.

## 아직 구현하지 않은 범위

- Test Kit의 mock project·Agent·Room lifecycle harness
- Plugin Discovery & Builder의 manifest form, code diff, local test UI
- 공식 Catalog source와 실제 사용자 반복 E2E
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
node .\cli\sps-plugin.mjs inspect .\my-plugin
node .\cli\sps-plugin.mjs pack .\my-plugin --out .\release\my-plugin.spsplugin
node .\cli\sps-plugin.mjs inspect .\release\my-plugin.spsplugin
node .\cli\sps-plugin.mjs keygen --private .\keys\publisher-private.pem --public .\keys\publisher-public.pem
node .\cli\sps-plugin.mjs keygen --private .\keys\registry-root-private.pem --public .\keys\registry-root-public.pem
node .\cli\sps-plugin.mjs publish-local .\my-plugin --registry .\team-registry --registry-id io.example.team --display-name "Example Team Registry" --publisher-id example-studio --publisher-key-id ed25519:example-publisher --publisher-private-key .\keys\publisher-private.pem --root-key-id ed25519:example-root --root-private-key .\keys\registry-root-private.pem --catalog-name "My Plugin" --summary "What this plugin does." --docs-url "https://docs.example.com/my-plugin" --publisher-name "Example Studio" --publisher-url "https://example.com"
node .\cli\sps-plugin.mjs inspect .\team-registry
```

`publish-local`은 package·release record·Registry index를 한 번에 생성하거나 갱신한다. `--catalog-name`, `--summary`, `--docs-url`은 release signature에 포함되는 표시 정보이고, `--publisher-name`과 `--publisher-url`은 Registry root signature에 포함되는 게시자 profile이다. 모두 선택 사항이며, 사람 권한 정책을 바꾸지 않는다. 기존 release는 덮어쓰지 않으며, 기존 index를 갱신할 때는 같은 Registry root key 서명을 다시 검증한다. 개인 키는 source tree와 Registry에 올리지 않는다.

## 배포 파일 선택

`package.json`의 선택적 `files` 배열은 `.spsplugin`에 넣을 파일을 제한한다. SPS는 서명 대상을 예측 가능하게 유지하기 위해 글로브가 아닌 실제 파일 경로 또는 폴더 경로만 허용한다. `package.json`과 `sps-plugin.json`은 항상 함께 포함되고, `sps-plugin.json.runtime.manifestEntry`와 그 manifest가 참조하는 UI·Worker 파일도 `files`에 명시해야 한다.

```json
{
  "files": [
    "dist/manifest.js",
    "dist/worker.js",
    "dist/ui"
  ]
}
```

`dist/*.js`, `../outside`, 빈 경로처럼 포함 범위를 모호하게 만드는 값은 검증 단계에서 거부된다. `files`를 생략하면 기존 호환성을 위해 source tree 전체를 검사하고 패키징한다.

제품 경계와 개발자 경험은 [현재 Core/Plugin 계약](../docs/current/CORE-PLUGIN-BOUNDARY-ko.md)과 [Plugin Developer Platform](../docs/current/PLUGIN-DEVELOPER-PLATFORM-ko.md)을 따른다.
