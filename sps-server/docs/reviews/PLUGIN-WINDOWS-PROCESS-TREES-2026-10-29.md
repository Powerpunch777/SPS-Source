# Windows Plugin Worker별 프로세스 묶음 소유권

Core `296feed754f723f30ae10b1f2a889aca4dd943ae`까지 커밋·push했다.

기존 Plugin Worker 종료 확인은 직접 fork한 child와 stdio close까지였다.
Worker가 stdio를 상속하지 않는 자식을 만들면 Worker 중지·crash 뒤에도 자식이
남을 수 있었다. 전체 Owner Host Job으로 한 Plugin을 정리하면 다른 Plugin과
Core까지 종료되므로, Worker별 소유권을 추가한다.

## 실제 구현

Core에 기존 SPS Windows Job supervisor의 JS·C# 구현을 재사용한다. 별도의
Desktop 의존성을 추가하지 않고 Core `native-runtime` 자산으로 소스를 포함한다.
Windows에서 처음 사용할 때 설치된 .NET Framework compiler로 고유 임시 경로에
helper를 준비한다. compiler가 없거나 준비에 실패하면 비관리 fork로 우회하지 않는다.
도구 다운로드·OS 설정 변경·고객 데이터 변경은 하지 않는다.

helper는 실제 Worker를 suspended로 만들고 Worker 전용 kill-on-close Job에
넣은 뒤 시작한다. stdin/stdout RPC와 기존 권한·최소 환경·execArgv를 유지한다.
Windows에서 `fork()`가 보완하던 SYSTEMROOT/WINDIR만 target 환경에 추가하며
호스트의 비밀정보를 전달하지 않는다. Windows 환경 키의 대소문자 충돌은 거절하고
POSIX의 대소문자 구별은 유지한다. POSIX는 기존 fork 경로를 사용한다.

ready frame에 실제 target PID를 포함하고 helper PID와 구분한다. manager의
종료 escalation은 helper PID에 signal을 보내는 대신 정확한 소유 Job 취소 경로를
사용한다. raw helper exit/close만으로 worker_exit·공개 exit/crash·자동 재시작·
소유권 해제를 알리지 않는다. Job activeProcesses 0과 helper close가 확인돼야
진행한다. 확인 실패 시 정확한 generation·target PID·handle을 보존하고, 새 Worker나
패키지 변경이 그 상태를 정상 종료로 간주하지 못하게 한다.

처음 compiler 준비를 기다리는 동안 stop/shutdown이 들어오면 spawn 직전 원래
manager 소유권과 상태를 다시 확인한다. 준비 자체는 Worker를 시작하지 않는다.
실패한 helper 임시 경로는 canonical path와 dev/ino/birthtimeNs가 원래 생성한
것과 일치할 때만 제거한다. 성공한 helper cache는 로드 중 삭제와 경합하지 않도록
유지한다. 비정상 종료 뒤 남은 helper cache의 영속 회수는 아직 구현하지 않았다.

Core server build는 `native-runtime`을 dist에 복사한다. Desktop 준비·패키지 검증도
실행 adapter, JS transport와 C# source의 존재를 요구한다. Core는 `@sps/desktop-node`
패키지나 Desktop extraResources 경로를 전제하지 않는다.

## 실행·검사 근거

최종 Core 선택 실행 6개 파일 **41개 통과**, 제품 manager/adapter/JS/C# hash가
실행 전후 같았다. 이후 POSIX 환경 키 호환성을 보완하고 adapter 파일만 **5개
재통과**했다. 마지막 private transport의 가용성 조회에서도 Desktop 기본 경로를
전제하던 잔여 참조를 제거하고, 명시적 Core helper 경로를 요구하는 검사까지
해당 파일 **6개 재통과**했다. 겹치는 개별 검사는 합산하지 않는다.

- 실제 Windows Core manager에서 두 Workspace Worker를 실행한다. 각 Worker가
  stdio-ignore Node 자손을 만들고 고유 TCP heartbeat를 보내 실제 실행 중임을
  확인한 다음, A를 중지해 A 묶음의 종료 ACK와 helper close를 확인한다. B는 계속
  heartbeat를 보내고 health RPC에 응답한다. B를 crash시킨 뒤에도 Job 정리 완료
  후에만 crash callback이 실행되는 것을 확인했다. 임의 PID 종료는 사용하지 않는다.
