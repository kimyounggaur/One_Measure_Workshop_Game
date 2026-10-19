# 출시 수용 체크리스트

실제 증거가 있는 범위만 표시한다. 자동 검증된 테스트 배포와 정식 학습 서비스 출시 결정은 구분한다.

| 원문23 항목 | 결과 | 근거/남은 일 |
| --- | --- | --- |
| 6문제 정답 집합·반례 | AUTO_PASS | content enumeration, 1/1/1/3/2/1 |
| onset/duration/rest/unknown 일치 | AUTO_PASS / LISTENING_PENDING | domain·UI·OfflineAudioContext; 사람 청취 없음 |
| 음악교육 문장·기호·후속6/8 검수 | NOT_RUN | 교육 review-pack 준비, 실제 검수자 없음 |
| 드래그 없이 터치·키보드 완주 | AUTO_PASS / DEVICE_PENDING | 실제 브라우저 합성 입력, 물리 모바일 없음 |
| 무음 이론 학습 | AUTO_PASS | AudioContext 생성 불가 상태의 튜토리얼/6주문 |
| 실제 모바일 중단·복귀·fallback | BLOCKED_DEVICE | 자동 hidden/orientation과 구분 |
| 탭과 이론 진도 독립 | AUTO_PASS | machine/input/E2E |
| 저장 실패·손상·다중 탭·백업 | AUTO_PASS | 주입 실패+실제 IndexedDB/다운로드/import |
| 사실대로 offline 준비·offline 실행 | AUTO_PASS / DEVICE_PENDING | 실제 worker와 Playwright network offline; 비행기 모드 없음 |
| 에셋/글꼴/의존성 출처 | DOCUMENTED | 사용자 원문/hash 보존, 실제 MIT LICENSE; 별도 법률 판단 아님 |
| 지원환경·개인정보·실제 배포 설정 일치 | PENDING_DEPLOYMENT / MANUAL_PENDING | 배포 후 READY·SHA·URL 및 프로젝트 설정 대조; 운영자 정책 미확정 |
| 이전 배포 rollback 문서 손상 없음 | PARTIAL_AUTO / NOT_RUN_REMOTE | schema1/cache 실패 보존 자동 검사; 원격 rollback 실행 안 함 |
| 최종 전체 회귀·성능·20분 | AUTO_PASS | Chrome64·20분497회·최종 성능, S15 보고 |
| fresh install/build/check | AUTO_PASS | 별도 clean 폴더 npm ci/check, build-reproduction |
| 교육효과 검증 | NOT_RUN | 효과 보장/능력 점수/마케팅 수치 없음 |

출시 보류를 해제할 최소 후속 작업: 지원할 물리 iPhone/iPad/Android와 출력 경로를 정해 device-results 절차를 수행하고, VoiceOver/TalkBack 및 음악교육 전문가가 review-pack을 검토한다. 파일럿은 별도 참여·동의 범위를 정한 뒤 문제 탐지 목적으로 실시한다. 운영 책임자가 대상·안내·호스팅 정책을 확인한다. 이 문서는 그러한 승인이나 검수를 대신하지 않는다.
