# Native 개발 보류 및 재개 기록

최종 갱신: 2026-10-28

**사용자 요청으로 Native 추가 개발을 보류한다.** 당분간 SPS Core와 로컬
Desktop의 실행·설정·권한·복구 안정화에 집중한다. 전체 플랫폼 목표에서 Native를
완료 처리하거나 제거하는 것은 아니다. Native 실기기 검증과 미완료 기능은 아래에
남겨두며, 보류 중에는 이를 이유로 Core 개발을 반복해서 멈추지 않는다.

현재 Native 기본값 OFF와 기존 Tailscale 지원은 유지한다. 이 보류 결정으로 설치된
앱, 고객 데이터, 인증서, 방화벽, OS 신뢰 설정이나 보안 검사 정책을 변경하지 않는다.

## 재현 기준

| 항목 | 마지막 커밋 기준 |
| --- | --- |
| SPS Source | `1d16f36dacbde309a89a0bea79fef83c335f0e99` |
| SPS Core | `7c8b87ab7bb6ed744b16b8f6dd6611949084aeae` |
| 공개 Plugin SDK | `61a929f6c783f78e5af603682de1543c7e24abc0`, 미출시 `0.11.0` |
| SPS Desktop | `0.4.137`, development-candidate |

위 표는 보류 결정 당시의 재현 기준이다. 이후 Core 개발로 변경되는 최신 조합은
[CURRENT-CANDIDATE.md](CURRENT-CANDIDATE.md)에서 확인한다. 과거 조합의 테스트를
새 조합의 통과 증거로 재사용하지 않는다.

## 이미 구현한 범위

- Core가 장치 등록·인증·승인·철회와 감사 기록을 관리하고, Desktop Main이 TLS와
  보호된 Host/Member 키 저장을 담당하는 구조가 있다. AI Agent와 Plugin은 등록의
  필수 조건이 아니다.
- Main의 실제 TLS 증거를 Core에 전달하는 사설 IPC 경로, 세션 교환, 인증서 발급,
  등록 완료, 중단된 등록의 재확인 경로가 있다.
- 인증서 갱신도 Core·Desktop Main·설정 화면에 연결되어 있다. 현재 인증서와
  승인된 장치, 같은 키, 유효한 세션을 확인하며 명시적 사용자 확인과 보호된 저장을
  사용한다. 만료된 인증서의 자동 갱신이나 자동 승인으로 해석하지 않는다.
- 선택된 Workspace 조회, Shell·Dashboard·Inbox 일부 기능, Plugin 화면의
  데이터·동작 호출, Node/Source 관련 제한된 경로가 구현되어 있다. 구현한 경로가
  모든 Native API나 실제 LAN 환경에서 검증됐다는 뜻은 아니다.
- 공개 SDK의 `connectivity.current()`는 현재 Plugin 호출의 연결 관찰 정보만
  제공한다. 장치 등록·인증서·네트워크 관리 권한은 SDK로 공개하지 않는다.
- 선언한 Workspace worker는 별도 프로세스와 설정을 사용한다. 같은 OS 사용자로
  실행되므로 Windows 파일·네트워크·Vault 격리가 완성된 것은 아니다.

## 마지막 검증 결과와 오류

Source `1d16f36`의 자동 push CI `40644828020`은 실패했다. Core 전체 Linux
타입 검사·빌드와 모든 Linux 테스트 shard는 통과했으며, 보안 검사와 Windows
Desktop 검사가 실패했다. PR CI `40644835905`에는 별도의 권한 경계 테스트
5초 시간 초과도 있었다. 두 실행의 결과를 하나의 전체 통과로 합치지 않는다.

Windows job `122671084543`에서는 임시 PostgreSQL 시작 단계와 앞선 Desktop
단계를 넘어 공개 SDK의 실제 Core 호출까지 진행했다. 다음 값 차이로 실패했다.

| 연결 관찰 | 기대 | 실제 |
| --- | --- | --- |
| state | verified | unavailable |
| authorization | authorized | unknown |
| evidence | authenticated_request | none |
| hostId | 현재 Host ID | null |

