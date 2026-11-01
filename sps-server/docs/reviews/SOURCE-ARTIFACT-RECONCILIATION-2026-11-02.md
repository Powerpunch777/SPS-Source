# Source 정보와 Desktop 폴더 대조

2026-11-02 KST. Core `7192377577230eb362417406a6579639b25d6d35`.
비공개 정리 관측 경로의 후속 구현이다.
이 문서는 파일 삭제 승인이나 Core 완성 선언이 아니다.

## 구현 범위

- 직접 소유한 Core 자식 프로세스에만 기존 비공개 IPC의
  `sourceInventory:true`를 명시해 Source 정보를 요청한다. 기존 요청의 응답
  형태는 유지하며, 정보를 제공하지 못하는 Core를 빈 목록으로 취급하지 않는다.
- Core와 Desktop이 각각 정확한 필드·ID·날짜·관계·개수·크기를 검사하고
  fingerprint를 다시 계산한다. 배열과 행은 복제·동결한다. 최대 Source4096개,
  grant16384개, inventory 본문6MiB이며 기존 전체 응답8MiB 제한도 유지한다.
- Core의 모든 보존 Workspace Source·이전 project share와 grant가 대상이다.
  비활성 Source와 회수된 grant도 누락하지 않는다. 실제 DB는 한 read-only
  repeatable-read transaction에서 읽는다.
- 실제 Main은 현재 소유한 Host의 정확한 origin과 `owner-host` 연결,
  Workspace ID·Source ID 또는 project resource ID가 모두 일치하는 저장 경로만
  대조한다. 이름·기본 폴더·다른 Host·다른 Workspace로 경로를 추측하지 않는다.
- 같은 Source의 저장 경로가 충돌하면 거부한다. 동일 경로의 중복 보존은
  허용하되 Windows에서는 경로 대소문자를 구분하지 않는다. 실제 공유 상태의
  로컬 경로·UNC route hash·활성 grant Node 집합이 Core와 정확히 맞아야 한다.
  회수 grant는 Core 기록에 남지만 활성 Node 집합에는 포함하지 않는다.
- 고아 share, 다른 계정의 저장 경로와 기본 폴더도 기존 보호 참조에 남긴다.
  현재 Source에 대응되지 않는다고 삭제하거나 새 폴더에 연결하지 않는다.
- Preview inventory도 별도로 검사한다. Preview Source가 비어 있지 않으면
  Host 폴더 매핑을 빌려 쓰지 않고 중단한다. Preview 전용 경로 대조 계약은
  아직 없으므로 이 경우 정리 관측은 사용 불가다.
- 입력 대조는 동기식이며, 누락·Promise·잘못된 요약·변경된 권한은 거부한다.
  결과에는 Source/grant 개수와 fingerprint만 남기며 경로·자격증명은 넣지 않는다.

원시 UNC·로컬 경로·표시 이름·credential envelope는 Core inventory IPC에
추가하지 않는다. 공개 HTTP API·Plugin SDK·DB schema·권한 변경은 없다.
기존 Plugin/Source/Runner 승인 경계를 대체하지 않는다.

## 확인한 증거

Node24.22.1에서 아래8파일을 함께 실행해145/145, skip0, exit0이다.

```powershell
node --test test/desktop-source-reconciliation.test.mjs test/desktop-source-artifact-references.test.mjs test/desktop-artifact-inputs.test.mjs test/source-artifact-inventory.test.mjs test/plugin-artifact-parent-client.test.mjs test/plugin-artifact-parent-process.test.mjs test/plugin-artifact-observation.test.mjs test/desktop-artifact-context.test.mjs
```

직접 fork한 시험 자식은 실제 Core의 TypeScript IPC·maintenance·reference reader를
사용한다. 명시적 inventory 수신·응답 누락 거부·관측 중 Source 변경 거부·이후
Desktop 불확실성 유지와 정상 종료를 확인했다. 이 자식의 Source 행은 합성
fixture이며 실제 DB와 사용자의 폴더를 사용한 증거는 아니다.

