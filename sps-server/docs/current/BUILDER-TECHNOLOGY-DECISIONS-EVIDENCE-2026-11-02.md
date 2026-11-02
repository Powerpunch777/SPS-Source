# Builder 기술 선정 명세 검증

기록일 2026-11-02. 별도 Builder `f04bda0`에서 Lead의 기술 선정 명세 저장·조회와
읽기 전용 문서를 구현했다. 상세 범위는 공개 Builder의
[기록](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/f04bda0/docs/implementation/TECHNOLOGY-DECISIONS-2026-11-02.md)을 따른다.
Core/SDK는 `55b5d5b` / `316c56f`로 유지했고 Core API/DB migration은 추가하지 않았다.

## 구현과 한계

현재 준비된 Lead만 네 가지 기술 선택과 이유·범위·상호운용·제약·비용·버전·변경 책임자를
기록한다. 실제 설계 기준/명세/Graph revision과 digest·노드 존재를 확인하고 기존 CAS
journal을 재사용한다. 미언급은 미지정이지 자동 금지가 아니다. 명세가 없거나 비어 있는
경우도 조사 완료나 제작 승인이 아니다. 기술 선택과 CTO의 구현 코드 조사는 별개다.

라이선스 검토/문서 조사/통합 시험 주장은 보고 기록이며 독립 검증이 아니다. 근거 참조의
진위나 실제 테스트 통과를 새로 보증하지 않는다. 화면도 이 차이를 표시한다. 기준/Lead/
head 다중 키 원자성은 없고, 저장 후 오류 가능성은 조회로 확인하며 자동 재시도하지 않는다.
이 과거 기록을 실행 권한으로 사용하지 않는다. 불변 Graph의 기술 참조 개정과 Workstream
명세 연결은 아직 후속 작업이며 AC-34/92/93/116 전체 통과를 주장하지 않는다.

## 검증

Node24.22.1 격리 타입/빌드/전체 **267/267**, 공개 SDK CLI validate/test exit0이다.
새 파서6·문서 투영4·도구/복구11·도구 선언 조건1개와 기존 compiled Worker JSONL의
두 도구/provider 왕복을 확인했다. JSONL은 fake Host이며 실제 AI 실행이 아니다.

최종 복사본으로 source Desktop/Host no-AI 시험도 exit0이다. 문서 표시 fixture와
캡처를 확인하고 fixture 제거 뒤 실제 Host의 기술 명세 null을 검사했다. 이것은 실제
Lead 조사/저장이 아니다. mock Identity, Main4/4·출력8개 종료/실패0·임시 데이터 제거다.
기존 공통 시험의 복구 점검은 새 Native LAN 개발/검증의 근거가 아니다.

| 식별 | SHA-256 |
| --- | --- |
| 최종267개+no-AI 앱 복사본 | `e98332f4bb81e64d203bc89bb57963d3c12ebc4e72421d120dc365b67a6e0acb` |
| Worker | `40a14a259a82790c6dbf53cc1fa487d80dc1da47d4a86d51b8cf2ed7a6836b16` |
| 실제 Host UI index.js | `b94b734ebbb34843ea56aa83aff8a4b062bb19356dd401163dacd276e7ffd67e` |

Source Desktop의 `node scripts/smoke-builder-conditional-state-isolated.mjs`를 사용했다.
원시 로그/캡처는 로컬에만 보관한다. 문서 포함 HEAD를 시험 복사본 지문과 동일시하지 않는다.
DEV/설치본/계정/데이터·Tailscale은 유지했고 Marketplace·Preview·자체 LAN은 계속 보류다.

## 다음 단계

실제 Lead 도구 시험, Graph 기술 참조·Workstream 명세와 CTO 배정/수신, CTO 기억과
질문 intake, Worker/QA·Task Packet·GitHub/Runner 검증 근거·납품이 남아 있다.
Core 전체 완료, 실제 Google OAuth·설치본·서명·두 PC·Stable 자격을 증명하지 않는다.
