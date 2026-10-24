# SPS 시작하기

최종 갱신: 2026-10-24 (현재 개발 소스의 UI 경로 기준)

아래 Agent 관리와 Builder 화면 개선은 현재 개발 소스에 반영되어 있다. 이 문서
갱신 자체가 새 설치 파일이나 Stable 릴리스 배포를 뜻하지는 않는다.

## 준비물

- Windows 10 또는 11 x64 컴퓨터
- SPS Desktop 설치 파일
- SPS Identity에 사용할 Google 계정
- 다른 컴퓨터와 함께 쓸 경우, 각 컴퓨터의 Tailscale `1.52.0` 이상 연결

실제 작업은 Official release를 사용한다. Preview는 설치와 첫 실행 확인 전용이다.
채널 차이는 [RELEASE-AND-PREVIEW-POLICY-ko.md](RELEASE-AND-PREVIEW-POLICY-ko.md)를
참조한다.

## 첫 실행

1. SPS Desktop을 설치하고 실행한다.
2. 앱 안에서 Google 계정으로 로그인한다.
3. 메인 컴퓨터라면 **Host 만들기**, 팀의 기존 환경에 들어간다면 **Host 참여하기**를
   선택한다.
4. Workspace를 만들거나 초대받은 Workspace를 연다.
5. 새 Workspace에서 사용할 Agent를 하나 등록한다. 이후 추가·수정은
   **Host settings > Agents**에서 한다.

SPS Workspace는 빈 작업 공간으로 시작한다. 기본 Task 보드, Room, 조직도, Agent
역할, 메모리 정책은 자동으로 생기지 않는다.

## 원하는 작업 방식 고르기

1. **설정 > Plugins > Marketplace**에서 플러그인을 검색한다. Marketplace
   Assistant는 허용된 Agent를 선택해 검색과 설명을 요청하는 별도 기능이다.
2. 제작하려면 사이드바의 **Plugin Builder**에서 Lead로 사용할 Agent를 고르고
   대화한다. 추가 Agent는 작업 패널에서 Worker로 선택한다.
3. Host는 **설정 > 플러그인**에서 Plugin의 정보와 호환성을 확인한다.
4. Host가 선택한 Workspace에만 Plugin을 활성화한다.

검색이나 선택만으로 설치되지 않는다. Plugin 상태 변경은 Host가 별도로 명시해
진행한다. Core는 Agent의 Runtime과 기본 폴더를 관리하고, Lead/Worker 역할은
Builder 플러그인이 관리한다.

같은 CLI 로그인으로 여러 Agent를 만들 수 있으며 모델·기본 작업 폴더를 각각
정할 수 있다. 계정 사용 한도는 공유된다. 기본 폴더 설정은 Source 접근 권한이나
파일 시스템 샌드박스를 대신하지 않는다.

Builder 안에서 대화를 바꾸면 전송 전 초안과 첨부가 유지된다. 페이지 종료나 다른
화면으로 이동한 뒤까지 보존하는 저장 기능은 아니다. Agent 관리 버튼으로 나갈
때는 초안이 있으면 먼저 폐기 여부를 확인한다.

## 팀 컴퓨터 연결

1. Host와 Member 컴퓨터 모두 Tailscale에 연결한다.
2. Host가 SPS에서 전체 초대 코드를 만든다.
3. Member는 자신의 SPS Desktop에서 로그인한 뒤 초대 코드로 참여한다.
4. Member는 자신의 컴퓨터를 Node로 등록하고, Host가 해당 Node를 승인한다.
5. Host는 필요한 Workspace Source와 Runtime만 해당 Node에 연결한다.

Member는 Host의 실제 폴더 경로를 고르거나 바꿀 수 없다. CLI 로그인, API 키,
로컬 AI 모델은 각 Node의 컴퓨터에 남는다.

SPS는 비공개 팀 접근을 켜거나 복구하기 전에 Tailscale 버전을 확인한다. `1.52.0`
미만이거나 버전 정보를 읽을 수 없으면 Serve 설정을 변경하지 않고 업데이트 안내와
함께 중단한다. Tailscale의 tagged device에는 사용자 identity header가 제공되지
않으므로 첫 출시에서 사람 Member 컴퓨터로 사용할 수 없다.

## 프로젝트 폴더

Host만 로컬 프로젝트 폴더를 Workspace Source로 지정한다. Source는 폴더 사본이
아니라, Host가 허용한 Node에만 제공되는 보호된 접근 경로다. 프로젝트 폴더를 다른
컴퓨터로 옮기거나 Host를 바꾸기 전에는 반드시 Export와 Source 재지정을 준비한다.

## 문제가 생기면

- 로그인 문제: Google 계정, SPS Identity 연결, 시스템 시간, 네트워크를 확인한다.
- Member 연결 문제: Tailscale이 `1.52.0` 이상인지, 연결 상태와 전체 SPS 초대 코드를 확인한다.
- Agent가 보이지 않음: **Host settings > Agents**의 등록·상태와 해당 Runtime의
  로그인을 확인한다. 원격 실행은 Node 등록·승인과 해당 사용자 접근 권한도 확인한다.
- Plugin이 보이지 않음: Host가 설치했는지와 Workspace 활성화 상태를 확인한다.
- 데이터 이전: [DATA-AND-RECOVERY-ko.md](DATA-AND-RECOVERY-ko.md)를 먼저 읽는다.
