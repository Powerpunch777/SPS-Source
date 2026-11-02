# Plugin 플랫폼 구현 순서

갱신: 2026-11-02. [원문 기준](DESIGN-BASELINE-2026-11-02.md)의 이행 계획이다.
이번 수정으로 구현이나 장기목표를 재개하지 않는다.

1. Core/Native/SDK/Plugin의 실제 경계와 GAP01~15 및 보호 실현 가능성을 재감사한다.
2. Plugin 코드 없이 동작하는 Native 관리·복구를 먼저 완성하고 기존 데이터/API를 보존한다.
3. 빈 Workspace, optional Primary0~1, 여러 Extension과 강제 Core 메뉴 없는 전체 Plugin UI를 연결한다.
4. 다중 창·백그라운드, Workspace별 초기화·백업/복원·명시적 업데이트·롤백을 검증한다.
5. CLI/스크립트/자식까지 최대 파일 범위·Vault 보호와 pause/stop/재시작/취소 부활 방지를 실증한다.
6. Workspace 자원 관찰과 공유 비용 표시, 동의 기반 오류 전송을 구분해 검증한다.
7. 공통 Preview의 선택형 공개 계약과 범용 Builder/외부 IDE 제작을 지원한다.
8. Marketplace 검사·배지·유통은 별도 단계와 권한/라이선스 결정 후 진행한다.

각 단계는 현재 고정 SDK/DB/API를 조사해 기존 기능을 먼저 재사용한다.
Room/Task/Lead/조직·업무 메모리 모델, 고정 터미널/UI 또는 일반 도메인 네트워크
allowlist를 Core에 새 필수 기능으로 넣지 않는다.
새 보안 경계는 API 장식이나 Job Object만으로 충족한 것으로 표시하지 않는다.
구현·시험 결과·미검증·실패는 해당 리비전별 기록에 남긴다.
