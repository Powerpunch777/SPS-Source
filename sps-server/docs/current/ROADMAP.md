# SPS Implementation Roadmap

최종 갱신: 2026-07-28

## 제품 원칙

SPS의 첫 목표는 특정 업무 방식이 내장된 협업 도구가 아니라, 개인과 소규모 팀이 신뢰할 수 있는
AI 작업환경을 만들고 운영하는 Desktop-first 플랫폼을 완성하는 것이다.

- Core는 Desktop/Host, identity, Company, Agent, Node/Runner, 실행 기록, extension runtime,
  plugin lifecycle, diagnostics를 제공한다.
- 업무 모델, 사람 역할, Memory 전략, Connector 사용 규칙, 게임·앱·웹 개발 방식은 플러그인이 정한다.
- Core의 보안 경계는 제거할 수 없다. Host project source, device identity, Owner Vault, 서명된 command,
  plugin package 검증, 설치·활성화 동의, audit/revocation은 업무 권한 플러그인과 별개의 플랫폼 책임이다.
- Core의 유일한 기술적 소유자는 `Host Owner`다. Access Control 같은 플러그인은 Host Owner 아래의
  업무 역할만 정의하며, Host Owner의 서버 소유권을 대체하지 않는다.
- 첫 출시는 Windows 10/11 x64와 Tailscale 기반의 Host/Member 연결만 공식 지원한다.
- UI 고도화, 공개 Marketplace, 판매·정산은 아래 제품 게이트를 통과한 뒤 진행한다.

## 완료 기준의 공통 원칙

각 단계는 코드가 존재하는 것만으로 완료되지 않는다. 다음 네 조건을 모두 만족해야 다음 단계로 넘어간다.

1. 현재 제품 문서가 구현과 일치한다.
2. 자동 회귀 테스트가 존재하고 통과한다.
3. 패키지된 SPS Desktop에서 사람이 수행하는 수용 흐름이 검증된다.
4. 공식 release artifact, 버전, 변경 로그, 복구 방법이 함께 준비된다.

## Phase 0. 제품 기준선 고정

### 목표

개발 트리, Desktop installer, Core revision, 공식 extension artifact 사이의 지원 조합을 하나로 만든다.

### 구현 범위

- Desktop release마다 Core revision과 `SPS Extension Profile` 버전을 기록한다.
- 모든 사용자는 하나의 SPS Desktop installer와 `latest` update channel을 사용한다. 로그인 뒤 Host를
  만들거나 Member Node로 참여하는 것은 앱의 역할 선택이며, 별도 Member installer나 channel이 아니다.
- `SPS-Desktop-Releases`만 공식 installer·update metadata 저장소로 사용한다. 비공개 `SPS`는 제품
  소스와 내부 문서만 보관하며 새 Desktop release artifact를 게시하지 않는다.
- 공식 extension마다 최소/최대 Desktop 및 Profile 호환 범위를 manifest와 Catalog에 선언한다.
- stable과 beta update channel을 분리하고, 설치본의 update metadata가 같은 release artifact를 가리키게 한다.
- Website 다운로드 링크와 설치본 버전을 release metadata에서 생성하거나 검증한다.
- 버전이 맞지 않는 plugin은 설치 전에 차단하거나 사용자가 이해할 수 있는 호환성 오류를 보인다.

### 수용 기준

- 새 PC가 공식 사이트에서 받은 단일 installer로 최신 stable 버전을 설치하고, 로그인 후 Host 생성 또는
  Member 참여를 선택할 수 있다.
- 앱이 같은 stable channel의 update metadata만 수신한다.
- 설치된 Desktop에서 공식 Registry의 지원 extension을 설치·활성화·재시작·비활성화할 수 있다.
- 릴리스 문서 한 곳에서 지원 조합과 rollback 절차를 확인할 수 있다.

### 선행·차단 관계

이 단계가 끝나기 전에는 현재 개발 트리의 기능을 제품 기능으로 홍보하거나 외부 beta 사용자에게
정식 지원한다고 말하지 않는다.

## Phase 1. SPS Extension Profile v1

### 목표

외부 개발자가 Paperclip 지식 없이 SPS plugin을 만들고 검증할 수 있는 독립 공개 계약을 확정한다.

### 구현 범위

- `SPS Extension Profile v1`의 manifest schema, capability, lifecycle, migration, dependency,
  compatibility 규칙을 versioned 문서와 SDK로 제공한다.
- UI, Store, Agent Tool, Event/Job, Artifact, Backend/Node, Connector, Catalog, Test Kit,
  Authoring CLI의 안정 범위를 선언한다.
- legacy Paperclip manifest/runtime 필드는 compatibility bridge로 격리하고 신규 템플릿에서는 생성하지 않는다.
- reference plugin 하나와 conformance suite를 제공한다.
- package signing, hash 검증, archive safety, registry metadata 검증을 SDK 테스트에 포함한다.

