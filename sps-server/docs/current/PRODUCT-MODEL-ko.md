# SPS 제품 모델

최종 갱신: 2026-07-30

SPS는 개인과 소규모 팀이 자신의 컴퓨터, 프로젝트 폴더, AI 런타임을 바탕으로
AI 작업 환경을 구성하는 Windows Desktop 제품이다. 처음부터 특정 회사 조직도,
Task 보드, Room, 역할, 메모리 방식을 강제하지 않는다.

## 시작점

1. 사용자는 SPS Desktop에서 Host를 만들거나 기존 Host에 참여한다.
2. 새 Workspace는 중립 상태로 시작한다.
3. 기본 활성화된 `Plugin Discovery & Builder`와 Initial Assistant를 통해 원하는
   개발 방식이나 업무 흐름을 설명한다.
4. Assistant는 플러그인을 찾거나 초안을 만드는 데 도움을 줄 수 있다.
5. 실제 설치, 활성화, 업데이트, 비활성화는 Host가 **설정 > 플러그인**에서
   명시적으로 결정한다.

Assistant의 추천이나 대화만으로 플러그인이 자동 설치되거나 활성화되지는 않는다.

## 제품의 두 층

### SPS Core

Core는 Desktop, Host/Member/Node 연결, Workspace Source, AI Runtime,
실행 기록, Artifact, 보안 저장소, 백업, 업데이트, 진단, 플러그인 수명주기처럼
여러 작업 방식에서 공통으로 필요한 기술 기반을 제공한다.

### Plugin

Plugin은 실제 작업 방식을 정의한다. 예를 들어 게임 제작 Workplane은 Room, Task,
Lead/Worker, 리뷰, 장기기억을 만들 수 있고, 웹 개발 Plugin은 전혀 다른 화면과
규칙을 만들 수 있다. 이런 업무 의미는 Core의 기본 규칙이 아니다.

## 용어

| 용어 | 의미 |
| --- | --- |
| Host | Workspace와 공유 Source를 관리하는 기술적 기준 컴퓨터 |
| Member | Host에 참여해 허용된 도구와 Node를 사용할 수 있는 사용자 |
| Node | 특정 컴퓨터의 CLI, 로컬 AI, 연결 도구를 SPS에 제공하는 실행 지점 |
| Workspace Source | Host가 선택한 프로젝트 폴더에 대한 보호된 접근 경로 |
| Plugin | SPS 위에 실제 업무 흐름과 UI를 추가하는 독립 패키지 |

Host와 Member는 기술 연결 역할일 뿐 회사의 상하 관계를 뜻하지 않는다. 어떤
사람이나 AI가 어떤 일을 할지는 선택한 Plugin이 결정한다.

## 지원 범위

- 첫 번째 지원 대상은 Windows 10/11 x64와 Tailscale 기반의 Host/Member 연결이다.
- SPS는 Desktop-first 제품이다. 일반 브라우저는 Workspace 사용 경로가 아니다.
- 공식 Registry와 개인 Local Development Registry를 모두 지원하는 방향이다.
- 커뮤니티 판매, 결제, 공개 업로드 Marketplace는 첫 출시 범위에 포함하지 않는다.

세부 제품 계약은 [PRODUCT-ARCHITECTURE-ko.md](PRODUCT-ARCHITECTURE-ko.md)를
따른다.
