# 실제 Lead의 설계 도구 호출 검증

## 기준과 허용 범위

Builder 코드 `12ba623`, Source 시험 연산자 `3c1eb21`, Core `32a3f9f`, 공개 SDK
`316c56f`를 사용했다. 사용자는 현재 기본 Codex CLI 계정으로 격리된 임시 Workspace에서
설계 원문 조회·초안 저장·조회 시험을 허용했다. 실제 프로젝트·설치본·DEV·계정 설정을
바꾸거나 코드·명령 실행·파일 편집·외부 연동을 허용한 것은 아니다.

이 시험은 실제 source Desktop/Owner Host와 실제 Codex CLI 제공자 실행을 사용한다.
Desktop Identity는 mock이며 실제 Google OAuth·설치본·서명·두 PC 검증은 아니다.
기본 검사는 계속 no-AI이고, 아래 실계정 시험은 별도의 명시적 opt-in이다.

```powershell
$env:SPS_BUILDER_LIVE_CODEX = '1'
$env:SPS_BUILDER_LIVE_DESIGN = '1'
node scripts/smoke-builder-conditional-state-isolated.mjs --live-design
```

Source Desktop 폴더, Node24.22.1/PATH24, 별도 Builder 절대 경로의
`SPS_BUILDER_SOURCE_ROOT`가 필요하다. API 키·대체 provider·설치본·취소 시험의 혼입은
시작 전에 거부한다. 이 guard는 Windows 전용 자동 검사1개 안에서10개 거부 사례로
검사했다. 전체 Desktop 회귀를 이번에 다시 수행했다는 의미는 아니다.

## 실제 결과

시험은 exit0이다. 격리 빌드의 타입 검사·Builder 전체160/160·SDK CLI validate/test가
통과했다. 새 Worker JSONL 검사는 fake Host의 엄격한 scope와 CAS 응답으로 설계
읽기→제안→읽기 경로를 확인하며 실제 Host/AI 증거로 혼동하지 않는다.

실제 CLI의 완료 이벤트에서 다음 순서를 확인했다.

1. `list_plugin_tools`
2. `builder.read-design-sources`
3. `builder.read-design-draft`
4. `builder.propose-design` 한 번
5. `builder.read-design-draft`

외부 도구는 `sps-plugin-session`의 두 MCP wrapper뿐이며, 실행 대상은 허용한 Builder
설계 도구뿐이다. 전체 짧은 실행 로그를 읽어 command/file-change/web/subagent 등
다른 완료 항목이 없음을 검사했다. 이 검사는 OS sandbox·임의 네트워크 egress 전체의
인증이 아니다. 임시 작업 폴더는 계속 비어 있었다.

| 검증 | 결과 |
| --- | --- |
| 실제 UI 전송 / 실제 제공자 성공 | true / true |
| 실제 Lead 도구 호출 / 실제 Host 초안 저장 | true / true |
| 실제 상담 source ID 인용 | 일치 |
| 초안 Agent·선택 revision·Workspace·프로젝트 | 일치 |
| 요구사항·Graph specRef·미결정 질문 | 저장 확인 |
| 승인 근거 필드 생성 | 없음 |
| 재시작 후 초안·대화 | 동일 |
| 다른 Workspace 상담·초안 | 변경 없음 |
| 명령·코드 실행 / 설치된 프로필 변경 | false / false |

새 초안은 실제 data API에서 읽어 실제 UI에 표시했다. 앞선 no-AI baseline의 DTO 주입
화면 시험과는 별도다. 마지막 답변이 화면 아래쪽에 남아 자동으로 보이지 않는 UX는
스크린샷 검수에서 확인했으며 아직 수정하지 않았다. 전체 사용자 흐름 완료로 처리하지
않는다. 실제 답변은 API에서 검증했으며 viewport에 보인 것으로 주장하지 않는다.

## 승인 설정과 실패 기록

첫 실계정 시험에서는 제공자는 응답했지만 응답 내용이 도구 취소를 보고했고 성공 문구와
불일치해 검사를 실패 처리했다. 그 시험은 전체 도구 로그 확인보다 답변 검사가 먼저여서
원인을 확정할 근거가 부족했다. 실제 초안 저장 성공으로 보고하지 않았다.

후속 시험에는 시험용 Agent에만 다음을 명시했다.

```toml
mcp_servers.sps-plugin-session.enabled_tools = ["list_plugin_tools", "execute_plugin_tool"]
mcp_servers.sps-plugin-session.tools.execute_plugin_tool.approval_mode = "approve"
```

