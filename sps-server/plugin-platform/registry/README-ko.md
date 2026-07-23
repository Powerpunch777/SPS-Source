# SPS Plugin Registry v1

이 모듈은 Marketplace가 아니라 플러그인 공유를 위한 release metadata 신뢰 계약이다. Registry는 package download URL을 알려줄 수 있지만, SPS Owner Host는 반드시 release record 서명·artifact SHA-256·manifest·권한을 독립적으로 검증한다.

## 제공하는 것

- deterministic JSON canonicalization
- release record와 Registry index 구조 검사
- Ed25519 release signature 검증
- `public`, `unlisted`, `private` visibility 제한
- path traversal을 막는 상대 artifact·release path 검사
- Local Registry에서 release·artifact의 실제 크기와 SHA-256 검사

## 제공하지 않는 것

- 파일 다운로드·압축 해제·plugin install
- Marketplace 계정·결제·정산
- 게시자 키 발급·보관 서비스
- Runtime 권한 우회 또는 자동 활성화

## 실행

```powershell
node --test .\sps-server\plugin-platform\registry\release-record-v1.test.mjs .\sps-server\plugin-platform\registry\local-registry-v1.test.mjs
```

다음 단계에서 Owner Host의 package inspector와 Desktop Registry source 관리 화면이 이 계약을 사용한다.
