# SPS Plugin Platform 보관된 계약 fixture

> **Retired:** 이 디렉터리는 제품 런타임이나 Plugin 개발 SDK가 아니다.
> 과거 Extension Profile·Registry 테스트 벡터를 회귀 확인하기 위해서만
> 보관한다. 신규 개발과 수정은 공개 `@sonparkserver/plugin-sdk`에서 한다.

이 디렉터리는 과거 SPS 내부 플러그인 호환성·패키지·Registry 계약 fixture다.
Desktop과 Core는 이 package에 의존하지 않는다. 외부 플러그인 작성자는 공개 저장소
[`sps-plugin-sdk`](https://github.com/Powerpunch777/sps-plugin-sdk)를 사용한다.

## 이 도구가 다루는 것

- 기존 Extension Profile 1.0 package의 호환성 검사
- `.spsplugin` archive, static manifest, capability digest 검사
- release record와 Registry index의 Ed25519 서명 검사
- Local Registry와 static Registry의 source trust 검사
- Host가 수행하는 stage, update, rollback 전의 기술적 확인

이 도구는 특정 Task, Room, Lead/Worker 관계, 승인, 메모리 정책을 정의하지 않는다.
그런 업무 규칙은 각 Plugin이 정의하며, SPS Core는 기술적 primitive와 package
lifecycle만 제공한다.

## 보관 원칙

- 새 runtime 코드나 authoring API를 추가하지 않는다.
- public SDK 또는 Core 계약을 변경할 때 기존 fixture가 여전히 필요한지만 확인한다.
- 더 이상 참조되지 않는 fixture는 별도 정리 변경에서 삭제한다.

## 확인

```powershell
Set-Location .\sps-server\plugin-platform
npm test
```

새 Plugin 작성, Local Development Registry 테스트, release metadata 생성 방법은
공개 SDK의 README만 따른다.