초기 하위 에이전트 테스트3건은 잘못된 fixture/기대값으로 실패했다. 누락 grant를
실제로 누락시키고, 계약이 아닌 참조 순서 비교를 집합 비교로 바꿨다. Host 포트를
31310으로 고정하는 대신 전달된 실제 canonical loopback origin과 profile의 정확한
일치를 검사했다. 수정된15건은 위145건에 포함되며 구현을 느슨하게 바꾸지 않았다.

부모가 Node24.22.1에서 다음7파일을 한 번에 실행해66/66, skip0, exit0을 확인했다.
실제 격리 PostgreSQL4건이 포함된다. 독립 Luna도6파일62건과 DB4건을 별도로
실행해 통과했고, 전체30개 workspace의 typecheck/build와 compatibility 경계 검사도
exit0이었다. 빌드의 기존 CSS/Lexical·큰 chunk 경고는 해결했다고 주장하지 않는다.

```powershell
pnpm exec vitest run --project @paperclipai/server --no-file-parallelism --maxWorkers=1 server/src/__tests__/sps-source-artifact-inventory-dto.test.ts server/src/__tests__/sps-source-artifact-inventory.test.ts server/src/__tests__/sps-source-artifact-inventory-db.test.ts server/src/__tests__/sps-plugin-artifact-references.test.ts server/src/__tests__/sps-plugin-artifact-parent-channel.test.ts server/src/__tests__/sps-plugin-artifact-parent-paths.test.ts server/src/__tests__/plugin-recovery-startup-contract.test.ts
```

`node --test test/owner-host-artifact-channel.windows.test.mjs`도 Node24에서1/1,
exit0이었다. 실제 Windows Job 안의 owned Host·Preview Core 두 개가 새 inventory를
DB에서 읽었고, 필수 Desktop 대조의 frozen receipt를 반환했다. 이 fixture의 Core
Sources는 실제로 비어 있으며, nonempty DB-to-Desktop/SMB 검증으로 확대하지 않는다.
기존 경로 sentinel 보존, 관측 중 Source 변경 거부와 정상 종료·정확한 임시 데이터
정리도 확인했다. 단독 검사 당시 Source는 아래 최종 통합 커밋 전 worktree다.

Desktop 전체 검사와 최종 통합 후보의 실제 앱 결과는 별도 후속 증거가 필요하다.

## 남은 필수 조건

이는 메타데이터 대조와 변경 감지이지, 모든 Source/Workspace/project/Node
변경·삭제 cascade를 막는 완전한 fence가 아니다. Windows 실제 SMB ACL이나
credential의 효력을 검증하지 않는다. Native 재시작·모호한 claim 처리도 별개다.
따라서 실제 Main의 `cleanupReady:false`는 유지한다.

소유권·전체 파일 inventory에 따른 정리 자격 판단, 현재 Host/계정의 새 확인,
선택 항목만 제거하는 경로와 Settings UI는 아직 남아 있다. 최종 후보의
Windows/Linux/Electron/설치본·이전 DB·0.4.86 복구·SQL crash·비정상 종료·실제
두 PC 검증과 별도 Builder v15의 실제 AI/Runner 구현도 완료 처리하지 않는다.

기존 사용자 앱·프로필·원본 dirty checkout·AppData·Vault·외부 프로젝트·Production은
변경하지 않는다. 정리 도구를 개발한다는 이유로 현재 설치 파일을 삭제하지 않는다.

참고한 공식 자료는 [PostgreSQL repeatable-read 설명](https://www.postgresql.org/docs/current/transaction-iso.html)과
[Node SHA-256 API](https://nodejs.org/api/crypto.html#cryptocreatehashalgorithm-options)다.
관련 구현은 기존 SPS private reader/IPC를 확장했으며 외부 코드를 복사하지 않았다.
