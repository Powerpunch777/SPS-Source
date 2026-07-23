# SPS Plugin Platform

SPS Plugin Platform은 Core plugin SDK를 대체하지 않는다. SPS 제품이 플러그인을 만들고 공유할 때 필요한 Profile, package, Registry, Marketplace 경계를 Core의 실제 manifest·capability·lifecycle 위에서 표준화한다.

## 현재 구현

- `profile/`: SPS Extension Profile v1 conformance 검사
- `registry/`: release record 서명·무결성·Local Registry 검사

## 아직 구현하지 않은 범위

- `.spsplugin` archive 생성과 안전한 압축 해제
- GitHub·official Registry 네트워크 source adapter
- Owner Host 설치·활성화·rollback 연동
- Desktop Registry 관리·설치 검토 UI
- Marketplace catalog, entitlement, 결제와 정산

## 검사

```powershell
cd .\sps-server\plugin-platform
npm test
```

제품·보안·배포 결정은 [Plugin Registry 및 Marketplace 계약](../120-sps-plugin-registry-and-marketplace-contract-ko.md)을 따른다.
