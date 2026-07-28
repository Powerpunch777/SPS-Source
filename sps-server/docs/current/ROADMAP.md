# SPS Roadmap

## 1. Documentation and product boundary

- 현재 제품 문서를 이 폴더로 정리한다.
- Core가 플러그인 개발 기반이고 업무 방식은 플러그인이라는 경계를 유지한다.

## 2. Plugin Developer Platform

- SPS manifest와 SDK를 Paperclip compatibility bridge에서 독립적인 SPS 공개 계약으로 정리한다.
- UI, state, tool, job, artifact, Node, Connector, Catalog, Test Kit, CLI를 일관된 개발 경험으로 제공한다.
- `Plugin Discovery & Builder`를 첫 Company의 기본 플러그인으로 구현한다.

## 3. Collaboration extensions

- Access Control 플러그인으로 기본 팀 역할과 사용자 -> Agent 접근을 제공한다.
- Team Workplane을 Room/Task/Lead/Worker 경험으로 제공한다.
- Memory와 Connector를 선택적 Provider/플러그인으로 제공한다.

## 4. Development Packs

- Game Development Pack
- App Development Pack
- Web Development Pack
- Plugin Development Pack

각 Pack은 특정 Agent 조직을 Core에 고정하지 않고, 필요한 플러그인·템플릿·Connector를 조합한다.

## 5. Verification and release

- 단일 PC, Owner Host, Member Node, 재시작 복구를 실제 Desktop으로 검증한다.
- SDK와 기본 플러그인 lifecycle을 테스트한다.
- 공개 Marketplace, 판매·정산은 Catalog와 설치 lifecycle이 충분히 검증된 뒤 별도 단계에서 판단한다.
