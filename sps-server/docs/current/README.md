# SPS Current Product Documents

이 폴더만 SPS의 현재 제품 결정을 설명한다. 루트의 과거 구현 로그, Paperclip 호환 기록,
특정 게임 프로젝트 기록은 제품 계약이 아니다.

| 문서 | 내용 |
| --- | --- |
| [PRODUCT-MODEL-ko.md](PRODUCT-MODEL-ko.md) | 제품 범위, 첫 Company, Core/Plugin 경계, 협업 확장 모델 |
| [PLUGIN-DEVELOPER-PLATFORM-ko.md](PLUGIN-DEVELOPER-PLATFORM-ko.md) | 플러그인 제작자가 Core에서 받는 SDK와 개발 도구 |
| [ROADMAP.md](ROADMAP.md) | 제품 기반을 완성하기 위한 단계별 구현 계획·수용 기준·릴리스 게이트 |
| [RELEASE-BASELINE-ko.md](RELEASE-BASELINE-ko.md) | 현재 Desktop/Core/Profile 지원 조합과 배포·롤백 상태 |

## 문서 원칙

- 제품 규칙을 바꾸면 이 폴더의 관련 문서를 같은 변경에서 갱신한다.
- 구현되기 전의 내용은 `목표` 또는 `계획`이라고 명시한다.
- 플러그인 소스 안의 `README`와 템플릿은 해당 플러그인의 개발 문서다. 제품 전체의 기본 동작으로 해석하지 않는다.
- 과거 설계와 실험 기록은 Git 이력에서 확인한다. 현재 제품 문서에 과거 계약을 중복 보존하지 않는다.
- 외부 관찰과 준비도 평가는 `../reviews`에 분리한다. 평가는 제품 계약을 바꾸지 않는다.
