# Workspace 온보딩과 Changes 범위 E2E 검증 로그

Updated: 2026-07-17

## 목적

Agent Room이 실제 실행에 필요한 Project Workspace를 갖지 못했을 때, 사용자가
실패한 메시지 전송 뒤에야 원인을 알게 되는 문제를 없앤다. 또한 Workspace가
큰 Git 저장소의 하위 폴더인 경우 Room의 `Changes`가 저장소 전체 변경을 노출하지
않고 해당 Workspace의 변경만 보여야 한다.

## 구현

`local.room-chat` v0.3.55에서 다음을 적용했다.

- Room Workspace 상태를 `ready`, `missing`, `unavailable`, `legacy`로 명시한다.
- `missing` 또는 `unavailable` 상태에서는 Room 실행과 checkpoint 실행을 막고,
  Project Configuration의 `Set local folder` 공식 등록 경로를 안내한다.
- Project Workspace가 Git 저장소의 하위 폴더면 `git status` 결과를 저장소 루트가
  아니라 선택한 Workspace 기준 상대 경로로 다시 계산하고, 바깥 경로는 제외한다.
- 이 경로는 upstream의 실험적 Workspaces 탭에 의존하지 않는다. 현재 기본
  SPS UI에서 항상 제공되는 `Project Configuration -> Set local folder`가
  Project Workspace 레코드를 생성하거나 갱신한다.

## 자동 검증

`sps-room-chat`에서 `npm run check`를 통과했다.

- Worker와 UI 번들 구문 검사
- Workplane 권한, Task owner 보고/wake, memory, compact, attachment, runtime
  복구 회귀 테스트
- `test-room-workspace-binding.mjs`의 UTF-8 경로와 중첩 Workspace 범위 테스트

## 실제 브라우저 E2E

별도 Project `Workplane UI E2E 20260717`에서 검증했다.

1. 빈 Project의 Designer Room은 `Project folder required`를 보여 주고 Send를
   비활성화했다.
2. 안내 링크는 실제 `Project Configuration` 화면으로 이동했고, 그 화면의
   `Set local folder`가 확인됐다.
3. `tests/e2e-workspace` 하위 폴더를 Project local folder로 등록했다.
4. Room을 다시 열자 실행 입력이 활성화되고 Workspace가 `e2e-workspace`로
   바인딩됐다.
5. Changes에는 상위 저장소의 다른 변경 대신 `README.md` 하나만 나타났다.

학교 게임 Project에는 이 검증 중 어떤 설정이나 Task도 추가하지 않았다.

## 운영 정책 정합성

현재 제품 기본값은 공급자 quota의 숨은 시간 기반 자동 재시도를 하지 않는다.
quota 상태와 마지막 입력은 내구성 있게 보존하고, Owner Lead Room에 가시적인
blocker를 남긴다. 한도가 회복된 뒤에는 사용자나 Owner Lead가 같은 Room 요청이나
같은 Task를 명시적으로 다시 실행한다. 이 선택은 자동 재시도를 끄라는 현재 운영
정책과 일치한다.
