# SPS Plugin Platform 내부 검증 도구

이 디렉터리는 SPS Core 저장소 안에서 사용하는 플러그인 호환성·패키지·Registry
검증 도구다. 외부 플러그인 작성자는 공개 저장소
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

## 개발 원칙

- 외부 Plugin 작성 경험은 public SDK와 같은 계약을 따라야 한다.
- manifest 선언은 권한 부여가 아니다. Host 경로, CLI 계정, Secret, Plugin 설치·활성화는
  별도 검증과 명시적 Host 동작이 필요하다.
- 내부 도구의 변경은 public SDK에 반영 가능한지 먼저 검토한다.
- 제품 경계는
  [PRODUCT-ARCHITECTURE-ko.md](../docs/current/PRODUCT-ARCHITECTURE-ko.md)를 따른다.

## 확인

```powershell
Set-Location .\sps-server\plugin-platform
npm test
```

새 Plugin 작성, Local Development Registry 테스트, release metadata 생성 방법은
공개 SDK의 README를 따른다.
