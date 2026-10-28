# 연결 전환 중 수신한 미실행 작업 반환

기존 Desktop의 Agent 명령·Plugin run 공통 poll 경로를 보완했다. Runner는 실제
실행 컴퓨터이며 Agent/Target과 다르다. Native 추가 개발이나 wire 변경은 아니다.

기존 claim helper는 원격 응답 직후 원래 연결이 현재인지 검사한다. 계정·Node·
session이 바뀌면 실행을 막지만 이미 서버에 배정된 작업 정보도 버려, 이 poll이
실행하지 않은 작업이 Core의 claimed 상태로 남을 수 있었다.

Main은 각 claim callback에서 응답의 정확한 ID와 원래 hub·Node·identity·access를
잠시 캡처한다. executor 진입 직전에 executionAttempted를 설정한다. 진입 전 연결
변경으로 거절된, 실제 응답을 받은 작업에만 기존 완료 API로 고정된 ‘시작하지 못함’
실패를 보고한다. Agent와 Plugin의 완료 endpoint를 구분하고 새 연결의 자격이나
화면 상태를 사용하지 않는다. 명령 원문·stdin·출력은 이 보완 기록에 저장하지 않는다.

executor에 들어간 뒤 오류가 나면 실행 여부를 추정하지 않는다. 실행기의 기존
정확한 종료 확인과 결과 처리가 책임진다. 빈 claim·응답 유실·알 수 없는 ID에는
가짜 완료를 만들지 않는다. 기존 Core의 현재 인증·서명·nonce·권한·epoch 검증은
그대로 적용되며, 취소 상태의 처리도 서버 계약을 따른다.

최종 Main VM·poll gate·Node 연결 검사 3개 파일 **26개 통과**, Main 입력 hash 동일,
구문·diff 검사 통과. Main의 실제 함수를 VM에서 실행해 늦은 A 응답의 lane별 반환,
정상 단일 실행, executor 진입 뒤 무추정, 완료 보고 실패 뒤 B 상태 보존과 빈 claim을
검사한다. 실제 원격 Host·Electron·물리 Runner 통합 검증은 아니다.

보고 요청도 실패하면 Core에는 pending이 남을 수 있다. 영속 completion receipt,
claim 세대 복구, 응답 자체를 잃은 배정과 앱 강제 종료 복구는 여전히 미완료다.
재배정·작업 재실행·timeout만으로 terminal 전환을 추가하지 않는다.
