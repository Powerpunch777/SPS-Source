# SPS 제품 준비도 평가

평가일: 2026-07-28

## 목적

이 문서는 SPS의 현재 구현과 공개 배포 상태를 제품 관점에서 평가한 기록이다. 현재 제품 계약이나
향후 로드맵을 대신하지 않는다. 확정된 제품 방향은 `../current` 문서만 따른다.

## 결론

SPS는 **Desktop-first AI 작업환경 플랫폼 알파**로서 유효한 기술적 기반을 갖췄다. 그러나 아직
팀이 설치해서 안정적으로 운영하는 완성 제품으로 부르기에는 이르다. 현재 우선순위는 화면 개선이나
Marketplace가 아니라, 하나의 공식 릴리스 기준선과 재현 가능한 기본 운영 루프를 완성하는 것이다.

정성적 준비도는 다음과 같이 판단한다.

| 영역 | 준비도 | 판단 |
| --- | --- | --- |
| Core 실행·보안 기반 | 높음 | Desktop Host, Node, Runner, 서명된 명령, Owner Vault와 관련 계약 테스트가 존재한다. |
| 플러그인 개발 기반 | 중간 | manifest, registry 검사, lifecycle 기반은 있으나 독립 SPS 계약과 SDK 버전이 아직 고정되지 않았다. |
| 개인·팀 운영 제품성 | 중간 이하 | Owner/Member 실제 Desktop 흐름과 복구를 공식 릴리스 기준으로 반복 검증해야 한다. |
| 배포·지원 준비도 | 중간 이하 | 개발 소스와 공개 설치본·공식 확장 버전이 하나의 지원 매트릭스로 관리되지 않는다. |
| 전체 제품 준비도 | 알파 | 제한된 사용자가 검증하는 단계다. 공개 Marketplace와 광범위한 사용자 배포 단계는 아니다. |

## 확인된 강점

- Core가 특정 회사 조직, 특정 AI 제공자, 특정 개발 분야를 강제하지 않고 플러그인으로 업무 방식을
  조합하도록 한 경계가 명확하다.
- Host가 프로젝트 원본·비밀정보를 소유하고 Member Node가 승인된 명령만 실행하도록 한 구조는
  로컬 우선 협업 제품의 차별점이 될 수 있다.
- Plugin package 검사, Registry metadata, 서명된 명령, Owner Vault, Node 상태 등 보안과 운영의
  기본 단위가 구현과 테스트에 포함되어 있다.
- 현재 개발 트리에서 Desktop 153개, Desktop Node 31개, Plugin Platform 52개, Room collaboration
  readiness 테스트가 통과했다. 이는 계약 수준 회귀 방지 기반으로 충분히 의미가 있다.

## 제품 출시를 막는 핵심 위험

### 1. 공식 릴리스 기준선이 하나가 아니다

개발 소스의 Desktop과 공개 설치본, Room 확장 소스와 공식 Registry artifact의 버전이 다르다.
사용자는 어떤 Desktop, Core, Extension 조합이 지원되는지 알 수 있어야 한다.

필요한 제품 계약:

- Desktop release -> Core revision -> Extension Profile -> 공식 extension version의 지원 매트릭스
- 자동 업데이트가 따르는 안정 채널과 beta 채널
- 호환되지 않는 extension의 설치 차단 또는 명확한 경고
- 설치본에서 재현한 검증 결과와 변경 로그

### 2. SPS 전용 플러그인 계약이 아직 이행 중이다

SDK와 일부 패키지에는 Paperclip compatibility bridge가 남아 있다. 이 상태는 내부 이행에는 유용하지만,
외부 제작자에게는 SPS가 독립 플랫폼인지 legacy fork인지 혼동을 준다.

필요한 제품 계약:

- versioned `SPS Extension Profile v1`
- 독립 manifest schema, lifecycle, capability, SDK namespace
- compatibility bridge는 별도 모드·문서·종료 계획으로 분리
- reference plugin과 conformance suite

### 3. 첫 Company의 기본 루프가 목표 상태다

문서상 새 Company는 Agent 한 명과 `Plugin Discovery & Builder`로 시작한다. 이 흐름이 실제로
패키지된 앱에서 끝까지 동작해야 빈 플랫폼이 아니라 제품이 된다.

완료 조건:

1. 사용자가 로그인하고 서버를 만들거나 참여한다.
2. Agent 한 명을 연결하고 실행을 확인한다.
3. Agent가 Catalog를 검색하거나 없는 기능의 plugin 초안을 만든다.
4. 사용자가 결과를 검토하고 Settings > Plugins에서 lifecycle을 명시적으로 수행한다.
5. 재시작 후 Company, Agent, plugin 상태와 실행 기록이 복구된다.

### 4. Owner/Member 약속은 실제 설치본으로 닫아야 한다

단위·계약 테스트가 통과해도 두 물리 컴퓨터에서 Owner Host와 Member Node를 연결하는 제품 약속은
별도다. 초대, Node 승인, Host가 지정한 프로젝트 source, 명령 실행, 연결 해제·재가입, 권한 회수,
재시작 복구를 패키지된 앱으로 매 릴리스 검증해야 한다.

### 5. Memory와 복구가 제품 계약으로 완결되지 않았다

Memory Provider를 교체 가능하게 두는 설계는 맞다. 다만 Core가 제공할 thread/run/artifact 기반의
생명주기, export/import, 삭제, retention, checkpoint/compact 결과, 프로젝트·Company 격리 규칙을
명확하게 고정해야 Provider가 달라도 사용자의 기록이 흔들리지 않는다.

## 제품 우선순위

다음 작업은 UI 다듬기, 공개 Marketplace, 분야별 Development Pack보다 앞선다.

1. 공식 릴리스 기준선과 업데이트 채널을 고정한다.
2. SPS Extension Profile v1과 SDK 독립 계약을 확정한다.
3. 새 Company -> 첫 Agent -> Discovery & Builder -> plugin lifecycle의 기본 루프를 패키지 앱에서 완성한다.
4. Owner/Member/Node의 실제 2대 Desktop 수용 테스트를 릴리스 게이트로 만든다.
5. Memory·backup·restore·diagnostics 계약을 확정하고 검증한다.

그 다음에 Team Workplane, Access Control, 게임·앱·웹 Development Pack을 공식 번들/확장으로
고도화한다. Marketplace의 판매·정산·평점은 생태계 단계의 별도 제품으로 남긴다.
