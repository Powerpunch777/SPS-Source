# SPS Node Registry Phase B

## 목적

이 단계는 원격 CLI 실행 전에 "어느 컴퓨터가 어떤 Agent를 실행할 수 있는가"를 Hub가 강제하는 기반을 만든다. Node를 등록하거나 Agent에 연결하는 행위만 다루며, 이 단계의 Node는 Hub로부터 셸 명령을 받지 않는다.

## 보안 경계

- Hub에는 Node의 공개키, 표시 이름, OS, SPS 버전, 실행기 종류와 모델 이름만 보관한다.
- 개인키, Codex/Agy 로그인 정보, API 키, 로컬 경로, 셸 환경은 Node PC 밖으로 전송하지 않는다.
- 등록 Node는 기본 `pending`이다. Owner/Admin만 `active`로 승인하거나 `revoked`로 폐기할 수 있다.
- Agent는 승인된 Node에 대한 활성 실행 허용이 있어야만 기본 실행 Node로 바인딩할 수 있다.
- 한 Agent에는 기본 실행 Node를 하나만 둔다. 이후 Task 실행 요청도 이 바인딩을 검증한다.

## 데이터 모델

| 테이블 | 역할 |
| --- | --- |
| `sps_nodes` | Node 소유자, 공개키, 상태, 공개 능력, 승인 기록 |
| `sps_node_agent_grants` | Node가 특정 Agent를 실행해도 된다는 Owner/Admin 허용 |
| `sps_agent_node_bindings` | Agent의 단일 기본 실행 Node |

## 단계 순서

1. 등록·조회·승인·폐기 API를 구현한다. 완료
2. Agent 실행 허용과 기본 Node 바인딩 API를 구현한다. 완료
3. Company Settings에 Node와 Agent 바인딩 화면을 제공한다. 완료
4. SPS Desktop Node가 기기 키로 인증하고 heartbeat를 보내도록 만든다.
5. 서명된 단기 Task 실행 요청과 결과 보고를 연결한다.

## 현재 구현 상태

- Hub는 Node를 기본 `pending`으로 등록하고 Owner/Admin만 `active` 또는 `revoked`로 바꿀 수 있다.
- Node는 Ed25519 공개키를 등록하고, 개인키로 서명한 heartbeat가 Hub에서 검증된 뒤에만 승인될 수 있다.
- heartbeat nonce는 짧은 유효기간 동안 한 번만 허용되어 같은 서명 패킷의 재전송을 거절한다.
- `active` Node에만 Agent 실행 허용을 줄 수 있고, 그 허용이 있는 Agent만 해당 Node를 기본 실행 Node로 바인딩할 수 있다.
- Node를 폐기하면 관련 Agent 허용과 기본 바인딩을 함께 제거한다.
- `Company Settings > Nodes`에서 위 상태, 공개 capability, Agent 허용, 기본 바인딩을 관리한다.
- 이 단계는 아직 원격 명령을 실행하지 않는다. 다음 단계의 Desktop 로그인, 보안 저장소, 기기 연결 유지가 완료되기 전에는 Hub가 Node에 Task를 전달할 수 없다.

## 완료 기준

서로 다른 두 사용자 Node가 같은 회사에 등록됐을 때, 승인되지 않은 Node에는 Agent를 바인딩할 수 없고, 허용되지 않은 Agent도 실행 Node로 바인딩할 수 없어야 한다.
