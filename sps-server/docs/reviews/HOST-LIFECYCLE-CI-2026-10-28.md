# Host Plugin 생명주기 CI의 실행 설정과 종료 판정

공개 Marketplace 제거 뒤 기존 관리 도구 호환성 검사가 실패한 실제 CI를 확인했다.
제품 Builder 신규 기능·구조는 개발하지 않고, 기존 테스트가 명시적으로 사용하는
도구의 opt-in과 종료 증거를 바로잡는 범위다. Core/SDK 계약·패키지 권한·승인
정책과 제품의 Builder 기본 비활성화는 유지한다.

## 실제 CI 실패

Source `9229548` / Core `2417d613`의 자동 push `40694180597`과 PR
`40694190799`는 모두 실패로 종료했다. Desktop job `122836453194`와
`122836481755`의 27단계 `Run packaged Desktop Host plugin lifecycle E2E`는
`Plugin Builder surface`를 기다리다 실패했다. `/LIF/builder`가 `Not Found`를
반환했고 restricted runner는 child/helper exit 1을 유지했다.

코드에서 `isSpsPluginDiscoveryEnabled()`의 기본값은 false다. Preview fixture에는
명시적 opt-in이 있지만 lifecycle fixture의 Desktop child 환경에는 빠져 있었다.
이 fixture가 기존 Builder 화면을 검사하므로 해당 child에만
`SPS_ENABLE_PLUGIN_DISCOVERY=true`를 전달한다. 테스트를 삭제하거나 route
대기를 건너뛰지 않는다. 별도로 출력된 updater `latest.yml` 404를 이번 명시적
Builder timeout의 원인으로 바꿔 기록하지 않는다.

이 두 run의 Linux 전체 타입/빌드와 9개 Linux shard는 통과했다. Desktop은
packaged Workspace 재시작·surfaces와 Preview까지 통과했으며 lifecycle 뒤의
Node 검사는 건너뛰었다. 별도 compatibility audit의 미승인 Zod High 실패는
유지한다. 이전 공유 보완 Source `533db40`은 이 fixture 수정이 포함되지 않은
별도 후보이므로 해당 CI 결과와도 구분한다.

## 추가로 확인한 종료 판정 결함

기존 lifecycle script는 기능 검증 직후 `ok:true`를 출력하고 finally에서
Browser.close 제한 시간이 지난 뒤 강제 종료를 시도했다. 임시 파일 삭제 오류는
무시했다. Windows launcher도 lifecycle을 자연 Job 종료 판정 대상에서 제외해
강제 정리 후 일반 성공을 반환할 수 있었다. 이를 전체 Core 종료·복구 통과의
증거로 쓸 수 없다.

기존 Preview의 정상 Desktop 종료 관찰과 pending cleanup 계약을 재사용한다.
기능 검사가 끝나도 cleanup이 남았음을 알리고, 강제 정리·미확인 Desktop 종료·
Identity/CDP 실패·임시 데이터 삭제 실패를 성공으로 바꾸지 않는다. Windows
launcher는 lifecycle도 pending 코드 76을 받게 하며, 실제로 소유한 Job이
자연스럽게 비었음을 독립 확인한 경우에만 0으로 바꾼다. 강제 종료는 실패 정리다.

단독 npm/source script에는 launcher의 Job 관찰 증거가 없으므로 기능 검사를
실행해도 전체 종료 통과를 자체 선언하지 않는다. 로컬 정리가 확인되면 76으로
qualification pending을 알리고, 전체 CI 합격은 Windows 소유 launcher가 판단한다.
임의 PID·전역 process name·단순 명령줄 경로 검색으로 소유권을 대신하지 않는다.

## 검증과 한계

root는 기존 Windows reduced-token Job 선택 검사 6개를 실행해 모두 통과했다.
실제 helper 컴파일·자연 종료 수용·잔여 자손 강제 정리의 거절·원래 실패 코드
보존·pending 위조 거절과 lifecycle gate 배선을 확인했다. 약 28초 실행이며 실제
Electron·패키지 UI·Core 데이터베이스의 생명주기 실행은 아니다.

최종 JS 집중 검사는 5개 파일 **29개 통과, 실패·skip 0개**였다. harness·C#·변경
검사의 입력 hash가 실행 전후 같았다. 실제 lifecycle finally와 삭제 함수를 VM으로
실행해 정상 정리는 pending 76, 강제 Desktop 종료·CDP/Identity/삭제 실패는 거절,
원래 실패 보존을 확인했다. 교체 디렉터리·같은 inode의 다른 생성 시각·symlink·
다른 canonical root·형제 fixture는 삭제하지 않는다. 처음 VM의 CRLF 추출 문제와
진행 중 함수명 변경에 따른 주입 누락을 고친 뒤 최종 실행이 통과했다.

JS 구문·diff 검사는 통과했다. 29개는 앞선 개별 실행과 겹치므로 합산하지 않는다.
Windows Job 6개는 별도 선택 실행이며 Electron/패키지 lifecycle 수용은 여전히
미확인이다. 기존 UI 확인·승인과 삭제 재시도를 보존하고 기존 Workspace/Preview의
20초 정리 제한은 변경하지 않았다. lifecycle에도 같은 20초 대기 한계를 적용한다.
이번 후보 revision의 실제 CI 결과는 별도로 확인해야 한다.
공유 권한 변경의 검증은 [별도 기록](HOST-SHARE-MUTATION-LIFETIME-2026-10-28.md)을
따른다. 실제 설치/업데이트/복원, 비정상 종료 자손·패키지 복구와 보안 gate는
완료되지 않았다.
