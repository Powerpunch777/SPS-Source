# SPS 시작하기

최종 갱신: 2026-07-30

## 준비물

- Windows 10 또는 11 x64 컴퓨터
- SPS Desktop 설치 파일
- SPS Identity에 사용할 Google 계정
- 다른 컴퓨터와 함께 쓸 경우, 각 컴퓨터의 Tailscale 연결

실제 작업은 Official release를 사용한다. Preview는 설치와 첫 실행 확인 전용이다.
채널 차이는 [RELEASE-AND-PREVIEW-POLICY-ko.md](RELEASE-AND-PREVIEW-POLICY-ko.md)를
참조한다.

## 첫 실행

1. SPS Desktop을 설치하고 실행한다.
2. 앱 안에서 Google 계정으로 로그인한다.
3. 메인 컴퓨터라면 **Host 만들기**, 팀의 기존 환경에 들어간다면 **Host 참여하기**를
   선택한다.
4. Workspace를 만들거나 초대받은 Workspace를 연다.
5. 새 Workspace에서 사용할 Initial Assistant를 하나 등록한다.

SPS Workspace는 빈 작업 공간으로 시작한다. 기본 Task 보드, Room, 조직도, Agent
역할, 메모리 정책은 자동으로 생기지 않는다.

## 원하는 작업 방식 고르기

1. Workspace의 Initial Assistant에게 게임 개발, 웹 개발, 앱 개발, 연구, 자동화 등
   원하는 작업 방식을 설명한다.
2. Assistant는 Catalog를 검색하거나 필요한 Plugin의 초안 작성을 도울 수 있다.
3. Host는 **설정 > 플러그인**에서 Plugin의 정보와 호환성을 확인한다.
4. Host가 선택한 Workspace에만 Plugin을 활성화한다.

대화나 추천은 설치 권한이 아니다. Plugin 상태 변경은 항상 Host의 명시적 동작으로
끝난다.

## 팀 컴퓨터 연결

1. Host와 Member 컴퓨터 모두 Tailscale에 연결한다.
2. Host가 SPS에서 전체 초대 코드를 만든다.
3. Member는 자신의 SPS Desktop에서 로그인한 뒤 초대 코드로 참여한다.
4. Member는 자신의 컴퓨터를 Node로 등록하고, Host가 해당 Node를 승인한다.
5. Host는 필요한 Workspace Source와 Runtime만 해당 Node에 연결한다.

Member는 Host의 실제 폴더 경로를 고르거나 바꿀 수 없다. CLI 로그인, API 키,
로컬 AI 모델은 각 Node의 컴퓨터에 남는다.

## 프로젝트 폴더

Host만 로컬 프로젝트 폴더를 Workspace Source로 지정한다. Source는 폴더 사본이
아니라, Host가 허용한 Node에만 제공되는 보호된 접근 경로다. 프로젝트 폴더를 다른
컴퓨터로 옮기거나 Host를 바꾸기 전에는 반드시 Export와 Source 재지정을 준비한다.

## 문제가 생기면

- 로그인 문제: Google 계정, SPS Identity 연결, 시스템 시간, 네트워크를 확인한다.
- Member 연결 문제: Tailscale 상태와 전체 SPS 초대 코드를 확인한다.
- Agent가 보이지 않음: Node 등록·승인과 해당 Runtime의 로컬 로그인을 확인한다.
- Plugin이 보이지 않음: Host가 설치했는지와 Workspace 활성화 상태를 확인한다.
- 데이터 이전: [DATA-AND-RECOVERY-ko.md](DATA-AND-RECOVERY-ko.md)를 먼저 읽는다.
