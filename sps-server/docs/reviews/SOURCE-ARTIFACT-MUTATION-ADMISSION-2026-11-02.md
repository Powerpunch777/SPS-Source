# Source 변경과 정리 관측의 동시 실행 차단

2026-11-02 KST. Core runtime `4c674b8c6baf7f065fc92262b8f6e66033ad9d39`,
문서 보정 포함 HEAD `d0b99baef5d8422ab0473ea4b1909e55ab6518b8`.
기존 private maintenance coordinator를 실제 Source 변경 경로와
연결하는 후속 구현이다. 삭제 승인·Core 완료·Stable 출시 선언이 아니다.

## 바뀐 경로

실제 `createApp`이 private reference reader와 같은 coordinator를 다음에 전달한다.

- Workspace Source 생성·수정·삭제와 Node grant 부여·회수5개 경로.
- 이전 project share 생성/갱신·grant 부여·회수3개 경로.
- Node 승인·회수·연결 해제와 기술 Member 회수4개 경로.
- 프로젝트 삭제 service와 Workspace 삭제 service의 cascade SQL.
- Workspace 삭제 HTTP 경로는 Worker/실행 정리 시작 전부터 전체 작업을 묶는다.
  정리 관측이 진행 중인데 실행을 먼저 멈춘 뒤 삭제만 거부하는 순서를 피한다.

기존 로그인·Host·Workspace·Node 권한 검사를 먼저 수행한다. 허용된 변경 작업은
첫 관련 조회/쓰기 전부터 실제 await 작업·SQL 커밋/롤백·해당 audit가 끝날 때까지
activity에 포함한다. 서비스 삭제는 실제 SQL settlement까지 유지하며, 라우트에
있는 별도 후행 audit까지 모두 같은 service에 포함된다는 뜻은 아니다.

관측 중 변경 요청은 고정 `SPS_PLUGIN_ARTIFACT_MAINTENANCE_BUSY`의409를 반환한다.
반대로 변경이 이미 진행 중이면 관측을 거부한다. 대기·강제 취소·자동 재시도·
새 권한은 추가하지 않았다. GET 조회와 기존 정상 응답은 유지한다.
별도 DB 잠금·스키마·마이그레이션·SDK capability는 추가하지 않았다.

기존 private factory의 optional coordinator를 생략한 호출은 이전 동작을 유지한다.
이 호환 경로를 새로 조정된 관측/정리 경로로 취급하면 안 된다. 실제 앱 조합은
공유 coordinator를 명시적으로 전달한다. 이는 한 owned Core의 application-level
admission이며 외부 SQL 세션이나 임의 same-user 프로세스를 막는 보장은 아니다.

## 검증

Node24.22.1에서 신규·기존 Source/Node/maintenance6파일58건과 기존 회사·프로젝트·
삭제/권한·inventory/reference9파일58건을 별도로 실행해 모두 통과했다. 초기
신규2파일7건 통과 후 실제 transaction 커밋/롤백2건을 추가했다.

실제 격리 PostgreSQL에서는 private reference reader가 관측을 유지한 동안
Source/share/grant·Node·Member·프로젝트/Workspace 삭제14요청을 보내 모두409를
확인했다. inventory는 변경되지 않았고 Worker drain도 호출되지 않았다. GET200,
Host 증명 없는 요청403, 관측 종료 후 정상 Source 수정200도 확인했다.
서비스 직접 호출에서도 프로젝트/Workspace cascade가 막힌 뒤 정상 삭제되는지,
실제 cascade SQL 실행 후 커밋 또는 롤백을 기다리는 동안 관측이 거부되는지를
검사했다. 롤백 때 Source와 grant가 그대로 남는 것도 확인했다.

Mock DB/Express 검사는 admission 이전에 Source DB를 읽거나 쓰지 않는 것,
실제 요청이 진행/실패할 때의 release, GET 허용을 별도로 확인한다. 실제 DB와
mock 검사는 서로 다른 증거다. 시험 DB 종료와 임시 데이터 정리는 await한다.

최종15파일 통합 명령은116/116, skip0, exit0이었다. 로그는 Git에서 제외된
`desktop/dist/source-mutation-final-tests-20261102.log`다.

