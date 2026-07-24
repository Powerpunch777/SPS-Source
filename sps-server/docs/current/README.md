# SPS 현재 기준 문서

이 폴더는 SPS의 **현재 제품 결정**만 모으는 진입점이다. 구현 로그와 과거 설계는 보존하되, 새 기능과 릴리스 판단은 여기와 루트 `DOCUMENTATION.md`를 먼저 따른다.

| 문서 | 용도 |
| --- | --- |
| [PRODUCT-SCOPE.md](PRODUCT-SCOPE.md) | 1차 출시 범위, 기능 상태, 보류 범위 |
| [`../../114-sps-product-and-plugin-platform-contract-ko.md`](../../114-sps-product-and-plugin-platform-contract-ko.md) | Core와 확장 계층의 제품 계약 |
| [`../../120-sps-plugin-registry-and-official-extensions-contract-ko.md`](../../120-sps-plugin-registry-and-official-extensions-contract-ko.md) | 공식 확장 기능과 Registry 설치 경계 |

## 기록 보존 원칙

- `../../NNN-*.md`: 구현·감사·운영 기록. 현재 계약이 아닐 수 있다.
- `../adr/`: 현재 제품 결정을 변경한 이유를 짧게 남기는 위치다.
- `../archive/`: 나중에 물리적으로 이동하는 역사 문서의 목적지다. 링크 안정성을 위해 이번 단계에서는 기존 번호 문서를 옮기지 않는다.
