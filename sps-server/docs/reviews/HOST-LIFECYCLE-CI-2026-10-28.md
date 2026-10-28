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
후속 Source `a5254ba` push `40706166873`은 Desktop 8단계의 TLS 테스트 setup에서
OpenSSL을 찾거나 실행하지 못해 실패했다(1395개 중 1381 통과·12 hook 실패·2 skip).
따라서 이 후보의 실제 packaged lifecycle은 실행되지 않았다. PATH·Git 위치의
모든 probe 실패를 helper가 같은 오류로 바꾸므로 실행 파일 부재·실행 실패·제한
시간 초과 중 어느 경우인지는 현재 로그만으로 확정하지 않는다. 별도의 CI 환경
선행 조건 보완 대상으로 유지하며 테스트를 skip하거나 Native 보류로 제외하지 않는다.

같은 Source의 PR `40706191315`는 Desktop `122878850805`의 해당 단계를 통과하고
뒤 실제 E2E에 진입했다. 따라서 지속적인 파일 미설치로 단정하지 않는다. 실패한
정확한 runner image `win25-vs2026/20261021.278`의
[공식 설치 스크립트](https://github.com/actions/runner-images/blob/win25-vs2026/20261021.278/images/windows/scripts/build/Install-OpenSSL.ps1)는
`Program Files/OpenSSL/bin`에 실행 파일을 설치하고 PATH에 추가한다. 기존 resolver가
Git 위치만 명시적으로 보완했던 것에 이 공식 경로 fallback을 추가한다. 전체 Desktop
검사 전에 같은 resolver를 한 번 실행하고, probe의 고정 출처·성공/실패 범주와
시간만 출력해 실행 불가·시간 초과·잘못된 version 결과를 구분할 근거를 남긴다.
5초 probe·인증서 생성 제한과 TLS 검사·승인·fixture 격리는 유지한다. 설치/다운로드는
추가하지 않는다. 이 보완을 기존 불규칙 실패의 해결 증거로 선행 선언하지 않는다.

resolver 주입 검사 2개와 기존 실제 TLS 검사 12개를 선택해 **14개 모두 통과**했다.
임시 인증서·loopback TLS를 사용하는 기존 1.3 pinning·잘못된 인증서·날짜/SAN·
1.2 downgrade 거절·timeout·취소 검사를 유지했다. 새 resolver 검사는 PATH/Git
실패 뒤 공식 이미지 경로 선택과 잘못된 version·시간 초과 등 고정 진단, callback
실패 무시를 검사한다. 새 파일은 기본 `test/*.test.mjs`에 포함되는 위치에 둔다.
실행은 약 4.7초였고 OS trust store·firewall·Native 제품 기능은 변경하지 않았다.

workflow YAML을 파싱해 Desktop working directory와 전체 테스트 전 preflight
배치를 확인하고, 동일 preflight 문장도 로컬에서 실행해 Git fallback 성공을
확인했다. 이 로컬 결과는 실패 runner의 원인 확인이나 해당 후보 CI 통과를
대신하지 않는다.
공유 권한 변경의 검증은 [별도 기록](HOST-SHARE-MUTATION-LIFETIME-2026-10-28.md)을
따른다. 실제 설치/업데이트/복원, 비정상 종료 자손·패키지 복구와 보안 gate는
완료되지 않았다.
