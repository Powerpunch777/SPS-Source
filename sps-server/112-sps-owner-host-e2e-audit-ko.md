# SPS Owner Host 실제 E2E 감사

기준일: 2026-07-20

이 문서는 안전한 테스트 회사에서 실행한 SPS Desktop Owner Host의 실제 연결 검증 결과를 기록한다. 학교 프로젝트와 실제 개발 Agent, 프로젝트 파일은 변경하지 않았다.

## 통과한 흐름

1. Owner Host가 로컬 Owner Vault와 기본 메모리 Sidecar를 시작했다.
2. Tailnet HTTPS Team Host와 Google Desktop 인증을 완료했다.
3. SPS Desktop이 컴퓨터 Node를 등록하고, Owner가 Nodes 화면에서 승인했다.
4. Node는 `Active`, `Key verified`, `Online` 상태를 유지했고 Codex CLI와 Agy CLI capability를 보고했다.
5. Codex CLI를 사용하는 테스트 Agent에만 Node 실행 권한을 부여하고 Primary Node로 바인딩했다.
6. Hub가 Agent 명령을 Node로 전달했고, Node의 실제 Codex CLI가 실행하여 `SPS_NODE_E2E_PASS`를 반환했다.
7. stdout, stderr, 종료 코드, 완료 시간이 Hub의 Node command 기록으로 되돌아왔다.
8. 한글이 포함된 실제 작업 폴더를 SPS Desktop 프로필에 저장한 뒤, 같은 Node가 `SPS_UNICODE_WORKSPACE_PASS` 명령을 성공적으로 실행했다.

## 이번에 보완한 Desktop 동작

- 상태 화면이 갱신될 때마다 Windows 시작프로그램 API를 동기 호출하지 않는다. 시작 시 한 번만 캐시하므로 상태 조회가 Node 실행을 멈추지 않는다.
- Node에서 명령이 실패하면, 토큰이나 API 키를 노출하지 않는 범위에서 작업 폴더, Codex 프로필, 승인된 runtime 관련 오류를 상태 화면에 남긴다.
- Desktop 상태 IPC는 설정 객체를 필요한 공개 필드로만 복사해 반환한다. 로컬 비밀값과 내부 객체가 UI 경계를 넘지 않는다.

## 아직 남은 실제 기기 검증

- 두 번째 Windows 컴퓨터에 최신 SPS Desktop을 설치하고 Google 인증, 초대 수락, Node 등록, Owner 승인, Agent grant를 실제 사용자 흐름으로 반복한다.
- 두 번째 컴퓨터의 Codex CLI와 설치되어 있는 로컬 AI(Ollama 또는 LM Studio)를 capability scan으로 확인한다.
- 프로젝트별 폴더 선택 UI에서 한글 경로를 매핑하는 클릭 흐름은 두 번째 컴퓨터 파일 선택기에서도 한 번 확인한다. Desktop 프로필과 Node 실행기 자체의 한글 경로 처리는 이미 통과했다.

## 현재 외부 조건

노트북은 Tailnet에서 보이지만 OpenSSH 포트가 응답하지 않아 원격 설치와 실행 검증을 아직 시작하지 못했다. 노트북의 OpenSSH 서비스와 방화벽이 복구되면 이 문서의 남은 항목을 같은 테스트 회사에서 이어서 확인한다.
