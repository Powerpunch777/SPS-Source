# SPS 데이터와 복구

최종 갱신: 2026-07-30

## 데이터가 있는 위치

SPS Desktop의 Host 데이터는 Owner Vault에 보관된다. 프로젝트 폴더는 Vault 안으로
복사되지 않는다. Host가 지정한 외부 Workspace Source로 남는다.

Node의 CLI 로그인, API 키, 로컬 AI 모델, Tailscale 상태도 해당 Node 컴퓨터에 남는다.
SPS는 그 값을 다른 Member에게 복제하지 않는다.

## 현재 Export 범위

Host는 이동용 Owner Vault bundle을 만들 수 있다. bundle에는 다음이 포함된다.

- 새 데이터베이스 백업
- SPS가 관리하는 `storage`, `instances`, `projects` 데이터
- 존재하는 경우 Default Memory 데이터와 journal

다음은 의도적으로 포함하지 않는다.

- SPS Identity 로그인 세션과 새 Host의 암호화 키
- raw secret, API 키, CLI 로그인, Tailscale 상태
- live database 파일과 로그
- Vault 밖의 실제 프로젝트 폴더
- Memory sidecar와 외부 서비스의 자격 증명

## 앱 제거와 재설치

일반적인 SPS Desktop 제거는 앱 실행 파일을 삭제할 수 있지만 Owner Vault와 외부
프로젝트 Source를 지우지 않는다. 재설치 전에 Vault를 별도 위치에 백업하면 더
안전하다. 앱을 다시 설치한 뒤에는 Google 로그인과 각 Node의 CLI/API 연결을
다시 확인한다.

## Host 이동

완전한 Import/restore는 아직 구현 중인 기능이다. 현재는 다음을 준비한다.

1. Host가 최신 Owner Vault export를 만든다.
2. 실제 프로젝트 폴더는 Git, 안전한 파일 복사 또는 별도 백업으로 이동한다.
3. 새 컴퓨터에서 SPS Desktop과 Tailscale을 준비한다.
4. Host 이동 기능이 제공되면 bundle을 검사한 뒤 새 암호화 키와 새 로그인으로
   복원한다.
5. 새 Host에서 외부 Source, Member Node, CLI/API 로그인, Plugin 호환성을
   명시적으로 다시 연결한다.

이 제한은 과거 컴퓨터의 권한과 비밀 값을 새 Host로 몰래 복사하지 않기 위한 것이다.

## 삭제와 기록

Member를 제거하면 해당 Member의 현재 Node, Runtime 연결, Source grant는 철회한다.
감사와 운영 기록의 보존 여부는 선택한 접근 정책 Plugin 또는 향후 관리 기능이
정의한다. 프로젝트 폴더는 SPS가 자동으로 삭제하지 않는다.
