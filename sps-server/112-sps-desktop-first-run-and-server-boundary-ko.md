# SPS Desktop 첫 실행과 서버 경계

## 목적

SPS Desktop은 별도의 운영 대시보드가 아니다. 이 앱은 사용자의 컴퓨터에서 SPS Server를 만들거나, 기존 SPS Server에 안전하게 참여하고, 그 컴퓨터의 CLI와 로컬 AI 기능을 Node로 제공하는 실행 환경이다.

회사, Projects, Rooms, Tasks, Agents, 초대, Node 승인과 권한은 항상 SPS Server의 Workspace에서 관리한다.

## 첫 실행 흐름

```text
SPS Desktop 실행
  -> Google 계정 확인
  -> 이 컴퓨터에 서버 만들기 / 기존 서버에 참여하기
  -> SPS Workspace
```

1. **Google 계정 확인**
   - Desktop OAuth client와 PKCE loopback callback을 사용한다.
   - Desktop은 검증된 Google 사용자 식별자와 표시 정보만 운영체제의 보호 저장소에 보관한다.
   - Google access token, refresh token, CLI API key는 SPS Server로 보내거나 저장하지 않는다.

2. **이 컴퓨터에 서버 만들기**
   - Owner Host와 기본 메모리, Rooms 플러그인을 이 컴퓨터에서 시작한다.
   - 이 컴퓨터가 개인 작업 또는 소규모 팀의 기준 SPS Server가 된다.
   - Workspace가 열리면 회사 설정에서 멤버, 초대, Nodes와 Agent 권한을 관리한다.

3. **기존 서버에 참여하기**
   - 사용자는 서버가 만든 초대 코드를 입력한다.
   - Desktop은 초대에 포함된 SPS Server 주소만 저장하고, 해당 서버의 계정 접근 확인은 서버가 제공하는 브라우저 승인 과정에서 끝낸다.
   - 서버가 이 컴퓨터의 Node를 승인하기 전에는 이 컴퓨터의 CLI나 로컬 AI 명령을 실행하지 않는다.

## 책임 경계

| 영역 | SPS Desktop | SPS Server Workspace |
| --- | --- | --- |
| Google Desktop 계정 확인 | 담당 | 신뢰하지 않고 재사용하지 않음 |
| Owner Host 실행, 업데이트, 로컬 CLI와 로컬 AI 탐지 | 담당 | Node에 승인된 명령만 요청 |
| 회사, Projects, Rooms, Tasks, Agents | 열어 줌 | 담당 |
| 멤버 초대, 서버 접근, Node 승인 및 Agent별 접근 권한 | 연결 요청 | 담당 |
| 장기기억과 Room 기록 | Owner Host를 실행 | Server Core에서 저장 및 조회 |

컴퓨터 이름은 단지 Node의 표시 이름 후보일 뿐이고 사용자 신원은 아니다. 사용자 신원은 Google 계정, 실행 권한은 SPS Server의 멤버십과 Node 승인으로 각각 분리한다.

## UI 원칙

- 첫 화면에는 한 번에 한 결정만 보인다.
- 로컬 경로, Tailscale, 주소, 진단 같은 운영 항목은 첫 실행 화면에서 제거한다.
- 서버를 만든 뒤에는 기존 SPS Workspace의 **Settings**, **Nodes**, **Agents**, **Rooms**에서 운영한다.
- Published Desktop에는 SPS의 Google Desktop OAuth client ID를 포함한다. 개발 빌드에서만 공개 client ID를 임시로 설정할 수 있다. OAuth client secret은 Desktop에 넣지 않는다.

## 현재 호환 경계

로컬 Owner Host는 Desktop 계정 확인 뒤 즉시 생성할 수 있다. 원격 Server 참여는 초대 코드와 Server 측 접근 승인도 한 번 더 거친다. 이는 서로 다른 서버가 Desktop 로컬 식별 정보를 직접 신뢰하지 않게 하는 현재의 안전 경계다. 이후 SPS Server가 Desktop ID token 검증과 멤버십 매핑을 제공하면, 같은 Google 브라우저 세션으로 이 과정을 더 짧게 합칠 수 있다.
