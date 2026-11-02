# Builder 설계 초안 저장과 표시 검증

## 범위와 상태

Builder 코드 기준은 `0feab9a`, Core는 `32a3f9f`, 공개 SDK는 `316c56f`다.
Builder 레포 v15/UI v9를 따르는 중간 단계이며 전체 Builder 완료나 새 릴리스가 아니다.
Core에는 Lead/CTO/Worker 역할이나 설계 승인 정책을 추가하지 않았다.

현재 Lead는 실제 사용자 입력의 ID를 조회하고, 그 입력을 인용한 요구사항·Graph·질문을
승인 전 초안으로 저장할 수 있다. `builder.read-design-sources`, `builder.propose-design`,
`builder.read-design-draft`를 기존 Workspace 도구 호출 경로에 등록했다. 도구는 Core가
확인한 실행 Agent/Run/Session과 Builder의 현재 Lead 선택·세션 revision을 함께 검사한다.
사용자 UI가 보낸 역할·세션 ID를 실행 권한으로 받아들이지 않는다.

인용 대상은 현재 Workspace의 상담 사용자 입력과 현재 Lead main/decisions 대화의 사용자
입력이다. Assistant 답변이나 CTO inbox를 사용자 결정으로 인용하지 않는다. 실제 입력의
SHA-256을 기록하지만 이 해시는 고객 승인이나 내용의 타당성을 증명하지 않는다.

초안은 기존 불변 Revision journal과 조건부 head 저장을 재사용한다. 오래된 revision,
작성 경합, 관측한 Lead/세션 변경과 응답 유실은 자동 재전송하지 않는다. 여러 키의 원자적
transaction이나 모든 순간의 권한 회수 보장은 아니다. 이전 Lead 선택의 초안 branch는
보존되지만 새 Lead로 자동 인계하지 않는다. 공유 기억·명시적 인계 흐름은 아직 남아 있다.

## 자동 검사와 실제 앱 검사

Source Desktop 폴더에서 Node 24.22.1/PATH24와 별도 Builder 절대 경로의
`SPS_BUILDER_SOURCE_ROOT`를 사용했다.

```powershell
node scripts/smoke-builder-conditional-state-isolated.mjs --build-only
node scripts/smoke-builder-conditional-state-isolated.mjs
```

두 명령 모두 exit0이다. 격리된 복사본의 타입 검사·빌드·Builder 전체159/159 및 공개 SDK
CLI validate/test가 통과했다. 저장/권한/경합 검사는 모의 Host state를 사용한 자동 검사다.
실제 source 앱에서는 도구 등록과 사용자 사칭403, DTO 표시, 기존 저장/재시작 흐름을
검사했다. 앱 화면의 초안은 API 응답을 시험용 DTO로 잠시 대체한 **표시 전용 fixture**다.
실제 Lead가 생성하거나 실제 Host에 저장한 초안으로 보고하지 않는다.

| 항목 | 결과 |
| --- | --- |
| `actualSourceHost` | true |
| `mockIdentity` | true |
| `userDraftWriteImpersonationDenied` | true |
| `draftUiPresentationFixture` | true |
| `realHostDraftWritten` | false |
| `liveLeadToolInvoked` / `liveAi` | false / false |
| 설치본·서명·물리 두 PC | 미검증 |

실제 UI에서 초안 표시, 접기/펼치기, Graph revision과 계획 상태, 요구사항 문서, 미응답 질문,
가로 넘침 없음·Graph 편집 금지를 확인했다. 응답 대체를 해제한 뒤 초안이 사라지고 원래
상담 데이터가 변하지 않았음을 확인했다. Main4/4와 출력8개가 정상 종료됐고 소유한
임시 데이터는 정리됐다. 기존 DEV PID48300과 시작 시각은 유지됐다.

## 빌드 식별

- source fingerprint: `c5b98707d57de62bac49db23551e51b00567294783a6f2790359d2bdcc049990`
- manifest SHA-256: `b1ec6cf28f50cb1b04211cde9f93de829927ceeac9cdccf85a3491a657a4733e`
- Worker SHA-256: `0b689d536fd998cf9a3fcab3096d0797dd4e118b335936d6eef3eb638b0e9b21`
- UI build SHA-256: `a8987fa1c22e1d6ab5118c9c8bec0d0597fe163d353b1a591cda59080a3c021a`

실제 앱 모듈 로더가 변환한 UI 해시는 위 build 파일 해시와 다른 대상이다. 원본 로컬
로그 이름은 `sps-builder-design-draft-build-final.log`와
`sps-builder-design-draft-app-release-source.log`다. 원시 로그·계정·사용자 경로를 공개
Builder 레포에 복사하지 않는다. 문서 및 EOF 공백 정리 후에는 source fingerprint를
그 후의 HEAD 전체와 동일하다고 주장하지 않고 위 시험 복사본의 식별자로 유지한다.

처음 검사에서는 병렬 테스트의 임시 폴더가 패키지 검사와 충돌했고, 첫 앱 시험에서는
다른 화면의 새로고침 버튼을 찾는 fixture가 실패했다. 임시 폴더 위치와 시험 탐색을
고친 뒤 최종 전체 명령을 재실행했다. 실패 복사본 두 개도 관련 프로세스가 없고 정확한
소유 Temp 경로임을 확인해 정리했다.

## 다음 단계

실제 Lead의 도구 호출과 Host 저장, 승인 근거·질문 답변·불변 명세/Graph 연결,
Lead 공유 기억과 인계, CTO/Worker/QA 및 실행·검증·납품 흐름이 남는다.
보류한 Marketplace·Preview·자체 LAN을 선행 조건으로 추가하지 않는다. 실제 AI 실행은
기존 허용 범위와 안전 경계를 지키며 별도의 검증 근거를 남겨야 한다.
