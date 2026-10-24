# SPS 데이터와 복구

최종 갱신: 2026-08-02

## 두 가지 이동 단위

SPS는 데이터 이동을 두 종류로 구분한다.

1. **Host 전체 전송**: 새 컴퓨터에서 기존 SPS Server 전체를 복원한다.
2. **Workspace 패키지**: 한 Workspace의 Core 관리 데이터를 별도 Workspace로 가져온다.

두 경로 모두 기존 데이터에 병합하거나 덮어쓰지 않는다.

## 데이터가 있는 위치

SPS Desktop의 서버 데이터는 Host 컴퓨터의 Owner Vault에 보관된다. 실제 프로젝트
폴더는 Vault에 복사되지 않고 Host가 지정한 외부 Workspace Source로 남는다.

Node의 CLI 로그인, API 키, 로컬 AI 모델, Tailscale 상태도 해당 Node 컴퓨터에
남는다. SPS는 이 자격 증명을 다른 컴퓨터나 Member에게 복제하지 않는다.

## Host 전체 Export

로그인한 Host는 이동용 Owner Vault bundle을 만들 수 있다. bundle에는 다음이
포함된다.

- 새 PostgreSQL 논리 백업
- SPS가 관리하는 `storage`, `instances`, `projects` 데이터
- 존재하는 경우 Default Memory 데이터와 journal

다음은 포함하지 않거나 복원 직후 사용할 수 없도록 제거한다.

- SPS Identity 및 Google 로그인 세션
- OAuth token, API key, CLI 로그인, raw secret과 암호화된 secret material
- Tailscale 상태, Node 등록과 Node별 credential envelope
- live database 파일, 임시 실행 lease와 로그
- Owner Vault 밖의 실제 프로젝트 폴더
- Memory sidecar와 외부 서비스의 자격 증명

## Host 전체 Restore

Host 복원은 로그인 후 초기 설정 화면의 `서버 백업에서 복원하기`에서 시작한다.
다음 규칙을 강제한다.

1. Owner Host가 한 번도 활성화되지 않은 새 환경이어야 한다.
2. 대상 Owner Vault가 없거나 초기 설정 파일만 있는 상태여야 한다.
3. bundle manifest와 모든 경로를 검증한 뒤 임시 Vault에서 SQL을 복원한다.
4. 과거 세션, secret, API key, Node credential과 임시 실행 상태를 제거한다.
5. 모든 단계가 성공한 경우에만 임시 Vault를 실제 Owner Vault로 승격한다.
6. 기존 Host와 병합하거나 기존 Host를 덮어쓰는 경로는 제공하지 않는다.

복원 후에는 SPS Identity에 다시 로그인하고 외부 Workspace Source, CLI/API 계정,
Tailscale, Member Node를 다시 연결해야 한다. 플러그인은 실행 전에 현재 SPS 버전과의
호환성을 다시 확인한다.

## Workspace Export

각 Workspace는 별도의 패키지로 내보낼 수 있다. 현재 표준 패키지는 Core가 관리하는
다음 데이터를 다룬다.

- Workspace 이름, 설명과 표시 정보
- Agent, Skill, Project
- Task, 댓글, 반복 작업 정보
- 휴대 가능한 Git 저장소 메타데이터와 환경 입력 선언

로컬 절대 경로, 실제 프로젝트 파일, secret 값과 로그인 정보는 포함하지 않는다.
플러그인 전용 데이터베이스, 파일, Memory Provider 데이터는 해당 플러그인이 향후
표준 portability 계약을 제공할 때만 Workspace 패키지에 포함할 수 있다. 현재는
Host 전체 Export가 이런 서버 전체 데이터를 보존하는 경로다.

## Workspace Import

Workspace 패키지를 가져오면 항상 새 Workspace를 만든다.

- 기존 Workspace 선택, 병합, 교체는 UI와 API에서 모두 거절한다.
- 패키지 내부 이름 충돌은 자동 rename으로 처리한다.
- 외부 Source와 자격 증명은 새 Host 환경에서 다시 연결한다.
- 필요한 플러그인은 별도로 설치하고 해당 Workspace에서 명시적으로 활성화한다.

이 규칙 덕분에 시험용 패키지를 가져와도 운영 중인 Workspace가 바뀌지 않는다.

## 앱 제거와 삭제

일반적인 SPS Desktop 제거는 실행 파일을 삭제하지만 Owner Vault나 외부 프로젝트
폴더를 자동 삭제하지 않는다. Member를 제거하면 해당 Member의 현재 Node, Runtime
연결과 Source grant를 철회한다. 프로젝트 폴더는 SPS가 자동 삭제하지 않는다.