### 수용 기준

- 빈 외부 폴더에서 `init -> validate -> test -> pack -> local publish`가 문서대로 동작한다.
- reference plugin이 새 manifest만 사용해 package·설치·활성화·upgrade·rollback·remove를 통과한다.
- compatibility plugin과 v1 plugin을 명확히 구별해 진단한다.
- SDK와 CLI의 공개 버전, changelog, deprecation 정책이 존재한다.

### 선행·차단 관계

Plugin Discovery & Builder와 공식 확장은 이 Profile 위에서만 새 기능을 추가한다. 호환 bridge에
새 제품 기능을 쌓지 않는다.

## Phase 2. Minimum Viable Company

### 목표

처음 설치한 사용자가 빈 Company에서 Agent 하나를 연결해 자기 작업환경을 설계하기 시작할 수 있게 한다.

### 구현 범위

- 로그인 후 `서버 만들기` 또는 `서버 참여`를 완료하는 onboarding을 제공한다.
- 새 Company에는 Company container, 연결 확인된 Agent 한 명, `Plugin Discovery & Builder`,
  `Settings > Plugins`만 만든다. Project, Room, Task, 권한 역할, Memory 정책은 자동 생성하지 않는다.
- Discovery & Builder는 Catalog 검색·비교·추천, plugin 설계 초안, source workspace와 manifest/test 초안
  생성을 Agent tool로 지원한다.
- Agent가 recommendation, design, lifecycle tool의 사용 여부를 판단한다. 추천을 선택하는 것만으로
  install·activate·update는 실행되지 않는다.
- 실행 기록, Artifact, plugin lifecycle audit를 Company 안에서 확인·내보내기할 수 있게 한다.

### 수용 기준

1. 새 사용자 또는 새 기기가 로그인한다.
2. Owner가 서버를 만들고 Agent 하나를 연결해 실행 확인을 받는다.
3. 사용자가 자연어로 필요한 작업환경을 설명하면 Agent가 Catalog를 검색하거나 없는 plugin의 초안을 만든다.
4. 사용자가 Settings > Plugins에서 명시적으로 plugin lifecycle을 수행한다.
5. 앱을 종료·재실행해도 Company, Agent, plugin 상태, 실행 기록이 복구된다.

### 선행·차단 관계

이 기본 루프가 동작하기 전에는 Team Workplane과 분야별 Development Pack을 기본 경험으로 강제하지 않는다.

## Phase 3. Local-first 협업 기반

### 목표

Owner Host와 Member Node가 서로 다른 컴퓨터에서 안전하게 협업할 수 있는 제품 약속을 완성한다.

### 구현 범위

- Host Owner가 초대 생성, Member가 로그인·참여, Host Owner가 Node를 승인·철회하는 흐름을 완성한다.
- Node가 보고하는 실행 가능 CLI, local AI, Connector capability와 상태를 확인한다.
- Core는 Node/Backend/CLI profile과 project scope를 기술적으로 연결하되, 특정 사용자가 해당 Agent를
  실행할 수 있는지는 Access Control이나 Workplane 같은 설치된 플러그인이 발급한 실행 grant로만 판단한다.
  Core 자체는 Viewer·Operator·Admin 같은 사람 역할을 해석하지 않는다.
- project source는 Host Owner만 지정·변경한다. Member는 Host가 부여한 project source mapping으로만 접근하고
  임의의 자기 로컬 폴더를 프로젝트 source로 등록할 수 없다.
- 명령은 Company/Agent/Node/project scope, 만료, 승인 상태를 포함한 서명된 protocol로 전달하고
  audit log에 남긴다.
- offline, Node disconnect, Host restart, revoked member, stale invitation의 실패·복구 상태를 제공한다.

### 수용 기준

패키지된 앱을 설치한 물리 컴퓨터 두 대에서 다음을 검증한다.

1. Host Owner가 서버를 만들고 Member를 초대한다.
2. Member가 로그인·참여하고 Host Owner가 Node를 승인한다.
3. Host Owner가 지정한 project source만 Member Node에서 사용한다.
4. 설치된 정책 또는 업무 플러그인이 발급한 실행 grant를 가진 Agent만 해당 Node의 CLI 또는 local AI를
   실행하고 기록을 남긴다.
5. Member 또는 Node를 철회하면 새 command와 project source 접근이 즉시 거절된다.
6. Host Owner와 Member 앱을 각각 재시작한 뒤 Company·membership·Node 상태를 안전하게 복구한다.

### 선행·차단 관계

실제 두 대 검증을 통과하기 전에는 협업 기능을 "완료" 또는 "정식 지원"으로 표시하지 않는다.

## Phase 4. Memory, backup, diagnostics의 운영 계약

