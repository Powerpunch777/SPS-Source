# 재부팅 후 Workplane 검증 기록

Updated: 2026-07-14

## 결과

재부팅 뒤 SPS 데이터, Room 세션, 승인 메모리와 Agent 지침은 보존됐다. SPS 로컬 코어와 Memory Sidecar를 다시 기동한 뒤 Workplane readiness는 `ready=true`였고, 실행 중인 Agent run은 0개였다.

기존 `SPSLocalServer` 예약 작업에는 로그온 또는 부팅 트리거가 없어 재부팅만으로 시작되지 않았다. 관리자 권한이 필요하지 않은 사용자 범위의 `SPSWorkplaneStartup` 작업을 새로 등록했다. 이 작업은 사용자 로그인 시 `Start-SPS.ps1`을 실행하므로 SPS과 Memory Sidecar를 함께 복구한다. 직접 실행 결과는 `LastTaskResult=0`이었다.

재현 가능한 설치 경로는 `scripts/Install-SPSWorkplaneStartup.ps1`이다.

## 운영 상태

- SPS 로컬 코어: `http://127.0.0.1:3100`, 정상
- Memory Sidecar: `http://127.0.0.1:3188`, 정상
- `local.room-chat` 0.3.15: `ready`
- `local.memory-sidecar` 0.1.4: `ready`
- 승인 메모리 33개, 후보 13개, 경고 0개
- CTO와 Code Worker readiness: 정상
- 회사 Agent 지침: 고용 Agent 9명 전부 통과

## 검증

- Room Chat 플러그인 `npm run check`: 전체 통과
- SPS 핵심 코어 묶음: 218개 통과, 32개 환경 제외, 실패 0개
- Windows에서 샌드박스 브리지 테스트가 `/bin/sh`와 Windows 드라이브 경로를 직접 사용하던 문제를 테스트 실행기에서 보완
- 사용자 로그인 작업 직접 실행: 성공, SPS과 Memory Sidecar 포트 유지

이번 검증은 실제 비용이 드는 Agent turn을 새로 만들지 않고 서비스, 플러그인, 저장 상태와 작업 계약을 확인했다.
