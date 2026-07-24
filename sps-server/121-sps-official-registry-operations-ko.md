# SPS Official Registry 운영 절차

## 목적

SPS 공식 Registry는 `https://redongames.com/registry/registry.json`에서 제공하는 정적 release index다. Marketplace의 검색·리뷰·결제 서비스가 아니라, SPS Desktop이 서명된 플러그인 release를 확인하고 disabled stage로 가져오기 위한 배포 채널이다.

SPS Desktop에는 `io.sps.official` source와 root public key가 기본 내장되어 있으므로 Owner가 같은 source를 수동 추가하거나 제거할 수 없다. 현재 GitHub Pages의 `redongames.com` TLS 인증서 발급이 완료되기 전까지 Desktop은 같은 서명 계약을 유지하는 GitHub raw index를 사용한다. 이 임시 URL은 사용자에게 노출되는 일반 설정값이 아니며, 인증서가 준비되면 source catalog의 URL만 공식 도메인으로 되돌린다. TLS 검증을 끄거나 인증서 오류를 무시하는 우회는 허용하지 않는다.

Registry 파일은 이 저장소의 `sps-server/website/registry/`에 저장된다. 기존 GitHub Pages 배포가 `sps-server/website/` 전체를 배포하므로, 별도 서버·DB·Cloudflare Worker를 추가하지 않는다.

## 최초 1회 설정

개인 키는 Repository, Registry 폴더, 채팅, issue에 올리지 않는다. 신뢰할 수 있는 로컬 경로에서 key를 만들고, 백업은 비밀번호 관리자 또는 암호화된 개인 저장소에 보관한다.

```powershell
Set-Location "C:\Users\young\Documents\AGENT 구축\sps-server\plugin-platform"
$keyRoot = Join-Path $env:USERPROFILE ".sps\registry-keys"
New-Item -ItemType Directory -Force $keyRoot | Out-Null

node .\cli\sps-plugin.mjs keygen --private "$keyRoot\sps-official-publisher-private.pem" --public "$keyRoot\sps-official-publisher-public.pem"
node .\cli\sps-plugin.mjs keygen --private "$keyRoot\sps-official-root-private.pem" --public "$keyRoot\sps-official-root-public.pem"
```

GitHub 저장소 `Powerpunch777/SPS`의 **Settings > Secrets and variables > Actions**에 다음 Secret을 추가한다.

- `SPS_REGISTRY_PUBLISHER_PRIVATE_KEY`: `sps-official-publisher-private.pem`의 전체 내용
- `SPS_REGISTRY_ROOT_PRIVATE_KEY`: `sps-official-root-private.pem`의 전체 내용

공개 key는 Secret이 아니다. 첫 발행 뒤 GitHub Actions summary가 출력하는 root key ID와 public key를 SPS Desktop의 Registry source에 한 번만 고정한다.

## 공식 release 발행

1. 해당 플러그인 source의 `package.json`, `sps-plugin.json`, runtime manifest hash와 version을 검토한다.
2. GitHub Actions의 `Publish SPS Official Registry`를 수동 실행한다.
3. source path, 표시명, 요약, HTTPS 문서 URL을 입력한다.
4. Workflow가 package·release record·`registry.json`을 만들고 `inspect`로 다시 검증한다.
5. 정상일 때만 `sps-server/website/registry/` 변경을 commit·push한다. Pages 배포가 이어서 실행된다.
6. `https://redongames.com/registry/registry.json`이 정상 TLS 인증서로 HTTPS 응답하는지 확인한다. 인증서 발급 전에는 Desktop의 내장 GitHub raw fallback이 계속 사용되므로, 오류를 무시하도록 Desktop을 바꾸지 않는다.
7. SPS Desktop의 기본 `SPS Official Registry` source에서 새 release가 보이는지 확인한다. Root key와 source ID는 앱에 내장되어 있으므로 수동 입력하지 않는다.
8. Desktop에서 source browse → stage → explicit enable → update → rollback을 각각 한 번 검증한다.

## 운영 규칙

- 같은 plugin ID와 version의 package·release record는 절대 다시 쓰지 않는다.
- 권한이 달라지면 새 version을 발행하고 Desktop의 explicit review를 거친다.
- Root key 교체는 새 key ID와 새로운 Desktop source 등록을 동반한다. 기존 root key를 같은 ID로 바꾸지 않는다.
- `Publish SPS Official Registry`는 normal push가 아닌 수동 실행만 가능하다.
- 공식 Registry는 결제·entitlement·자동 enable 권한을 갖지 않는다.

## Marketplace Pilot 진입 조건

실제 공개 Registry에서 최소 하나의 유효 plugin release가 위 절차로 발행되고, 두 대 이상의 SPS Desktop에서 source 검증과 stage·enable·update·rollback이 반복 재현된 뒤에 Marketplace Pilot을 연다.
