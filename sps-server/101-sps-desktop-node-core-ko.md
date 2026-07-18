# SPS Desktop Node Core

## 목적

Electron 화면과 실제 CLI 실행기를 분리하기 위해, SPS Desktop이 공통으로 사용할 로컬 Node 프로토콜 코어를 먼저 만든다. 이 코어는 Hub와 통신하지만 Hub에 개인키나 CLI 로그인 정보를 전달하지 않는다.

## 현재 구현

경로: `sps-server/desktop-node`

- Ed25519 기기 키 쌍 생성
- SPS Node heartbeat 문구 생성과 서명
- Codex CLI, Agy CLI, Ollama, LM Studio의 공개 capability 탐지
- Hub Node 등록 API 호출
- Hub heartbeat API 호출
- Node 코어와 실제 SPS Hub의 등록 → 키 검증 → 승인 통합 검증

공개 capability에는 실행기 이름과 버전만 포함한다. 실행 파일 경로, Codex/Agy 로그인, API 키, 프로젝트 파일은 포함하지 않는다.

## 아직 만들지 않은 것

- Electron 앱 셸과 Windows 설치 프로그램
- Windows DPAPI/Credential Manager 기반 개인키·로그인 토큰 보관
- 계정 로그인과 초대코드 수락을 Desktop으로 넘기는 device-auth 흐름
- Node의 주기 heartbeat, 오프라인 감지, 진단 화면
- 서명된 Task 전달, CLI 실행, 취소, 로그, Room 보고

## 다음 구현 순서

1. Electron main/preload/renderer 셸을 만들고, renderer에 파일 시스템·셸 권한을 주지 않는다.
2. Hub 계정 로그인과 초대코드 수락을 완료하는 Desktop device-auth 교환을 만든다.
3. Electron main process가 OS 보안 저장소에 Node 개인키와 device token을 보관한다.
4. Node core를 이용해 capability 탐지, 등록, heartbeat를 앱 화면에서 실행한다.
5. 그 뒤에야 승인된 Agent와 Node에 한정한 서명 Task 실행 프로토콜을 연결한다.