- 주입 검사에서는 raw helper close 뒤 ACK가 대기 중이거나 거절되면 target PID와
  소유권·미완료 callbacks를 유지하고 재시작/종료 성공을 거절한다. 종료 escalation이
  helper.kill 대신 해당 owner의 terminate를 호출하는지도 확인한다.
- 기존 직접 child close, Workspace owner 분리·revision·정리 검사 3개 파일은
  adapter 경계에 원래 fake child를 연결해 기존 assertions를 유지했다.
- 처음 실제 검사는 target의 Windows 부팅 환경 누락으로 Node CSPRNG 초기화에서
  실패했다. 누락을 보완한 뒤 Node worker와 Node 자손의 실제 동작을 재확인했다.
  fixture의 숫자 RPC ID·heartbeat 대기·on/off listener 오류도 수정했으며 제품의
  완료 기준이나 제한 시간을 낮추지 않았다.

서버 타입 검사 exit 0·제품 입력 hash 동일, compatibility boundary·JS 구문·diff
검사가 통과했다. Desktop 패키지 계약 검사 **11개 통과**는 자산 요구사항의 정적
검증이며 실제 설치된 패키지 실행을 증명하지 않는다.
기존 실제 Worker shutdown·stream-scope 2개 파일 **8개도 통과**했다. shutdown
Promise 합류, 초기화 중 중지·shutdown, 초기화 실패 후 무재시도, reusable stopAll,
Workspace stream 분리/오류 경로를 새 실행기와 확인했다. 전체 suite는 실행하지 않았다.

## 후속 CI fixture 회귀

Source `eae978a`의 push `40729389751` Desktop `122961253672`는 전체 Desktop
단위 검사에서 기존 Agent 자산 복사 fixture 1개가 실패했다. 실제 Core 복사 script는
이제 `native-runtime`도 요구하지만 fixture는 onboarding/built-ins만 준비해 ENOENT가
발생했다. 해당 job이 끝났어도 전체 run은 진행 중이므로 job 로그 endpoint로 원인을
확인했다. PR `40729401287` Desktop `122961296982`도 같은 단계에서 실패로 끝났다.
이 후보에서는 실제 packaged E2E 단계가 실행되지 않았다.

원래 default/CEO 지침·built-in 복사와 소유 임시 경로 검사를 유지하면서 실제 Core의
native-runtime 파일을 fixture에 추가하고, 실행한 원본 copy script가 동일 bytes를
dist에 복사하는지 추가 확인한다. 제품 script가 누락 자산을 무시하거나 테스트를
건너뛰도록 바꾸지 않는다. 수정 후 Agent 자산 복사와 기존 패키지 계약 2개 파일
**12개 모두 통과**했고 diff 검사도 통과했다. runtime build 검사 11개와 겹치므로
앞선 결과에 합산하지 않는다. 실제 `.cs`·`.mjs`·선언·README의 동일 bytes 복사와
기존 지침을 확인한 결과이며 아직 새 후보의 packaged E2E 통과 증거는 아니다.

## Core 강제 종료와 임시 경로 보완

Windows의 TEMP/TMP가 junction 또는 짧은 경로 별칭이면 기존 실행기 준비는
생성한 폴더의 실제 경로와 별칭 루트를 비교해 거절할 수 있었다. 이제 임시 루트를
먼저 realpath로 확인하고 일반 디렉터리인지 검사한 뒤 전용 폴더를 만든다.
기존 자식 경로 경계와 dev/ino/birthtimeNs 확인은 유지한다.

