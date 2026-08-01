# SPS Desktop 베타 수동 검증 런북

최종 갱신: 2026-08-01
대상: SPS Desktop `0.4.104` (Windows 개발 후보, 코드 서명 여부는 별도 릴리스 게이트)

이 런북은 자동 회귀 테스트를 대신하지 않는다. 설치된 Desktop을 실제 사용자처럼
조작하여 Google 로그인, Host/Member 경계, Tailscale 연결, Node 승인, Host Source
공유와 재시작 복구를 확인한다. 기존 작업물은 건드리지 않고 별도 QA Workspace와
임시 Source를 사용한다.

## 현재 기준

- `0.4.104` 설치본은 Host와 laptop에 설치되어 있다.
- Desktop 테스트 `261/261` (exit 0), desktop-node `39/39`, 공개 Plugin SDK 테스트 `146/146`이 통과했다.
- Installer SHA256 `B58E7EAE15884D4E9B052ED3A15A9B43B340CB83DCAE1EE0D1A71261C974C2C1`, size `255265752`.
- 양쪽 app.asar SHA256 `2ECC983D650BBBB51798762A1A4AAFB6B8096AE5073C251CD33FB7C66E34EFEC`.
- packaged bootstrap, Workspace, Plugin Preview, Host plugin lifecycle 검증이 통과했다.
- Host Source를 laptop Agy CLI가 실제로 편집하는 물리 E2E, Source 철회 후 거부,
  양쪽 재시작 후 복구까지 통과했다.

## 준비

- Windows 10/11 Host 1대와 Member laptop 1대
- 서로 다른 SPS Identity/Google 계정
- 두 컴퓨터의 Tailscale 로그인과 연결 확인
- 양쪽에 동일한 SPS Desktop `0.4.104` 설치본
- Host가 선택할 수 있는 빈 QA 폴더
- 실행에 필요한 Runtime이 각 Node에 등록되어 있고 Host가 사용할 수 있는 상태

## 1. 설치와 첫 실행

1. 양쪽 컴퓨터에서 Desktop을 실행한다.
2. Google 로그인 후 Host는 서버 만들기, Member는 서버 참여 화면을 확인한다.
3. 일반 브라우저로 Host 주소를 열어 Workspace가 노출되지 않는지 확인한다.

통과 기준:

- 로그인과 Workspace 전환이 무한 대기하지 않는다.
- 브라우저 직접 접근은 차단되고 Desktop 경로만 Workspace를 연다.
- 새 Workspace는 특정 Room, Task, 역할, 메모리 정책을 자동으로 만들지 않는다.

## 2. Host Workspace와 초기 Assistant

1. Host에서 QA Workspace를 만든다.
2. 필수 Initial Assistant를 하나 등록한다.
3. 앱을 완전히 종료하고 다시 연다.

통과 기준:

- Workspace와 Initial Assistant가 복구된다.
- Marketplace Assistant는 검색과 추천만 수행한다.
- 검색 또는 대화만으로 플러그인이 설치, 활성화, 업데이트, 비활성화, 삭제되지 않는다.
- 플러그인 lifecycle 변경은 Host가 `설정 > 플러그인`에서 직접 수행한다.

## 3. Runtime 확인

1. Host에서 Runtime의 출처와 SHA-256을 확인한다.
2. 필요한 Runtime을 등록하고 Assistant가 해당 Runtime을 선택할 수 있는지 확인한다.
3. 등록하지 않은 Runtime이나 Workspace Source 밖의 명령이 거절되는지 확인한다.

통과 기준:

- Runtime이 없어도 기본 Workspace와 설정 화면은 열린다.
- API 키, CLI 홈, 로컬 경로는 다른 컴퓨터로 전송되지 않는다.
- 실행 기록과 오류가 UI에 남는다.

## 4. Member 초대와 Node 승인

1. Host의 Team access에서 전체 SPS2 초대 코드를 만든다.
2. Member가 다른 계정으로 로그인하고 전체 코드를 수락한다.
3. Member가 Node를 등록한다.
4. Host가 Nodes에서 해당 Node를 승인한다.
5. 승인 전 실행이 거절되고 승인 후에만 실행 가능한지 확인한다.

통과 기준:

- 취소, 만료, 잘린 초대 코드는 거절된다.
- Member에게 Host 설정, 플러그인 lifecycle, Host 로컬 Source 선택이 노출되지 않는다.
- Member 제거 시 Node와 관련 grant가 철회되고 과거 기록만 남는다.

## 5. Host Source와 물리 실행 검증

1. Host만 로컬 QA 폴더를 Source로 등록한다.
2. Host가 승인된 Member Node에만 Source route를 부여한다.
3. Member에서 Source를 사용하는 임시 plugin run을 실행한다.
4. Host 폴더의 표시된 파일이 정확한 marker로 바뀌었는지 확인한다.
5. Host에서 Source 접근을 철회한 뒤 같은 실행을 다시 시도한다.

현재 상태:

- Source metadata, route, grant, revoke 계약과 자동 검증은 통과했다.
- `0.4.104` 양쪽 설치 및 packaged plugin lifecycle은 통과했다.
- run `e0286388-cf8d-4acb-9890-40d8fce1edab`: laptop Node가 Host Source
  `53faf93c-7da0-44d9-9586-9435274eec24`를 `Z:\\`로 마운트하고
  `SPS_WORKSPACE_PATH=Z:\\`로 `node-source-e2e.txt` marker를 쓰고 읽은 뒤 exit 0.
- Source UI 회수 후 Windows share/account 삭제를 확인했고, run
  `e5bec7a5-9324-4479-aea2-834d4dca5730`는 `This SPS Workspace Source has no active transport route`로
  실패했으며 원본 해시는 불변이었다. 양쪽 재시작 후 Node ID, 0.4.104, plugin
  `local.source-physical-e2e` 0.1.6, 회수 상태가 유지되었다.
- 재시작 증거를 수집한 뒤 임시 E2E plugin, Source handle, Local Registry source와
  테스트 파일을 제거했다. 이 fixture는 제품 기본 플러그인이 아니다.

## 기록 규칙

각 단계에 Desktop 버전, Host/Member 구분, 시작·종료 시각, 성공/실패, 오류 문구와
필요한 화면 캡처를 기록한다. 실제 물리 E2E 결과가 기록된 항목만 `pass`로 표시한다.
실패를 고친 뒤에는 영향을 받은 단계 전체를 처음부터 다시 수행한다.

베타 이후에도 공식 코드 서명, 공개 릴리스 메타데이터, 깨끗한 컴퓨터의 설치 시간은
별도 릴리스 게이트로 남는다.
