# SPS 레포 구성과 Core 경계

## 현재 구조

SPS는 하나의 제품이지만, 공개해야 하는 연결부와 보호해야 하는 구현을 다른
저장소에 둔다. `SPS-Core`는 이미 `external/sps-core` Git submodule로 분리되어
있으며, 제품 레포는 호환되는 commit을 고정한다.

```text
SPS product (private 예정)
  ├─ external/sps-core -> SPS-Core (private 예정, upstream: Paperclip)
  ├─ Desktop / Owner Host / Node / Default Memory / product UI
  └─ official extension source

SPS Plugin SDK (public) --------> plugin package and Registry contracts
SPS Official Extensions (public) -> signed official extension artifacts
SPS Desktop Releases (public) ---> signed Windows installers and latest.yml
```

## 레포별 책임

| 레포 | 공개 상태 목표 | 포함하는 것 | 포함하지 않는 것 |
| --- | --- | --- | --- |
| `SPS` | 비공개 | SPS Desktop, Owner Host, Node, 제품 UI, 배포, 공식 확장 source | 사용자 Vault, 실제 API 키, 공개 SDK 배포물 |
| `SPS-Core` | 비공개 | 범용 Agent runtime, DB, auth, plugin lifecycle, upstream 동기화 | 제품별 업무 규칙, 사용자 프로젝트, 비공개 키 |
| `sps-plugin-sdk` | 공개 | package·Registry·conformance CLI | Core·Desktop·Owner Host 구현 |
| `SPS-Official-Extensions` | 공개 | 서명된 공식 extension package와 metadata | extension source, Registry 개인 키 |
| `SPS-Desktop-Releases` | 공개 | 서명된 installer·blockmap·`latest.yml` | 제품 source, 사용자 데이터 |

## Core와 제품의 경계

Core는 일반적인 Agent 플랫폼 능력만 가진다. 제품이 어떤 조직 구조, Room 흐름,
Memory 전략, 화면, 배포 방식을 쓰는지는 `SPS` 제품 레포가 정한다.

- Product -> Core: HTTP API, 설정, package된 runtime, version-pinned submodule을 사용한다.
- Product -> public SDK: plugin package와 Registry 계약만 사용한다.
- Public artifact -> Product: 역방향 source 의존을 만들지 않는다.
- Core 내부 `node_modules`, DB driver, private service 파일을 Product script가 직접 import하지 않는다.

`sps-room-chat`이 현재 Core의 Plugin SDK를 file dependency로 참조하는 것은
동일한 private product build 안의 호환 계약이다. 외부 개발자용 runtime SDK는
community plugin을 열기 전에 별도 versioned package로 추출한다. 1차 출시는
Official Extensions만 제공하므로 이 추출을 서두르지 않는다.

## 비공개 전환 준비

`0.4.19` 브리지 release가 모든 설치 앱을 새 Release channel로 옮긴 뒤 다음을
수행한다.

1. `SPS`와 `SPS-Core`를 같은 시점에 private으로 전환한다.
2. `SPS` Actions Secret `SPS_SOURCE_READ_TOKEN`에 두 private 레포의 Contents
   Read만 허용한 fine-grained token을 저장한다.
3. CI는 token이 있으면 private submodule을 읽고, 전환 전에는 기본
   `github.token`으로 계속 동작한다.
4. `SPS_DESKTOP_RELEASES_TOKEN`은 bridge 뒤 `SPS-Desktop-Releases`만 쓰도록
   축소한다.
5. `SPS_OFFICIAL_REGISTRY_TOKEN`은 `SPS-Official-Extensions`만 쓰도록 유지한다.

과거 공개 commit을 이미 받은 사람의 사본까지 회수할 수는 없다. 이 절차의 목적은
새 구현과 후속 제품 개발을 비공개 경계 안에서 지속하는 것이다.

## 완료 기준

- Product와 Core는 함께 private이어도 CI·Docker·Desktop packaging이 submodule을 읽는다.
- public SDK·extension artifact·installer channel은 제품 source를 참조하지 않는다.
- Product source에 특정 사용자 데이터나 단발성 운영 DB repair가 남지 않는다.
- 새 Core 변경은 generic runtime 계약인지 SPS 제품 정책인지 먼저 분류한다.
