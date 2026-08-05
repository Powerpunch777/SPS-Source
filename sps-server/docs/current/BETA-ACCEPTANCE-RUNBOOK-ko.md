# SPS Desktop 베타 수동 검증 런북

최종 갱신: 2026-08-05

대상 후보는 [CURRENT-CANDIDATE.md](CURRENT-CANDIDATE.md)의 정확한 Desktop,
Core, Plugin SDK 튜플이다. 이 런북은 자동 회귀 테스트를 대신하지 않는다. 설치된
Desktop을 실제 사용자처럼 조작해 로그인, Host/Member 경계, Tailscale, Node,
Workspace Source, 플러그인 수명주기와 재시작 복구를 확인한다.

## 증거 원칙

- 기존 작업물 대신 별도 QA Workspace와 임시 Source를 사용한다.
- 설치본 SHA-256과 manifest의 Source/Core/SDK SHA를 먼저 고정한다.
- 이전 후보, 소스 체크아웃, 기존에 실행 중인 서버의 결과를 현재 후보 증거로
  재사용하지 않는다.
- 각 단계에 Host/Member, UTC 시작·종료 시각, 결과, 원본 오류와 필요한 화면을
  기록한다.
- 실패를 고치면 영향을 받은 단계와 패키징을 새 후보에서 다시 수행한다.

## 준비

- Windows 10/11 x64 Host 1대와 Member 1대
- 서로 다른 SPS Identity/Google 계정
- 양쪽에 동일한 후보 설치본
- 양쪽에 Tailscale `1.52.0` 이상과 사용자 계정 로그인
- Host가 선택할 수 있는 빈 QA 폴더
- 실행에 필요한 Runtime과 Node 승인

`tailscale version --json` 원본을 양쪽에서 저장한다. Tagged device에는 사용자
identity header가 제공되지 않으므로 사람 Member 검증에 사용하지 않는다.

## 1. 설치와 첫 실행

1. 양쪽 컴퓨터에 후보 설치본을 새로 설치한다.
2. 이전 Stable이 있다면 별도 순서에서 같은 후보로 업그레이드한다.
3. Google 로그인 후 Host는 Host 만들기, Member는 Host 참여하기를 확인한다.
4. 일반 브라우저에서 Host 주소를 열어 Workspace가 노출되지 않는지 확인한다.

통과 기준:

- 로그인과 Workspace 전환이 무한 대기하지 않는다.
- 브라우저 직접 접근은 차단되고 Desktop만 Workspace를 연다.
- 새 Workspace는 Room, Task, 역할, 메모리 정책을 임의로 만들지 않는다.

## 2. Workspace와 초기 Assistant

1. Host가 QA Workspace를 만든다.
2. Initial Assistant를 하나 등록한다.
3. 앱을 완전히 종료한 뒤 다시 연다.

통과 기준:

- Workspace와 Initial Assistant가 복구된다.
- Marketplace Assistant의 검색·추천만으로 플러그인 상태가 바뀌지 않는다.
- 플러그인 설치와 활성화는 Host의 명시적 UI 동작으로만 끝난다.

## 3. Tailscale Serve와 Member

1. Host가 비공개 팀 접근을 켠다.
2. Serve가 연결된 정확한 후보 포트를 기록한다.
3. Member PC에서 Serve URL로 정상 요청을 보낸다.
4. Host loopback에 `.ts.net` Host와 조작 헤더를 직접 보내 거부되는지 확인한다.
5. 전체 SPS2 초대 코드로 Member를 참여시키고 Node를 등록·승인한다.

Serve 증거에는 다음을 함께 남긴다.

- 후보 설치본 SHA-256과 Source/Core/SDK SHA
- `tailscale version --json`
- Serve hostname, 경로와 후보 포트
- 다른 PC의 성공 응답
- 직접 `.ts.net` Host 요청의 거부 응답
- UTC 시각과 원본 출력

통과 기준:

- Tailscale `1.52.0` 미만이나 버전 판독 실패 시 Serve 설정을 바꾸지 않는다.
- Member 요청에는 완전한 Serve provenance가 있고 직접 위조 요청은 거부된다.
- 취소, 만료, 잘린 초대 코드는 거부된다.
- 승인 전 Node 실행은 거부되고 승인 후에만 가능하다.
- Member에게 Host 설정, 플러그인 수명주기, 로컬 Source 선택이 노출되지 않는다.

## 4. Runtime과 Workspace Source

1. Host가 Runtime의 출처와 SHA-256을 확인한다.
2. 등록하지 않은 Runtime 실행이 거절되는지 확인한다.
3. Host만 로컬 QA 폴더를 Workspace Source로 지정한다.
4. 승인된 Member Node에만 Source route를 부여한다.
5. Member Node가 marker 파일을 쓰고 읽는 임시 실행을 완료한다.
6. Host가 Source 접근을 철회한 뒤 같은 실행을 다시 시도한다.

통과 기준:

- API 키, CLI 홈과 로컬 모델은 해당 Node 컴퓨터에 남는다.
- Member는 Host의 실제 경로를 선택하거나 변경할 수 없다.
- 허용된 파일만 바뀌며 철회 후 재실행은 fail-closed 한다.
- 실행 기록과 오류가 UI에 남는다.

## 5. 재시작과 정리

1. Host와 Member 앱을 완전히 종료하고 다시 연다.
2. Node, Workspace, 플러그인과 철회 상태가 복구되는지 확인한다.
3. 임시 Workspace, Source route, 테스트 파일과 계정을 제거한다.
4. 원래 Tailscale Serve 구성이 그대로인지 확인한다.

Stable 판정은 이 런북 외에도 코드 서명, Identity 운영 배포, Linux Core 전체 shard,
불변 GitHub Release와 동일 서명 설치본의 2대 검증을 모두 요구한다.