새 실제 검사는 Core fixture만 정확한 ChildProcess로 강제 종료한다. 별도 외곽
Job으로 프로세스를 정리하지 않는다. 독립된 읽기 전용 C# observer가 Core·helper·
Worker·stdio-ignore Node 자손의 Windows 핸들을 먼저 열고 생성 시각과 실행 상태를
확인한다. 그 뒤 nonce IPC로 Core의 helper 생존과 Worker health를 재확인하고,
동일 자손 heartbeat 연결이 살아 있는 상태에서 Core만 종료한다. observer는 네
핸들 모두의 종료와 실제 exit code를 확인한다. PID 검색·PID 인수·Worker PID
강제 종료는 사용하지 않는다. 검사 전용 TEMP/TMP junction을 사용하므로 실제
compiler 준비·실행·종료가 별칭 루트에서도 동작함을 함께 확인한다.

임시 파일 삭제는 모든 프로세스 종료 확인 뒤 원래 root/target의 경로·파일 identity와
junction 경계를 다시 확인한 경우에만 한다. 확인 실패 시 해당 검사 경로를 보존한다.
초기 fixture의 잘못된 cwd로 tsx를 찾지 못한 실행은 통과 근거에서 제외한다.

Source `f495cdd` / Core `296feed7`의 PR `40730405126`, Desktop
`122964856806`은 자산 준비를 통과한 뒤 No-AI Workspace E2E의 Plugin 설치에서
`Windows plugin worker process ownership could not be prepared.`로 실패했다.
그 실행의 Core/Main 종료와 owned Job empty는 정상 확인됐지만 Plugin 설치 성공은
아니다. 같은 job에서 동일 고정 경로의 csc로 다른 supervisor를 컴파일했고 준비된
Core 자산 검사도 통과했다. 기존 오류는 내부 단계를 숨기므로 이 실패의 원인을
TEMP/TMP, compiler 또는 자산 누락 중 하나로 확정할 수 없다. 임시 루트 보완을
해당 CI 실패의 확인된 해결로 표시하지 않는다.

같은 Source push `40730393656`, Desktop `122964815388`도 동일 단계와 동일
설치 400으로 종료했다. 두 실행의 실패를 별개로 보존하며 새 후보를 통과로
간주하지 않는다. 원인 확인을 위해 기존 오류 prefix와 응답 형식을 유지하면서
`compiler_access`, `source_access`, `temp_root`, `helper_directory`, `compile`,
`output_validate` 중 고정 단계와 허용된 오류 코드만 추가했다. 원래 오류·cause·
명령·파일 경로·환경·stdout/stderr는 전달하지 않는다. 준비 함수의 fault injection은
기존 internal adapter 경계에 한정하며 Plugin SDK 계약을 추가하지 않는다.

최종 선택 실행은 7개 파일 **26개 모두 통과**했다(약 61초). 새 실제 Core 강제
종료 검사와 기존 실제 두 Workspace 자손 검사, 준비 실패/출력 비노출 6개,
adapter·미확인 종료·기존 shutdown/stream 검사를 함께 실행했다. 제품
manager/adapter/JS/C# hash가 전후 동일했다. 앞선 개별 실행과 겹치므로 합산하지
않는다. 관찰용 C# helper는 종료 권한 없이 알려진 정확한 프로세스만 열었다.
후속 cached 서버 타입 검사도 exit 0이며 제품 TS 입력 hash가 동일했다.
compatibility boundary·두 fixture의 JS 구문·diff 검사도 통과했다. 전체 로컬 suite와
배포 build·Electron·실제 설치·물리 컴퓨터 검사는 재실행하지 않았다.

## 아직 확인하지 않은 범위

같은 OS 사용자 Worker가 Windows Job에 속하는 것은 OS 보안 샌드박스가 아니다.
파일·네트워크·Secret 격리 보장을 확대하지 않는다. POSIX 자손 소유권, 실제
packaged Owner Host 안의 nested Job·독립 설치 환경, 강제 Desktop 손실의
새 per-worker 경로 수용과 helper cache 정리는 추가 확인이 필요하다. 기존 전체
Host Job과 제어 연결 손실 검사는 별도 증거이며 이번 선택 검사에 합산하지 않는다.

영속 Runner 완료 receipt·claim 인계, package crash journal, 설치·업데이트·복원 및
보안 gate도 남아 있다. 기존 Marketplace·Builder·Native 보류 범위를 바꾸지 않는다.
