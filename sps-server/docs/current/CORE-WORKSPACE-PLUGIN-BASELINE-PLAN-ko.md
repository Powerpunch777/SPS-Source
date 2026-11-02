# Core와 Plugin 기준 이행 계획

갱신: 2026-11-02. [설계 기준](DESIGN-BASELINE-2026-11-02.md)이 우선한다.
기존 API/DB/설치 데이터를 유지하는 비파괴적 이행 목표이며 구현 완료 선언이 아니다.

## 책임

Core는 Workspace 접근, Host/Node, 범용 실행·기록·저장·이벤트·스케줄·Artifact,
패키지 생명주기·보안·진단·복구를 담당한다. Plugin은 Task/Room/Lead/조직·승인·기억·
업무 자동화 및 UI를 정의한다. AI와 Node 연결은 선택 사항이다.

## 기준

- Agent0/Primary0/Extension0을 허용하고 첫 Workspace를 정상 준비한다.
- Primary는0~1개 기본 화면 지정이다. 여러 Extension도 전용 창·전체 UI·헤드리스가 가능하다.
- 패키지는 Host1회 설치하며 활성화·데이터·설정·실행 정책은 Workspace별이다.
- Core 프레임/메뉴를 Plugin에 강제하지 않고 독립 Native 관리와 선택형 SDK 진입을 제공한다.
- 여러 창과 백그라운드 수명을 분리한다. pause/stop/resume은 영속화하고 취소 작업을 부활시키지 않는다.
- Workspace 최대 파일 범위는 선택이며 Plugin의 작업 폴더 및 기존 Source/cwd와 다르다.
- 범위를 설정하면 CLI/스크립트/자식까지 집행한다. 전체 파일 허용에도 Vault 원문은 보호한다.
- 네트워크 기본 자유, CPU/RAM 강제 할당은 보류하고 관찰·공유 비용 표시부터 제공한다.
- 기본 초기화는 현재 Workspace+Plugin 데이터만 대상이며 외부 프로젝트는 건드리지 않는다.
- 자동 업데이트 확인과 사용자 적용·롤백을 분리한다.

## 기존 경로의 보존

현재 Host만 지정하는 Workspace Source·암호화 Node route·실행 grant는 해당 API의
안전한 호환 계약으로 유지한다. 이를 모든 Plugin의 작업 폴더 선택 정책 또는
새 최대 파일 범위 OS 집행으로 확대 해석하지 않는다. 기본 접근 범위를 문서 수정만으로
실제 완화하지 않는다. 보호 미지원 경로는 표시·거부 계약과 실제 실증이 필요하다.

공개 SDK와 Profile1/2, Agent 세션, 모델 API·Node 실행·Artifact·기술 기록은
선택형 기술 기능으로 재사용한다. 선언한 capability만으로 실제 권한/연결이 부여되지 않는다.
Host/Workspace/Source/Runner·현재 사용자 인가와 관리 경계를 유지한다.

## Builder와 Preview

범용 Builder는 권장할 수 있으나 필수 초기 Plugin이나 유일한 제작 도구가 아니다.
별도v15 솔루션 제작 흐름은 Plugin 소유다. SDK/CLI/외부 IDE와 공통 Preview를 동등하게 지원한다.
Preview와 실제 설치/운영 데이터는 분리한다. Marketplace는 별도 확장 단계다.
라이선스/판매 계약을 이 문서에서 확정하지 않는다.

단계별 순서·검증은 [로드맵](ROADMAP.md), 현재 미완성 범위는
[완료 판정](CORE-COMPLETION-POLICY-ko.md)을 따른다. 구현은 이번 문서 작업에 포함하지 않는다.
