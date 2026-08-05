# SPS Desktop 베타 수동 검증 절차

최종 갱신: 2026-08-05

이 절차는 [CURRENT-CANDIDATE.md](CURRENT-CANDIDATE.md)에 적힌 정확한
Desktop, Core, Plugin SDK 조합을 두 대의 Windows PC에서 검증한다. 이전
후보, 소스 실행본, 오래 실행 중인 서버의 결과는 현재 후보 증거로
재사용하지 않는다.

## 기본 원칙

- 두 PC 모두 같은 후보 설치본을 사용한다.
- 시작 전에 설치본 SHA-256과 Source/Core/SDK SHA를 고정한다.
- Host와 Member는 각자 미리 등록한 Ed25519 장치 키를 사용한다.
- 기록에는 이름, 이메일, 컴퓨터명, IP, Tailnet hostname, 토큰, 절대경로,
  프로젝트 내용을 넣지 않는다.
- 실패를 수정했다면 영향을 받은 단계부터 같은 후보로 다시 실행한다.

## 준비

- Windows 10/11 x64 Host 한 대와 Member 한 대
- 서로 다른 SPS 계정
- 두 PC 모두 Tailscale 안정판 `1.52.0` 이상
- Authenticode가 `Valid`인 동일 설치본
- 보호된 Environment에 사전 등록된 Host/Member 장치 키 fingerprint
- 릴리스 초안의 `sps-release-challenge.json`

Tagged device에는 사람의 Tailscale identity header가 없으므로 Member
검증에 사용하지 않는다.

## 1. 설치와 계정

1. 두 PC에 후보를 새로 설치한다.
2. 별도 순서에서 이전 Stable에서 후보로 업데이트한다.
3. Host는 새 Workspace를 만들고 Member는 전체 SPS2 초대코드로 참여한다.
4. 일반 브라우저에서 Workspace가 열리지 않는지 확인한다.

## 2. Tailscale Serve 증거

1. 두 PC의 `tailscale version --json` 원본을 비공개 capture에 저장한다.
2. 후보 설치본에 포함된 Owner Host runtime archive와 실제 로딩한
   `request-hostname.js`의 SHA-256을 계산한다.
3. 비공개 관측 config에 runtime/module 경로와 manifest SHA, release nonce,
   두 Tailscale 버전 파일, 출력 capture 경로를 넣고 추적되는
   `tailscale-serve-observation-server.mjs`를 실행한다. 서버는 runtime과
   모듈 바이트를 직접 해시하며 다르면 시작하지 않는다.
4. Member PC에서 임시 Serve 경로로 HTTPS 요청을 보낸다.
5. Host loopback에서 `.ts.net` Host만 직접 주장한 요청을 보낸다.
6. 관측 서버가 두 요청의 실제 HTTP 상태와 응답 본문을 비공개 capture에
   Base64로 직접 저장할 때까지 기다린다. capture를 손으로 만들지 않는다.
7. `release:create-serve-evidence`로 익명화된 공개 증거를 만든다.
8. `release:verify-serve-evidence`로 스키마와 후보 결속을 확인한다.
9. 임시 Serve 경로와 포트를 제거하고 기존 설정이 유지되는지 확인한다.

통과 기준:

- Member 요청은 실제 HTTP `200`, `source=tailscale-serve`다.
- 직접 Host 위조는 실제 HTTP `403`, `source=direct`다.
- 증거는 설치본, runtime archive, `request-hostname.js`, release nonce의
  SHA와 정확히 결속된다.
- 공개 증거에는 개인정보나 로컬 경로가 없다.
- 단독 Serve 검증은 구조 확인일 뿐이다. Stable 판정은 아래 Host/Member
  서명이 포함된 물리 증거 검증에서만 가능하다.

## 3. Node, Runtime, Source

1. Member Node를 등록하고 Host가 허용한 Agent Runtime만 부여한다.
2. Host만 Workspace Source 폴더를 지정한다.
3. Member Agent가 Host Source 안의 marker 파일을 읽고 수정한다.
4. Runtime 또는 Source 권한을 철회하고 같은 실행이 거부되는지 확인한다.
5. 네트워크를 끊었다 복구한 뒤 중복 실행 없이 다시 동작하는지 확인한다.

## 4. 백업과 복원

1. Host 데이터를 내보낸다.
2. 비어 있는 새 Host에만 복원한다.
3. 프로젝트 작업물은 유지되고 SPS 내부 비밀·실행 상태는 복원 규칙에
   맞게 제외되는지 확인한다.

## 5. 증거 서명

1. 익명화된 Serve 증거를 `tailscale-serve-evidence.json` artifact로 넣는다.
2. `hostMemberJoin` 시나리오가 이 artifact를 참조하게 한다.
3. Host가 물리 증거를 서명한다.
4. Member가 같은 파일을 두 번째로 서명한다.
5. 최종 JSON을 보호된 `SPS_PHYSICAL_RELEASE_EVIDENCE_JSON`에 저장한다.

Stable 게이트는 같은 release nonce, 설치본 SHA, Source/Core/SDK 튜플,
runtime/module SHA, 두 장치 fingerprint와 서명을 모두 다시 검증한다.
코드 서명, Identity 운영 배포, Linux Core 전체 shard, 불변 GitHub Release가
모두 완료되기 전에는 Stable로 표시하지 않는다.
