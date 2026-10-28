# Host 공유 권한 변경의 소유권과 결과 확인

기존 Workspace Source·legacy 프로젝트 공유의 실제 결함 보완이다. 실제 Windows
공유·사용자·ACL·고객 자격은 변경하지 않고 기존 코드와 주입한 실행기로 검증한다.
공개 Marketplace·새 Builder·Native 추가 개발·완전한 OS 샌드박스는 범위가 아니다.

## 확인한 경계

기존 grant/revoke는 Core 상태 요청을 기다린 뒤 현재 계정·Host·폴더·secret을
다시 읽었다. 도중 연결이 바뀌면 이전 요청이 새 연결에서 로컬 Windows 권한을
바꾸거나 자격정보를 덮을 수 있었다. 여러 공유 작업은 같은 protected secret
객체를 각자 저장해 다른 grant를 잃을 수 있었다. 폴더 선택 dialog와 Source 목록의
자동 동기화도 실제로는 로컬 mapping/Core metadata 변경이므로 같은 수명이 필요하다.

공유 변경을 직렬화하고 원래 계정 subject/session epoch, Host 인스턴스, Workspace,
폴더 경로와 secret revision을 확인한다. grant 자격은 Windows 권한 변경 전에
먼저 암호화해 저장한다. 중간 실패나 계정 전환이 발생해도 이미 실행한 권한 변경을
그냥 없던 일로 보고하거나 재사용 중인 기존 자격을 자동 철회하지 않는다. 명시적인
복구 필요 결과를 사용하고 불확실한 Core/로컬 변경 여부만 고정 범주로 알린다.

새 프로젝트 공유 계정은 Source·Node별 식별을 사용하고 기존 credential은 무음
교체하지 않는다. 기존 계정 이름을 형제 Source/프로젝트가 함께 참조하면 그 계정을
삭제하거나 비밀번호를 바꿔 다른 grant를 손상시키지 않도록 소유권을 확인해야 한다.

## 종료 조정

공유 queue는 새 admission을 닫고 이미 수락한 작업 전체를 기다린다. Desktop
종료·업데이트 drain은 이 경로를 즉시 시작하고, 독립적인 ingress/command 정리를
진행한 뒤 Core manager를 중지하기 전에 공유 작업을 합류시킨다. 각 작업의 실패는
호출자에게 복구 필요 결과로 전달하고 자격정보를 보존한다. 이미 끝난 업무 오류를
미종료 프로세스로 취급해 이후 종료를 영구 차단하지 않는다. 아직 끝나지 않은
작업은 계속 기다리며, 실제 drain callback 실패는 고정 종료 오류에 합산한다.
이는 OS 동작을 강제로 취소하거나 불확실한 변경을 자동 롤백하는 기능이 아니다.
실제 상승 권한 worker의 비정상 고아화·자손 소유권을 증명하는 Windows Job 계층은
이번에 추가하지 않았다. 정상 `Start-Process -Wait` 경로와 JS 작업 합류 검사를
상승 권한 프로세스의 모든 장애 종료 확인으로 확대하지 않는다.

## Windows worker의 허위 성공 방지

기존 PowerShell revoke는 SMB 해제·LocalUser 삭제 오류를 무시하고 ACL 명령의
종료 코드를 검사하지 않은 채 성공을 기록할 수 있었다. remove도 일부 오류를
같은 방식으로 무시했다. 조회 실패와 성공한 조회의 미존재를 구분하고, 대상 share
경로와 이름을 확인한 다음 해제/삭제와 그 결과를 확인한다. ACL 제거 명령의 실패도
거절한다. 이미 없는 share/user는 성공한 조회로 확인된 경우에만 멱등 처리한다.

Microsoft의 [icacls 공식 문서](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)에
따르면 `/c`는 오류 후에도 처리를 계속하고 `/q`는 성공 메시지만 줄인다. 따라서
이 옵션만으로 성공을 추정하지 않는다. `/findsid`는 Deny를 포함한 명시적 SID를
찾으므로 그 출력의 존재를 단순히 남은 grant로 해석하는 검사는 추가하지 않았다.
worker 오류 결과에는 고정 메시지를 사용한다.
상승 권한 worker는 숨김 창으로 실행하며 기존 UAC 승인·취소 흐름과 비밀번호를
명령줄에 넣지 않는 계약은 유지한다.

