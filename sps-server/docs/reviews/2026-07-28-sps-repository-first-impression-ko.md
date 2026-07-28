# SPS 저장소 첫인상 평가

평가일: 2026-07-28

## 목적

이 문서는 처음 SPS를 접하는 베타 사용자, 플러그인 개발자, GitHub 방문자 관점의
비구속적 평가 기록이다. 실제 관찰된 저장소와 배포 경로를 기록하며, SPS의 제품 계약이나
로드맵을 대체하지 않는다.

## 평가 범위

- 비공개 제품 저장소: `Powerpunch777/SPS`
- 비공개 런타임 저장소: `Powerpunch777/SPS-Core`
- 공개 호환 저장소: `Powerpunch777/SPS-Core-Compat`
- 공개 Desktop 배포 채널: `Powerpunch777/SPS-Desktop-Releases`
- 공개 플러그인 SDK: `Powerpunch777/sps-plugin-sdk`
- 공개 공식 확장 Registry: `Powerpunch777/SPS-Official-Extensions`
- 공개 제품 웹사이트 소스: `Powerpunch777/redon-games-website`

## 종합 평가

SPS는 비공개 런타임, 공개 플러그인 SDK, 공개 설치 배포물, 공개 공식 확장물을 분리한
설득력 있는 제품 경계를 갖고 있다. 패키지 검증과 플러그인 저작 기반은 공개 인상보다
단단하다.

다만 처음 보는 사람에게는 아직 하나의 일관된 SPS 제품보다 Paperclip에서 분리되는 과정의
여러 저장소로 보인다. 가장 큰 빈틈은 설치 경로와 기본 공식 확장의 문서 경로다.

## 발견 사항

### P1: 웹사이트가 오래된 빌드를 현재 빌드로 제공한다

공개 다운로드 페이지는 SPS Desktop `0.4.30`을 현재 빌드로 표시하고 해당 설치 파일을
직접 연결한다. Desktop 배포 채널의 최신 릴리스는 `0.4.49`이며, 정적 사이트 검사도
`0.4.30`을 현재 버전으로 고정한다.

영향: 새 사용자가 오래된 빌드로 시작하고 즉시 업데이트를 겪거나, 지원 대상과 다른
동작을 보고할 수 있다.

근거:

- `redon-games-website/download/index.html` 28-32행
- `redon-games-website/scripts/check-site.mjs` 36행, 50행
- `SPS-Desktop-Releases`의 `v0.4.49` 릴리스

### P1: 최신 공식 확장에 공개로 동작하는 문서 링크가 없다

공식 Registry는 `local.room-chat`의 `0.3.83`을 최신으로 표시한다. 이 Catalog 레코드는
비공개 `SPS` 저장소 안의 경로를 문서 URL로 사용한다. 일반 베타 사용자는 이 문서를 열 수
없다. 이전 `0.3.82` 레코드는 `https://redongames.com/sps/team-workplane/`를 가리켰으며,
이 평가 중 HTTP 404를 반환했다.

영향: 사용자는 기본 Team Workplane의 역할, capability, 준비 조건을 활성화 전에 확인할
수 없다.

근거:

- `SPS-Official-Extensions/registry.json` 23행
- `SPS-Official-Extensions/releases/local.room-chat-0.3.83.json` 28행

### P1: 공개 호환 저장소가 Paperclip을 제품 본체처럼 보이게 한다

`SPS-Core-Compat`은 처음에 호환 저장소라는 경고를 제공하지만, 첫 화면 대부분이 원본
Paperclip 마케팅 README다. Paperclip 브랜드, 문서, 커뮤니티 링크, 제품 주장과
Paperclip Labs 명의의 MIT 고지가 계속 노출된다.

영향: GitHub 방문자는 SPS가 독립 제품인지, 이름만 바꾼 Paperclip fork인지, 지원되는
제품인지 합리적으로 판단하기 어렵다.

근거:

- `SPS-Core-Compat/README.md` 1-34행, 447행

### P2: 비공개 런타임의 협업자 온보딩도 제품 정체성이 충돌한다

비공개 `SPS-Core` README는 private runtime이라는 올바른 고지로 시작하지만, 바로 다음에
Paperclip 브랜드와 동일한 Paperclip 제품 README를 보여 준다. 공개 저장소는 아니지만
새 기술 협업자에게 영향을 준다.

영향: Core 기여자는 현재 SPS 동작, upstream 고지, legacy 호환 코드를 스스로 구분해야 한다.

근거:

- `SPS-Core/README.md` 1-35행, 447행

### P2: SDK는 단단하지만 호환 bridge가 아직 공개 계약에 드러난다

SDK에는 유용한 CLI, 보안 안내, Apache-2.0 라이선스, 기여 안내, 통과하는 conformance
test가 있다. 동시에 README는 생성 manifest가 아직 `paperclipPlugin` 호환 필드를 포함함을
설명한다.

영향: 플러그인 개발자는 지금도 확장을 만들고 검증할 수 있지만, SPS 플러그인 계약을
완전히 독립적이고 안정된 장기 API로 보기는 어렵다.

근거:

- `sps-plugin-sdk/README.md` 30-40행, 59행
- 2026-07-28 `npm test`: 51 passed, 0 failed

### P3: 공개 배포 채널과 확장 채널은 경계가 좋지만 안내가 얇다

Desktop 배포 저장소는 설치 파일과 업데이트 metadata만 갖도록 제한되어 있고, 공식 확장
저장소도 서명된 immutable artifact와 제품 소스를 잘 분리한다. 그러나 어느 저장소도
처음 방문한 사람에게 제품 문서, 지원 경로, 버전 호환성, 읽기 쉬운 확장 Catalog로 가는
짧은 길을 제공하지 않는다.

영향: 기술 경계는 깨끗하지만, 사용자가 SPS 문서가 어디에 있는지 이미 알고 있다고
가정한다.

## 유지할 강점

- 비공개 런타임, 공개 SDK, 공개 설치 artifact, 공개 확장 artifact가 목적별로 분리되어 있다.
- 이 평가 중 SDK 테스트 51개가 모두 통과했다.
- 공식 Registry 검사는 플러그인 코드를 실행하지 않고 package hash, 서명 metadata,
  capability 선언을 검증했다.
- 웹사이트는 스튜디오 콘텐츠와 SPS 제품 접근을 분리하고, 비공개 베타 개인정보, 이용 조건,
  보안 제보 안내를 제공한다.

## 권장 수정 순서

1. 웹사이트 설치 링크를 최신 release metadata에서 결정하게 만들고, 사이트 검사도 고정
   버전이 아니라 그 source를 검증하게 한다.
2. 공개되고 버전이 붙은 Team Workplane 문서를 하나 만들고, 최신 공식 확장 release가 그
   문서를 가리키게 한다.
3. 필요한 upstream 고지는 유지하되, 호환 저장소의 상속된 마케팅 README를 짧은
   archive/compatibility README로 교체한다.
4. 비공개 Core에 현재 SPS 동작, compatibility 코드, 제3자 attribution을 구분하는
   전용 기여자 README를 제공한다.
5. SDK를 장기 공개 플랫폼으로 취급하기 전에 독립 SPS 플러그인 계약을 versioned release로
   확정한다.

## 해석

제품은 시각적 다듬기 때문에 막힌 상태가 아니다. 단일 authoritative release source,
활성화 가능한 확장의 공개 문서 source, 독립 SPS 플러그인 계약, 현재 SPS 동작과 상속된
Paperclip 코드의 명확한 경계라는 제품 계약 완성 항목이 남아 있다.