사용자가 허용한 임시 시험 범위에서만 적용했고 read-only sandbox·명령 도구 비활성화,
Core의 실행 JWT·Workspace·Plugin grant·현재 Lead/세션 검사는 유지했다. 전역 CLI 설정,
기존 Agent 또는 Plugin 권한 정책을 완화하지 않았다. 취소를 제품 설정 문제로 단정하지
않으며, 일반 사용자의 Agent가 이 override 없이 승인/거부 상태를 이해하고 작업을
계속할 수 있는 흐름은 별도 구현·검증이 남는다. 성공한 시험 설정을 제품 기본값으로
무조건 적용하지 않는다.

첫 시험 Main3/3, 최종 시험 Main5/5와 출력10개가 정상 종료됐다. 최종 임시 데이터는
정리됐다. 첫 실패의 바깥 빌드 복사본은 실행 프로세스가 없지만 자동 정리 명령이
거부되어 로컬에 보존했다. 이 복사본은 실제 사용자 데이터가 아니다.
기존 DEV PID48300과 시작 시각은 유지됐으며 의존성을 교체하지 않았다.

## 빌드와 로그 식별

- 시험 source fingerprint: `a3cfc3b3b218f4cfda0fcd946b568b24cc54c9fc13615383244957777f06401b`
- manifest SHA-256: `b1ec6cf28f50cb1b04211cde9f93de829927ceeac9cdccf85a3491a657a4733e`
- Worker SHA-256: `0b689d536fd998cf9a3fcab3096d0797dd4e118b335936d6eef3eb638b0e9b21`
- UI build SHA-256: `a8987fa1c22e1d6ab5118c9c8bec0d0597fe163d353b1a591cda59080a3c021a`
- 실제 초안 SHA-256: `fe2a10f9e0f7cd1cdaf6c0ff907236fcd8119a9851803ac46358bec079fca2a3`

로컬 원본 로그는 `sps-builder-live-design-app.log`(실패)와
`sps-builder-live-design-app-verified.log`(최종 성공)다. 문서 추가 후의 HEAD 전체를 위
시험 복사본 fingerprint와 같다고 주장하지 않는다. 계정·사용자 경로·원시 로그·사설
Core 소스는 공개 Builder에 복사하지 않는다.

## 남은 범위

Lead 세 세션의 구조화 공유 기억, Lead 변경 인계, 질문 답변과 설계 Revision 반영,
승인 명세·계약·기술 결정, CTO/독립 Worker·QA, 지원 provider의 실행 근거·변경 전파와
납품 흐름은 별도 완료가 필요하다. 이 단일 설계 시험으로 전체 v15 AC를 통과 처리하지
않는다. Marketplace·Preview·자체 LAN은 보류이며 기존 Tailscale은 유지한다.

공식 참고: [Codex MCP 설정](https://learn.chatgpt.com/docs/extend/mcp),
[설정 참조](https://learn.chatgpt.com/docs/config-file/config-reference).

## 후속 UI 변경: 대화 스크롤

Builder `dcaecb3`은 최초 대화·아래쪽 독자에게 최근 메시지를 보여주되, 위쪽 기록을 읽는
중에는 자동 이동하지 않도록 했다. 직접 최근 메시지 이동과 명시적 이전 페이지 시작
위치도 분리했다. Node24 격리 타입/빌드·전체163/163·SDK CLI와 no-AI 실제 source 앱
시험이 exit0이다. 앱 시험의 긴 메시지는 표시용 API fixture이며 Host 데이터를 바꾸지
않았다. 처음 끝 위치·위쪽 독자의 위치 보존·최근 메시지 버튼·fixture 제거 후 원본 상태
불변을 확인했다. Main4/4·출력8개 정상 종료와 임시 데이터 정리도 끝났다.

이 후속의 source fingerprint는
`c03d94c622464d3de6956f1514cce1932de62af28a049072bfdc7818a27de18f`, UI build SHA-256은
`4d71d0c5e96708b5ca2f4cc4f33274596c5d9cf169a0754bdc07ccdc84c08320`다. Worker/manifest는
위 실제 설계 시험과 같지만 UI bytes가 달라졌으므로 이전 실계정 시험의 전체 tuple과
같다고 표시하지 않는다. 후속 로그는 `sps-builder-transcript-app.log`다. 캡처에는 갱신 중
loading 표시가 남아 있어 완성된 일반 사용자 흐름의 증거로 쓰지 않는다.
