# Builder CTO Workstream 명세와 수신 기록

기록일 2026-11-02. 별도 Builder `0f3c155`의
[구현/검증 기록](https://github.com/Powerpunch777/SPS-MY-PluginBuilder/blob/0f3c155/docs/implementation/WORKSTREAM-INSTRUCTIONS-2026-11-02.md)을 따른다.
업무 모델은 Builder 소유이며 Core/SDK는 `55b5d5b` / `316c56f` 그대로다. 새 Core API,
DB migration, 공용 실행 큐나 원격 실행기를 추가하지 않았다.

## 확정된 담당 구조

사용자는 Graph 노드 하나에 CTO 한 명을 배정하고, 같은 노드 내부의 병렬 개발은
그 CTO가 Workers에게 맡기기로 확정했다. 다른 CTO의 API/인터페이스 사용은 노드 공동
소유가 아니다. Workstream 배정과 저장된 보드 모두 이 중복을 검사하며 동시 요청도
한 CAS head로 한 소유자만 게시된다. Core에 CTO/Worker 권한을 새로 넣지 않았고,
업무 담당을 실제 파일 접근/프로세스 격리나 실행 승인으로 취급하지 않는다.

## 구현과 검증

Lead가 정확한 설계/기술 명세와 담당 CTO의 독립 세션을 연결한 버전 지시를 저장한다.
해당 CTO의 검증된 Agent/세션만 자신의 명세와 고정된 공통 설계 자료를 읽고 정확한
revision의 수신/이해/준비도 보고를 기록한다. 같은 계정의 Lead 세션도 이를 사칭하지
못한다. 보고의 ready는 실행 시작/검증 완료가 아니다. 실제 세션 지시는 아직 전송하지 않는다.

Node24.22.1 격리 타입/빌드/전체 **300/300**, 공개 SDK CLI validate/test가 exit0이다.
순수 파서11·문서5·도구/복구15·journal2개 및 기존 compiled Worker JSONL 왕복을 포함한다.
JSONL은 fake Host이며 실제 AI 실행이 아니다. immutable published 이력 조회는 staging
자료를 제외하고, 조회 상한에 닿으면 없다고 오인하지 않도록 오류를 반환한다.

같은 복사본의 no-AI source Desktop/Host 시험도 exit0이다. 실제 UI의 대기/준비도
표시 fixture를 확인하고, 제거 후 실제 Host 업무 값 null을 검사했다. 실제 CTO가
응답했다는 증거가 아니다. mock Identity, Main4/4·출력8개 종료/실패0·임시 데이터 제거다.

| 식별 | SHA-256 |
| --- | --- |
| 최종300개+no-AI 앱 복사본 | `f85e4bc368920a5ba9571d08adf03d210bcab51f8bf1d64433257b83cd39617e` |
| Worker | `afe8f0ce2df0d658c45558c62280232642e1cc61f29cc0f5e4029eee5b1205a3` |
| 실제 Host UI index.js | `040ba5c1b14ffa150a8ccf98e20d028504b20252d104add3ea047399f5b6f556` |

명령은 Source Desktop의 `node scripts/smoke-builder-conditional-state-isolated.mjs`다.
원시 로그/캡처는 로컬에 보관하며 문서 포함 HEAD를 복사본 지문과 동일시하지 않는다.

## 미완료와 제한

자동 CTO 지시 전달/실제 모델 수신, 변경 중 취소/계속/재작업 판단, CTO 기억과 질문
intake, Worker/QA·Task Packet·GitHub/Runner 근거·납품과 Graph 담당자/기술 참조 표시는
남아 있다. 이력의 Lead/기준/CTO 변경과 게시 사이에 다중 키 원자성은 없고 유실 응답/
경합은 재조회한다. 이 기록을 실행 capability로 사용하지 않는다. 아직 Task 시스템이
없어 영향 Task/질문 참조의 진위를 독립 확인하지 않으며 인터페이스 이름의 존재도
실제 계약 준수 증거가 아니다. 전체 Builder/AC 완료나 Google OAuth·설치본·두 PC·서명·
Stable 근거가 아니다. 기존 DEV/설치본/계정/데이터·Tailscale은 유지했고 Marketplace·
Preview·자체 LAN 개발과 추가 전용 시험은 보류다.
