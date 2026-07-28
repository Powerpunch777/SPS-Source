# First Company and Plugin Discovery

## 시작 흐름

```text
SPS Desktop 로그인
  -> 서버 만들기 또는 서버 참여
  -> 새 서버라면 Company 생성
  -> 첫 Agent 연결과 실행 확인 (필수)
  -> Plugin Discovery & Builder 활성화
  -> Company Workspace 열기
```

처음 만든 Company에는 Project가 없다. 사용자는 빈 Project 목록, 등록한 첫 Agent, 활성화된 `Plugin Discovery & Builder`, `Settings > Plugins`를 본다.

## 첫 Agent

첫 Agent는 필수다. 사용자는 이름과 실행기를 정하고 연결을 검증한다. 실행기는 Codex CLI, Agy CLI, 로컬 AI 또는 API Backend일 수 있다.

Agent는 Core가 저장하는 중립 Agent record다. `Plugin Discovery & Builder`가 이 Agent에 플러그인 설계자용 대화 context와 도구를 제공한다. 특정 모델이나 제공자를 강제하지 않는다.

## Plugin Discovery & Builder

하나의 기본 플러그인으로 다음을 제공한다.

- 사용자의 목표와 현재 Company 상태를 대화로 이해
- Marketplace Catalog 검색
- 플러그인과 Development Pack 비교·추천
- 없는 기능의 플러그인 설계, source workspace 생성, manifest·UI·tool·test 초안 작성
- 생성물 검사, 패키지 준비, 문서 초안 작성

Agent는 검색, 제작, 플러그인 lifecycle 도구를 사용할 수 있다. 어떤 도구를 언제 사용할지는 Agent가 대화 맥락을 보고 판단한다. 추천 항목을 선택하는 UI는 설치·활성화·업데이트 같은 side effect를 자동으로 호출하지 않는다.

## Settings > Plugins

사용자는 이 화면에서 다음을 확인한다.

- 현재 활성화된 플러그인과 상태
- Catalog source와 검색 결과
- 플러그인 설명, 제작자, 버전, 호환성, 라이선스, manifest 선언
- 설치, 활성화, 비활성화, 업데이트, 롤백, 제거 기록

Marketplace는 Catalog를 뜻한다. 공개 커뮤니티 판매 플랫폼은 별도 제품 단계이며, 초기에는 신뢰한 source와 공식 source만 제공한다.