```powershell
pnpm exec vitest run --project @paperclipai/server --no-file-parallelism --maxWorkers=1 server/src/__tests__/sps-source-artifact-mutation-db.test.ts server/src/__tests__/sps-plugin-artifact-mutation.test.ts server/src/__tests__/sps-plugin-artifact-maintenance.test.ts server/src/__tests__/sps-workspace-source-artifact-admission.test.ts server/src/__tests__/sps-workspace-sources-routes.test.ts server/src/__tests__/sps-nodes-routes.test.ts server/src/__tests__/companies-route-cross-company-authz.test.ts server/src/__tests__/sps-workspace-execution-delete-guard.test.ts server/src/__tests__/project-routes-env.test.ts server/src/__tests__/project-goal-telemetry-routes.test.ts server/src/__tests__/project-shortname-resolution.test.ts server/src/__tests__/projects-service-invalid-id.test.ts server/src/__tests__/sps-source-artifact-inventory-db.test.ts server/src/__tests__/sps-plugin-artifact-parent-channel.test.ts server/src/__tests__/sps-plugin-artifact-references.test.ts
```

전체30개 Core workspace typecheck/build, compatibility 경계와 shard 분류5건도
통과했다. 기존 큰 chunk/CSS/Lexical 경고를 해결한 것으로 기록하지 않는다.
추가된 DB suite는 stable runner의 serialized 집합에 명시적으로 포함했다.
최종 통합 Core·Source 커밋과 실제 두 owned Core/Desktop 전체/앱 결과는
후속 기록으로 구분한다. 진행 중 검사를 미리 통과로 표시하지 않는다.

첫 `node --test test/owner-host-artifact-channel.windows.test.mjs`는 Node24에서
1/1, exit0이었다. 실제 owned Host·Preview Core를 Windows Job 안에서 실행해
Host HTTP API로 Workspace와 Source1개를 만들고, 보호된 로컬 폴더와 대조했다.
관측 중 실제 API Source 생성409·목록200·기존 Source1개 유지, 관측 종료 후
수정200을 확인했다. 두 프로세스의 정상 종료·정확한 임시 데이터 삭제와 외부
작업물 sentinel 보존도 확인했다. 이 실행 당시 Source는 pin 커밋 전 worktree다.
실제 SMB/물리 두 PC/서명 설치본 또는 Settings 정리 UI를 검증한 것은 아니다.

Source `24c6e2364c3cf94b416f19086e47c01aab64d5bf` / Core4c의 Node24 전체 Desktop
검사는 직렬4/4와 나머지2208/2211, 합계2212/2215·skip3·실패0·exit0이었다.
위 nonempty Source 실제 두 owned Core 검사가 포함됐다. 무시된 로그는
`desktop/dist/source-mutation-final-desktop-node24-20261102.log`다.

독립 Luna 검수에서 새 runtime 결함은 발견하지 못했으며, project service 뒤의
HTTP audit까지 잠금에 포함된 것처럼 읽힐 수 있는 Core 계약 문구를 지적했다.
실제 범위를 Core 문서d0b99ba에서 명확히 했다. 기능 코드는4c와 같지만, 새 pin의
정확한 전체 Desktop/실제 앱·CI 증거는 별도로 확인한다.

## 남은 범위

Main의 `cleanupReady:false`는 유지한다. Native의 모호한 재시작/claim 처리,
전체 실행 소유권, artifact 소유권·완전한 파일 inventory의 자격 판단, 현재 Host와
계정의 새 확인, 선택 삭제와 Settings UI·실제 조작 검증은 아직 남아 있다.
이 문서의 두 Core 시험은 물리적 두 PC 검증이 아니며, Builder의 실제 Lead3세션·
공유 기억·CTO 단일 세션·독립 Dev/QA·GitHub Actions 납품도 대체하지 않는다.
기존 사용자 앱·프로필·원본 dirty checkout·AppData·Vault·외부 프로젝트와
Production은 사용하거나 변경하지 않는다.

참고한 [PostgreSQL explicit-locking 문서](https://www.postgresql.org/docs/current/explicit-locking.html)는
DB 잠금과 application admission의 차이를 확인하는 자료다. 외부 코드를 가져오거나
긴 DB table lock을 새로 추가하지 않고 기존 SPS coordinator를 재사용했다.
