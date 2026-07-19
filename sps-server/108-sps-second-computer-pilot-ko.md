# SPS 두 번째 컴퓨터 파일럿

이 문서는 실제 협업자 컴퓨터에서 SPS Desktop Node를 처음 연결할 때의 점검 순서다.
Hub는 [https://app.redongames.com](https://app.redongames.com)이며, CLI 로그인 정보·API 키·로컬 모델·프로젝트 파일은 각 컴퓨터 밖으로 전송되지 않는다.

## 준비물

- Owner/Admin: SPS Hub에 Google 로그인할 수 있는 계정
- 협업자: 자신의 Windows 컴퓨터, Google 계정, SPS Desktop 설치 파일
- 실행할 Agent와 연결할 프로젝트의 로컬 Git 작업 폴더
- 협업자 컴퓨터에 로그인되어 있거나 설치된 실행기: Codex CLI, Agy CLI, Ollama 또는 LM Studio 중 필요한 것

## 연결 순서

1. Owner/Admin이 **Company settings > Invites**에서 `Operator` 초대를 만든다.
2. 생성 화면에 표시된 `SPS-...` 초대 코드를 협업자에게 전달한다.
3. 협업자는 SPS Desktop을 설치하고 Hub URL `https://app.redongames.com`를 입력한다.
4. 협업자는 SPS Hub의 [초대 참여 화면](https://app.redongames.com/join)에서 초대 코드를 입력하고 자신의 Google 계정으로 로그인해 초대를 수락한다.
5. SPS Desktop에서 회사 선택과 Desktop 연결 승인을 마친다. 이 단계가 끝나면 해당 컴퓨터는 아직 `pending` Node다.
6. 협업자는 프로젝트마다 자신의 로컬 Git 폴더를 연결한다. 프로젝트 ID가 없는 명령은 기본 작업 폴더를 쓰지만, 프로젝트 Task는 반드시 이 명시적 매핑을 사용한다.
7. Owner/Admin은 **Company settings > Nodes**에서 새 Node를 `active`로 승인한다.
8. Owner/Admin은 실제로 실행할 Agent에만 Node grant를 부여하고, 해당 Agent의 기본 Node로 선택한다.

## 확인 Task

1. Lead가 작은 읽기 전용 확인 Task를 만들고 연결한 Agent에 배정한다.
2. Task 실행 로그에 `Starting adapter on SPS Desktop Node ...`가 나타나는지 본다.
3. 협업자의 SPS Desktop이 명령을 받고, 자신의 CLI 또는 로컬 AI를 실행하는지 확인한다.
4. stdout/stderr와 최종 결과가 같은 Task Room에 도착하는지 확인한다.
5. Worker가 완료 또는 blocker를 보고하면, Task를 만든 Lead Room에 결과가 보고되는지 확인한다.

## 정상 상태와 복구

정상 상태는 다음 네 가지가 모두 충족되는 경우다.

- Node 상태가 `active`
- 최근 heartbeat가 있음
- Agent에 Node grant가 있음
- Node capability에 해당 Agent의 실행기 종류가 있음

`pending`이면 Owner/Admin 승인이 필요하다. `offline`이면 협업자 컴퓨터에서 SPS Desktop을 열고 Hub 연결을 복구한다. capability가 없으면 그 컴퓨터에 CLI 또는 로컬 AI를 설치·로그인한 뒤 capability scan을 갱신한다. Agent grant나 기본 Node를 제거하면 그 Node에 남아 있던 대기·실행 중 명령도 실패 처리되므로, 권한 변경은 실행 중인 Task가 없는 때에 한다.

## 보안 확인

- 초대 수락과 Node 실행 권한은 별개다. 초대받은 사람은 자동으로 다른 Agent를 실행할 수 없다.
- Owner/Admin만 Node 승인, grant, 기본 Node 변경을 할 수 있다.
- 각 Node 요청은 해당 컴퓨터의 로컬 Ed25519 키로 서명된다.
- Hub는 프로젝트 ID만 전달하고, Node가 자신에게 연결된 로컬 폴더로 변환한다. 임의 경로 실행은 허용하지 않는다.
- 협업이 끝나면 Node grant, Node 자체, 초대 중 필요한 항목을 revoke할 수 있다.

## 현재 자동 검증 범위

GitHub CI와 로컬 통합 테스트는 Chromium 브라우저에서 Owner가 `SPS-...` 초대 코드를 만들고, 초대 사용자가 그 코드를 입력해 가입하는 흐름을 확인한다. 이어서 Owner가 실제 **Nodes** 화면에서 두 초대 사용자의 독립 SPS Node를 승인하고 각 Agent에 grant를 부여한다. 두 Node가 동시에 자신의 Agent 명령을 실행하고 출력을 회수한 뒤 한 Node를 revoke해 이전 승인으로 되살아나지 않는지도 검증한다. 실제 두 번째 물리 컴퓨터에서는 위 파일럿을 한 번 실행하면 네트워크·Google 로그인·설치 환경까지 포함해 같은 흐름을 확인할 수 있다.
