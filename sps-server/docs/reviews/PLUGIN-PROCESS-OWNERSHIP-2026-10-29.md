# Plugin 프로세스 소유권의 남은 경계

Core 완성을 위한 기존 프로세스 생명주기 점검이다. 공개 Marketplace·Builder 신규
구조·Native 연결 추가 개발·비신뢰 코드 OS 샌드박스는 범위가 아니다. 같은 OS
사용자의 승인된 Plugin도 자식 프로세스를 만들 수 있으므로 프로세스 정리 책임은
샌드박스 보류와 별개로 남는다.

## 확인한 구현

packaged Windows Owner Host는 `WindowsJobSupervisor.cs`가 정확히 시작한 Core를
kill-on-close Job에 넣는다. Core 직접 종료·Desktop control pipe 손실에는 소유한
Job 전체를 정리하고 확인한다. `desktop-node/test/windows-host-job-native.test.mjs`의
Host 자손/제어 연결 손실 검사와 `windows-job-supervisor.test.mjs`의 실제 자손
canary가 이 경로를 다룬다. 이번 점검에서 해당 OS 검사를 반복하지 않았다.

이 Host 단위 Job이 있는 경우와 단독 Core 실행은 구분해야 한다. Host Job이
있다는 사실만으로 Plugin 하나의 중지·재시작이 그 자손까지 정리된다고 할 수 없다.

Core `plugin-worker-manager.ts`는 직접 `fork()`한 worker의 exit와 stdio close를
구분하고 정확한 handle을 보존한다. 그러나 현재 stop/crash/restart의 확인 범위는
그 직접 worker다. 그 worker가 `stdio:ignore`로 자식을 만들면 직접 worker의 close
뒤에도 자식이 Host Job 안에 남을 수 있다. 이때 Host Job을 종료하면 다른 Plugin과
Core 서비스까지 중지하므로 선택 Plugin의 정리 방법으로 사용할 수 없다.

기존 `plugin-worker-shutdown.cjs` fixture와 `plugin-worker-close.test.ts`는 직접
worker 종료/stdio를 검사한다. 해당 검사 통과를 선택 Plugin의 전체 process tree
종료 증거로 확대하지 않는다.

## 구현 시 유지해야 할 조건

기존 Desktop Node의 `spawnWindowsJobSupervisor()`는 Windows Job 시작·취소·자손
정리 확인을 재사용할 후보다. Core worker RPC는 stdin/stdout NDJSON을 사용하며,
현재 manager의 fork IPC `.send` 채널 사용은 확인되지 않았다. 다만 다음 조건을
충족하기 전에는 Windows fork를 단순 치환해 완료로 처리할 수 없다.

- standalone Core도 Desktop 자산 경로에 의존하지 않고 helper를 준비·패키징할 것.
- supervisor PID와 실제 worker PID를 구분하고, helper close만으로 성공을 추정하지
  말고 소유 Job의 종료 확인을 기다릴 것.
- worker 생성 전에 Job 소유권을 확보해 초기 module 코드가 만든 자손도 포함할 것.
- 중지와 자연 crash 모두 자손 정리를 확인한 뒤에만 stopped/restart를 진행할 것.
- 종료가 불확실하면 원래 handle·등록 상태를 보존하고 다른 Plugin은 중지하지 않을 것.
- 최소 환경 변수·execArgv·RPC·서비스 권한과 정상 startup/stop 경합 방어를 유지할 것.
- 실제 자손 fixture로 정상 중지·crash·부모 손실·다른 worker 생존을 검증할 것.

임의 PID나 프로세스 이름·단순 경로 검색은 정확한 소유권의 대체가 아니다.
위 조건의 구현과 실제 수용 검증은 아직 미완료다. 이 점검은 코드·기존 테스트의
범위 확인이며 새 OS 격리 구현 또는 전체 Core 완료 선언이 아니다.