### 목표

Provider를 교체해도 Company의 기억과 운영 데이터를 잃지 않는 표준 생명주기를 만든다.

### 구현 범위

- Core는 Thread, Run, Artifact, Event를 Memory Provider가 읽을 수 있는 안정된 계약으로 제공한다.
- Provider는 수집, 검색, 요약, checkpoint/compact, 승인 후보, retention을 구현한다.
- Company·Project·plugin scope 격리와 삭제 정책을 정의한다.
- Host PC의 Owner Vault, configuration, memory index, audit data를 암호화된 수동 backup으로 export하고
  새 Host 또는 복구 환경에서 restore하는 흐름을 제공한다. 중앙 서비스는 Company 작업 데이터를 보관하지 않는다.
- 진단 bundle은 비밀값과 live database를 제외하고, 지원자가 원인을 재현할 수 있는 상태·버전·로그를 담는다.

### 수용 기준

- 새 Company는 Memory Provider 없이도 동작하며, 사용자가 명시적으로 활성화·구성한 Default Memory는
  lifecycle 오류 없이 시작한다.
- Thread/Run/Artifact가 재시작 후 검색 가능하며, compact 결과의 원본과 요약 관계를 확인할 수 있다.
- Company 또는 project를 삭제·철회하면 범위를 넘는 기억이 남지 않는다.
- Owner가 export한 backup으로 새 Host 또는 복구 환경에서 Company 상태를 복원한다.
- diagnostics bundle에 secret이 포함되지 않는 것을 자동 검사한다.

### 선행·차단 관계

고급 장기기억 UI와 domain-specific memory 전략은 Provider와 Workplane plugin이 담당한다. Core는
특정 기억 전략을 강제하지 않는다.

## Phase 5. 공식 번들 플러그인과 Development Pack

### 목표

검증된 Core 위에서 사용자가 바로 선택할 수 있는 업무 환경을 제공한다.

### 구현 순서

1. Access Control: Host Owner 아래의 Viewer, Operator, Admin 역할을 제공하는 선택형 정책 plugin
2. Team Workplane: Room, bounded Task, Lead/Worker, 보고·검토를 제공하는 선택형 plugin
3. Memory Provider와 Connector: 업무에 맞는 저장·검색·외부 도구 연결
4. Plugin Development Pack: SPS plugin 제작을 위한 첫 공식 Pack
5. Game, App, Web Development Pack: 분야별 Agent template, Connector, 문서, 검증 흐름 조합

### 수용 기준

- 어떤 Pack도 Core에 특정 조직이나 특정 모델을 고정하지 않는다.
- Pack은 필요한 plugin·template·Connector를 설명하고, 실제 설치·활성화는 사용자가 명시적으로 수행한다.
- Pack마다 최소 한 개의 end-to-end sample과 upgrade/rollback 검증이 있다.

## Phase 6. 생태계 준비

### 목표

신뢰할 수 있는 외부 plugin 공유 기반을 준비하되, 공개 판매·정산은 별도 제품으로 유지한다.

### 구현 범위

- trusted Registry source, 제작자 metadata, license, compatibility, security advisory, revoke를 제공한다.
- Plugin Discovery & Builder가 Catalog 검색·비교·설계 초안을 만들 수 있게 한다.
- 공식 extension과 커뮤니티 extension의 신뢰 등급을 구분한다.
- 공개 Marketplace, 결제, 세금, 환불, 평점은 launch 범위에 포함하지 않는다.

### 수용 기준

- Catalog 항목이 자동 설치되지 않고 package 검증·동의·lifecycle audit를 거친다.
- 취약하거나 철회된 artifact가 설치·실행되지 않는다.
- 외부 개발자가 독립 SDK와 문서만으로 reference 수준 plugin을 배포할 수 있다.

## 릴리스 게이트

각 stable Desktop release는 최소한 다음을 통과해야 한다.

- Desktop, Node, Plugin Platform, 공식 번들의 자동 테스트
- 해당 Desktop/Core/Profile/extension 조합의 지원 매트릭스 검증
- 새 Owner Host, 기존 Owner upgrade, 새 Member join, 기존 Member reconnect의 실제 앱 수용 테스트
- 기본 Company loop와 plugin lifecycle의 실제 앱 수용 테스트
- backup/restore 또는 안전한 rollback 경로
- update metadata, installer hash, release notes, 알려진 제한사항 확인

## 의도적으로 뒤로 미룬 범위

- 공개 Marketplace의 판매, 정산, 세금, 환불, 평점
- 모든 AI 제공자와 모든 OS의 동시 지원
- 특정 게임·앱·웹 조직의 Core 기본값화
- UI 미세 조정과 마케팅 페이지 확장

이 항목들은 제품 기반이 검증된 뒤 우선순위를 다시 정한다.
