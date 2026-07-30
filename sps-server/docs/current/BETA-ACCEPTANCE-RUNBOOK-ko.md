# SPS Desktop 베타 수동 검증 런북

최종 갱신: 2026-07-30
대상: SPS Desktop `0.4.84` (Windows, 개발 후보, 코드 서명 전)

이 검증은 자동 테스트를 대체하지 않는다. 실제 앱에서 Google 로그인,
Tailscale 연결, Host/Member 경계, Windows 재시작과 복구를 확인하기 위한
절차다. 기존 작업 Workspace가 아닌 별도 QA Workspace에서만 수행한다.

## 준비

- Windows 10/11 Host 1대와 Member 1대
- 서로 다른 SPS Identity/Google 계정
- 두 컴퓨터의 Tailscale 로그인과 MagicDNS 확인
- 같은 `SPS-Desktop-Setup-0.4.84.exe` 설치본
- Host가 선택할 수 있는 빈 테스트 폴더 1개
- 필요하다면 `SPS-Agent-Runtime-Pack-*.zip`과 일치하는 팩 카탈로그

## 1. 설치와 첫 실행

1. 각 컴퓨터에서 설치 파일을 실행한다.
2. 설치 시간과 설치 후 앱이 열리는 시간을 기록한다.
3. SPS Desktop을 열어 Google 로그인을 완료한다.
4. Host 컴퓨터에서는 **Create server**, Member 컴퓨터에서는 아직 서버에
   참여하지 않은 상태를 확인한다.

통과 기준:

- 로그인 후 무한 대기하지 않는다.
- 일반 브라우저로 Host 주소를 열어 Workspace를 사용할 수 없다.
- 새 Workspace에는 Room, Task, 역할, 자동 Assistant가 보이지 않는다.

## 2. Host Workspace와 초기 Assistant

1. Host에서 QA Workspace를 만든다.
2. Initial Assistant를 하나 등록한다.
3. 앱을 완전히 종료하고 다시 연다.

통과 기준:

- 같은 Host, Workspace, Initial Assistant가 복구된다.
- Plugin Discovery & Builder는 검색과 제작 초안만 돕고 플러그인을
  자동 설치하거나 자동 활성화하지 않는다.

## 3. 선택 Agent Runtime 팩

1. Host에서 릴리스 매니페스트 또는 팩 카탈로그의 SHA-256을 확인한다.
2. 필요한 팩 ZIP을 내려받아 압축을 푼다.
3. Host 설정의 **Install extracted runtime pack**으로 팩 폴더를 고른다.
4. Owner Host를 재시작한다.
5. 해당 provider를 사용하는 Assistant를 테스트한다.

통과 기준:

- 팩을 추가하지 않아도 SPS 기본 Workspace가 정상 기동한다.
- 경로 밖 명령을 가리키거나 불완전한 팩은 거절된다.
- 추가한 팩만 목록에 나타나며 provider 로그인이나 API 키는 별도로
  요구된다.

## 4. Member 초대와 Node 승인

1. Host의 **Team access**에서 전체 SPS2 초대 코드를 만든다.
2. Member가 다른 계정으로 로그인하고 전체 코드를 수락한다.
3. Member가 자신의 Node를 등록한다.
4. Host가 Nodes에서 그 Node를 승인한다.
5. 사용 전 Host와 Member 앱을 각각 한 번 재시작한다.

통과 기준:

- 취소된 초대나 잘린 초대 코드는 명확히 거절된다.
- Member에게 Host 설정, 플러그인 수명주기, 로컬 Source 경로 선택이
  노출되지 않는다.
- Node 승인 전에는 명령 실행이 불가능하다.

## 5. 프로젝트 Source와 복구

1. Host만 Sources에서 로컬 테스트 폴더를 Source로 등록한다.
2. Host가 승인된 Member Node에만 Source route를 부여한다.
3. Member에서 지정된 Source를 사용하는 작업을 수행한다.
4. Host가 Member를 제거한 뒤 Member에서 다시 실행을 시도한다.

통과 기준:

- Member는 Host의 전체 로컬 경로나 새 Source를 임의로 지정할 수 없다.
- 제거 후 Member의 Node, Source grant, 실행 권한이 회수된다.
- 감사 기록은 남지만 제거된 Member는 다시 실행할 수 없다.

## 기록

각 단계마다 Desktop 버전, Host/Member 계정 구분, 성공/실패, 오류 문구,
설치 시간과 필요한 화면 캡처를 기록한다. 실패를 고친 뒤에는 해당 단계를
처음부터 다시 수행한다.

베타 통과 후에도 공식 코드 서명, Authenticode 검증, 설치 파일과 팩
아카이브의 불변 릴리스 공개가 남는다.
