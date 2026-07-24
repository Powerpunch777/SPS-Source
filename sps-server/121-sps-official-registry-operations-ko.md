# SPS Official Registry 운영 절차

## 목적

SPS 공식 Registry는 `https://raw.githubusercontent.com/Powerpunch777/SPS-Official-Extensions/main/registry.json`에서 제공하는 정적 release index다. 커뮤니티 Marketplace의 검색·리뷰·결제 서비스가 아니라, SPS Desktop Official Extensions가 서명된 플러그인 release를 확인하고 disabled stage로 가져오기 위한 배포 채널이다.

SPS Desktop에는 `io.sps.official` source와 root public key가 기본 내장되어 있으므로 Owner가 같은 source를 수동 추가하거나 제거할 수 없다. 공식 index는 제품 source와 분리된 `Powerpunch777/SPS-Official-Extensions` 공개 레포에서 제공한다. 이 URL은 사용자에게 노출되는 일반 설정값이 아니며, TLS 검증을 끄거나 인증서 오류를 무시하는 우회는 허용하지 않는다.

Registry 파일은 `Powerpunch777/SPS-Official-Extensions`에만 저장된다. 제품 source와 Registry artifact를 분리하므로, 제품 레포를 비공개로 전환해도 Desktop의 official source는 계속 읽을 수 있다.

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
- `SPS_OFFICIAL_REGISTRY_TOKEN`: `Powerpunch777/SPS-Official-Extensions`에만 Contents 읽기·쓰기를 허용한 fine-grained token

공개 key는 Secret이 아니다. 첫 발행 뒤 GitHub Actions summary가 출력하는 root key ID와 public key를 SPS Desktop의 Registry source에 한 번만 고정한다.

## 공식 release 발행

1. 해당 플러그인 source의 `package.json`, `sps-plugin.json`, runtime manifest hash와 version을 검토한다.
2. GitHub Actions의 `Publish SPS Official Registry`를 수동 실행한다.
3. source path, 표시명, 요약, HTTPS 문서 URL을 입력한다.
4. Workflow가 package·release record·`registry.json`을 만들고 `inspect`로 다시 검증한다.
5. 정상일 때만 `Powerpunch777/SPS-Official-Extensions` 변경을 commit·push한다.
6. `https://raw.githubusercontent.com/Powerpunch777/SPS-Official-Extensions/main/registry.json`이 정상 HTTPS 응답하는지 확인한다.
7. SPS Desktop의 기본 `SPS Official Registry` source에서 새 release가 보이는지 확인한다. Root key와 source ID는 앱에 내장되어 있으므로 수동 입력하지 않는다.
8. Desktop에서 source browse → stage → explicit enable → update → rollback을 각각 한 번 검증한다.

## 운영 규칙

- 같은 plugin ID와 version의 package·release record는 절대 다시 쓰지 않는다.
- 권한이 달라지면 새 version을 발행하고 Desktop의 explicit review를 거친다.
- Root key 교체는 새 key ID와 새로운 Desktop source 등록을 동반한다. 기존 root key를 같은 ID로 바꾸지 않는다.
- `Publish SPS Official Registry`는 normal push가 아닌 수동 실행만 가능하다.
- 공식 Registry는 결제·entitlement·자동 enable 권한을 갖지 않는다.

## 향후 Community Marketplace 검토 조건

실제 공개 Registry에서 최소 하나의 유효 plugin release가 위 절차로 발행되고, 두 대 이상의 SPS Desktop에서 source 검증과 stage·enable·update·rollback이 반복 재현된 뒤에만 Community Marketplace Pilot을 검토한다. 이는 1차 출시 범위가 아니다.
