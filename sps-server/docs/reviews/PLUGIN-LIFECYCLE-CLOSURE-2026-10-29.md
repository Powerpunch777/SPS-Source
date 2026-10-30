# Plugin 업데이트·롤백·중지의 종료 확인

기존 Core 실행 기록과 실제 코드가 달라질 수 있는 결함을 수정했다. Marketplace·
Builder 신규 구조·Native 연결·OS 샌드박스 개발은 포함하지 않는다.

## 실제 결함

`plugin-loader.ts`의 `unloadSingle()`은 worker 중지 실패를 best-effort로 처리한다.
기존 lifecycle upgrade는 이 반환을 종료 성공으로 간주해 후보의 packagePath·
manifest·version을 저장했다. 이어지는 activation은 기존 worker가 실행 중이면
재사용할 수 있어, 새 버전 기록 아래 이전 코드가 남을 수 있었다. disable·runtime
restart와 실패한 후보의 rollback도 같은 경계를 통과했다.

직접 Host 시작과 경합하지 않도록 기존 Worker Manager의 Plugin별 package mutation
fence를 사용한다. 정확한 worker 종료를 확인한 뒤 Host 등록을 해제하고 pointer·
상태를 바꾸며, fence를 해제한 뒤 현재 기록을 활성화한다. 기존 Workspace lifecycle
coordinator와 결합하되 다른 Plugin을 중지하거나 전체 Host Job을 종료하지 않는다.

## 변경 결과

- 기존 worker 종료가 불확실하면 unload·upgrade_pending·새 pointer 저장 전에
  거절한다. 기존 버전과 Core 등록을 먼저 손상시키지 않는다.
- 후보 runtime 정리나 worker 종료에 실패하면 기존 pointer로 덮어쓰지 않는다.
  pointer와 상태 복원이 모두 성공해야 이전 runtime을 다시 활성화한다.
- runtime restart도 종료 확인 후 등록을 갱신한다. runtime이 없는 bare restart는
  동일 handle을 fence 안에서 멈추고 종료를 확인한 뒤, fence 밖에서 소유권을 다시
  확인하고 시작한다. 자기 fence 때문에 정상 시작을 거절하는 중간 회귀를 수정했다.
- 직접 stop 요청은 실제 중지 실패를 전달하고, handle이 제거된 경우에만 stopped
  이벤트를 보낸다. 중지 Promise가 resolve해도 handle이 남으면 성공으로 알리지 않는다.
- Worker Manager와 runtime services가 없는 기존 메타데이터 전용 방식은 유지한다.
  실행환경이 있는데 process owner가 없는 구성은 종료를 증명할 수 없어 거절한다.
  실제 artifact 삭제는 기존의 더 엄격한 manager/permit 조건을 그대로 요구한다.

`ready` package 기록은 runtime 전체의 건강함을 보증하는 새 의미로 바꾸지 않는다.
작업 실패·worker 진단과 package 식별은 구분한다. 새 migration·SDK wire 형식·
승인 완화·자동 rollback 재시도는 추가하지 않았다.

## 검증

최종 관련 5개 Vitest 파일 **31개 통과**. 기존 업그레이드 실패/복원·data migration
승인·restart·artifact cleanup과 새 보완을 함께 검사했다. 실제 Worker Manager를
사용하는 합성 검사에서는 DB commit을 보류한 동안 직접 Host start가 실제 admission
gate에서 거절되고 fork가 호출되지 않으며, activation은 fence 밖에서 진행됨을 확인했다.

종료 실패 때 원래 pointer/등록 유지, 후보 정리 실패 때 후보 pointer 보존, 정상
복원, bare restart의 stop/start 순서, 실제 stop 실패/잔여 handle의 이벤트 거절,
메타데이터 전용 호환성과 잘못 구성된 실행환경 거절을 확인했다. 중간 성공 fake는
실제 stop처럼 handle을 제거하도록 보완했으며 기존 기능 검사를 삭제하지 않았다.

cached 서버 타입 검사 exit 0·제품 입력 hash 동일, compatibility boundary·diff
검사가 통과했다. 마지막 변경은 옵션 설명 주석이며 실행 코드는 검증 이후 같았다.
전체 suite·DB·Electron·실제 Plugin 자손·설치/배포 검사는 반복하지 않았다.
정확한 자손 종료의 별도 미완료 경계는
[프로세스 소유권 점검](PLUGIN-PROCESS-OWNERSHIP-2026-10-29.md)에 기록했다.

이 변경은 정상 실행 중 잘못된 버전 전환을 막는 보완이다. 영속 package 작업 저널,
중간 장애 후 artifact 정리·자동 복구 또는 비정상 종료의 전체 자손 소유권을
완료한 것은 아니다.