이는 모든 열린 파일 handle·SMB 세션·외부 상속 ACL의 분산 철회를 증명하지 않는다.
실제 Windows 설치 환경의 정상/실패/재시도 수용은 별도로 필요하다.
Core 응답 유실이나 최종 저장 실패 뒤의 모든 상태를 자동으로 수습하는 영속 작업
저널은 이번 변경에 없다. 서로 다른 route나 모호한 이전 자격은 덮어쓰지 않고
명시적 재조회·조정이 필요한 상태로 거절한다.

## 이전 후보 CI와 구분

Source `9229548` / Core `2417d613` push `40694180597`에서 Linux 전체 타입·빌드와
9개 shard가 통과했다. Desktop `122836453194`의 이전 정적 회귀 검사와 bootstrap,
보안 저장소·Core Settings, No-AI Workspace, prepared Host 관리, 기존 public SDK
TLS 연결 검사도 통과했다. push와 PR `40694190799` 모두 source/packaged Workspace
실행 제어·재시작, packaged Owner Host/Job supervisor, packaged surfaces 검사까지
통과했다. 두 run은 packaged preview도 통과한 후 Host plugin lifecycle 단계에서
실패로 종료했다. 뒤 Node 검사는 건너뛰었다. 실패 원인은 정확한 단계 로그로 별도
확인하며, 새 공유 변경이 포함되지 않은 후보의 결과와 구분한다. 보안 audit의
기존 Zod High 실패도 유지한다.

## 이번 변경 집중 검증

root의 최종 선택 실행은 관련 12개 파일 **116개 중 114개 통과, 2개 환경 skip,
실패 0개**였다. 실행 전후 4개 제품 모듈과 선택 테스트의 SHA-256이 같았다.
개별·앞선 실행과 겹치므로 합산하지 않는다.

- 실제 Main grant/revoke·legacy 폴더 IPC VM 23개: 정상 부여·해제와 저장,
  늦은 상태/Windows 응답 후 교체 계정 보존, 기존 자격 유지, 동시 Node grant 병합,
  Windows 사용자 이름의 대소문자 충돌, 다른 폴더·Core route 거절.
- queue 6개, runtime drain 7개, Windows worker 계약 8개, 실제 Main metadata VM
  8개. 로컬 메타데이터는 사설 팀 연결 없이 사용되며, 삭제의 자기 mapping 변경과
  실패 시 로컬/Core 변경 가능성도 검사한다.
- 기존 조회·IPC·Source·멤버 분류 25개, Core Settings·preload 30개, fixture 9개
  중 7개 통과·2개 환경 skip. 기존 fixture 검사는 교체하지 않았다.
  skip은 directory symlink 생성 권한/지원 부재와 서로 다른 8.3 alias 부재였으며,
  Windows junction 거부 검사는 통과했다.

`refreshProjects`에 원래 scope를 넘길 수 있도록 private 인자가 추가돼 기존
preload 검사 1개가 추출 실패했다. 함수 경계·기본 scope/전달 scope 검증을 보강하고
기존 endpoint·fallback·mapping·저장·화면 검사는 그대로 유지해 재통과했다.
중간 정상 default 폴더 저장의 scope 갱신 누락과 삭제 오류의 잘못된 변수 참조도
집중 검사·검토에서 고친 뒤 최종 실행을 통과했다.

제품 JS 구문·diff와 unchanged Core/SDK candidate 문서 check가 통과했다.
PowerShell worker 원문 구문 분석도 통과했지만 실행하지 않았다. 이번 VM/주입
검사는 실제 Electron·Windows 공유·UAC·설치·원격 Runner 수용 증거가 아니다.
전체 로컬 suite·Core 전체 빌드·DB·실제 Windows E2E를 반복하지 않았다.

## 미완료 범위

공유 권한의 실제 OS 수용, 전원/프로세스 비정상 종료 중 복구, 영속 Runner 완료
receipt와 claim 세대, Plugin 자손 관리, 패키지 crash recovery, 설치·업데이트·
롤백/복원 및 기존 보안 gate는 남아 있다. 현재 UI/로컬 기록을 실제 원격 철회나
OS 격리 완료의 근거로 사용하지 않는다.