원인은 Workspace 전용 worker의 Host 호출 context에서
`readNativeConnectivity` 전달이 누락된 코드 경로로 확인했다. 보류 전에 로컬에서
수정했고 실제 공개 SDK/worker를 이용한 선택 검사 1개가 통과했다. 권한 철회 중
늦게 도착한 연결 응답도 차단하는 경우를 포함한다. 이 수정은 보류 결정 당시
진행 중인 로컬 변경에 포함되어 있으며, 새 커밋에서 Windows 전체 검증을 마친
것으로 표시하지 않는다. 기존 Native 코드와 수정 내용을 폐기하거나 되돌리지 않는다.

Core의 새 Workspace 설정 migration0173 검증은 같은 push CI의 server1/3
job `122671085018`에서 실행됐다. `sps-native-plugin-runtime.test.ts` 16개가
통과했고, 해당 shard 전체는 117개 파일·1073개 검사 통과였다. 이는 Linux에서의
DB 제약·revision/ABA·Workspace 구분·cascade·truncate 증거이며 물리 LAN 증거는 아니다.

보안 검사에는 승인된 예외가 없는 Zod High `1243066`이 남아 있다. 사용자가 보류한
Zod major 전환이나 보안 예외를 이 문서로 승인하지 않는다.

과거 로컬 Native enrollment DB 검사는 준비 단계 시간 초과로 실패한 기록이 있다.
정리가 확인되지 않은 임시 폴더·프로세스를 후속 작업이 임의로 인수하거나 삭제하지
않는다. 원래 실행의 소유권과 종료 증거가 필요한 기존 원칙을 유지한다.

## 미완료로 남기는 항목

1. 위 연결 관찰 수정의 새 조합 Windows Core→SDK→Electron 검증과 실제 종료·정리 확인.
2. Native Plugin의 이벤트·스트림·페이지 이동 및 필요한 전체 API·리소스 전송 통합.
   로컬 Desktop SSE를 구현하더라도 이를 Native 원격 스트림 완료로 간주하지 않는다.
3. 실제 Windows Host/Member/Node 여러 대의 LAN 연결, 연결 끊김·재시작·갱신·철회 후
   복구, Source/SMB 및 실행 grant의 동작 확인.
4. 실제 계정과 보호된 자격증명 저장을 사용하는 등록·승인·해제·중단 복구·인증서
   갱신의 제품 검증. 테스트용 Identity 대체나 임시 키만으로 완료 판정하지 않는다.
5. OS 권한 격리, 선택적 실제 AI/CLI 실행, 서명된 설치·업데이트·롤백·데이터 보존과
   함께 확인하는 최종 배포 검증.

## 재개 순서

1. 최신 Source/Core/SDK 조합과 작업 폴더 변경을 확인한다. 이 문서의 과거 SHA로
   무조건 checkout하거나 현재 Core 변경을 덮어쓰지 않는다.
2. 기록된 연결 관찰 수정이 커밋됐는지 확인하고, 해당 경로의 작은 회귀 검사부터
   실행한다. 전체 검사를 먼저 반복하지 않는다.
3. 필요할 때 해당 Windows CI 단계의 새 실행을 확인해 실제 실패 지점을 찾는다.
   시간 초과를 늘리거나 권한·정리 검사를 약하게 만들어 통과시키지 않는다.
4. Native의 빠진 기능을 하나씩 연결한 뒤 실제 Host/Member 환경에서 검증한다.
   실기기 결과에는 정확한 조합과 연결·철회·재시작·정리 증거를 남긴다.

관련 기록:

- [Workspace Plugin 통합](../reviews/WORKSPACE-PLUGIN-PROCESS-INTEGRATION-2026-10-28.md)
- [CI 후속 수정](../reviews/WORKSPACE-PLUGIN-CI-FOLLOWUP-2026-10-28.md)
- Core `doc/SPS-NATIVE-MAIN-INGRESS.md`
- Core `doc/SPS-WORKSPACE-PLUGIN-WORKERS.md`

Marketplace 정책 변경과 Plugin Builder 구조 개편은 계속 개발 범위에서 제외한다.
