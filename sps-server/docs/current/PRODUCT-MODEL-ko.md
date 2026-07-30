# SPS 제품 모델

최종 갱신: 2026-07-30

## 한 문장 정의

SPS는 개인과 소규모 팀이 자신의 Windows 컴퓨터를 Host로 사용해, 원하는 AI 작업 환경을 플러그인으로 구성하는 Desktop-first 플랫폼이다.

## 사용 흐름

```text
SPS Desktop 로그인
  -> Host 만들기 또는 기존 Host에 참가
  -> Workspace 선택 또는 생성
  -> Node에서 공개할 Runtime 선택
  -> 등록한 Initial Assistant를 통해 Discovery와 대화
  -> 설정 > 플러그인에서 원하는 작업 환경을 명시적으로 활성화
```

처음에는 특정 회사 구조, 역할, 프로젝트 보드가 나타나지 않는다. 사용자가 게임 개발, 웹 개발, 앱 개발, 연구, 개인 자동화처럼 원하는 방식을 설명하면 Discovery & Builder 플러그인이 공식 Catalog 검색 또는 플러그인 초안 작성을 돕는다.

## Core가 보장하는 것

- SPS Identity와 Desktop 로그인
- Host의 수명주기, 암호화된 Vault, 백업/복원, 업데이트, 진단
- Windows와 Tailscale 기반의 Host/Member 연결
- Member, Node, Node 상태, Runtime 공개 정보
- Host가 선택한 Workspace Source와 Node별 암호화된 접근 route
- 일반 Run, Artifact, Event, Job, Log, Secret handle
- 플러그인의 서명 검증, 호환성 검사, stage, 활성화/비활성화/삭제, 데이터 격리

## Core가 결정하지 않는 것

- Task와 Room의 존재 및 관계
- AI 역할, 상하 관계, 작업 배정과 완료 판단
- 장기기억의 수집, compact, 요약, 보존 정책
- 프로젝트의 종류와 파일 구조
- 업무상 승인과 검토 규칙

이 항목들은 플러그인이 결정한다. 예를 들어 팀 작업 플러그인은 Lead/Worker/Review 역할과 Task Room을 만들 수 있고, 메모리 플러그인은 프로젝트별 journal과 recall 정책을 제공할 수 있다.

## 파일과 실행의 경계

Host만 자신의 로컬 폴더를 Workspace Source로 등록한다. Core에는 Source의 ID와 상태, 팀 공유에 필요한 route만 보관하며, 실제 Host 파일 경로는 Desktop의 로컬 Vault에만 남긴다.

Member는 자신의 폴더를 대신 지정할 수 없다. 플러그인이 Source를 사용하기로 정하고 Core의 기술적 route를 얻은 경우에만, Host가 허용한 Source 안에서 작업한다. Node마다 CLI 계정, API key, 로컬 모델, 인증 정보는 계속 해당 컴퓨터에 남는다.

## 플러그인과 업데이트

SPS는 Extension Profile과 Plugin API를 공개한다. 플러그인은 지원하는 Desktop 버전과 Profile, 사용하는 Core primitive를 선언한다. Desktop은 호환되지 않는 플러그인을 실행 전에 차단한다.

현재 Desktop은 기존 호환 Profile `1.0`과 workflow-neutral Profile `2.0`을 함께 지원한다. Core 업데이트가 곧바로 모든 플러그인을 망가뜨리지 않도록, 호환 Profile을 일정 기간 병행 지원하고 retire 시점에만 명확히 차단한다.

## 첫 출시의 범위

- Windows 10/11 x64
- Desktop 앱 중심 사용
- Tailscale 기반 Host/Member 연결
- SPS Official Registry와 로컬 개발 플러그인
- Plugin Discovery & Builder 기본 제공

공개 커뮤니티 Registry, Marketplace, 결제, macOS/Linux, Tailscale 외 전송 방식은 안정화 이후 단계다.
