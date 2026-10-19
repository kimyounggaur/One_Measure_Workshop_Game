# 릴리스 후보 1.0.0

2026-10-19 UTC. **정식 출시 수용 보류 / 사용자 승인된 테스트 배포 대상**. M00/S00–S16 구현·자동 게이트·후보 문서를 완료했다. 물리기기/청취/AT/교육/운영자 확인은 미실시다. S15/S16 보고와 고정 evidence를 따른다.

| 버전 | 값 | 권위 |
| --- | --- | --- |
| appVersion | 1.0.0 | package.json, persistence/schema.ts |
| document/export schemaVersion | 1 | domain/types, importExport |
| IndexedDB version | 1 | persistence/db.ts |
| contentVersion | 문자열 1 | document, build-meta |
| puzzleVersion | 각 주문 숫자1 | content/puzzles/measure-01–06.json |
| gradingVersion | 문자열 1 | domain/grading.ts |
| buildId | c019fa7c2f6a0c59 | 최종 빌드 입력으로 clean 폴더 재현 |

package-lock SHA256: `769019d808e8559191a73bdfc06f5185f1e220a65b224eb05cde72cd0247a684`. 공개되는 source commit은 최종 Git 기록에 고정한다. 배포 commit, READY, URL, 실제 접근은 배포 후 별도 기록하며 미리 성공으로 표시하지 않는다.

구현 범위: 튜토리얼5단계, 여섯 퍼즐 전체 의미 정답, 단계형 터치/목록/키보드/undo, hint/solution/설명/시각 대안 분리, A/B·자유 조립, 실제 시계 합성음·중단, 선택 탭·보정·신뢰도, transactional 저장·복구·백업·다중 탭 보호, 검증된 cache·사용자 적용 업데이트, 테마/기호/접근성 대체 경로, T1–T8 진단/전이와 사람 검수용 문서다.

현재 자동 환경은 Windows Chrome155.0.8059.80 및 주요 흐름 Edge155.0.4283.62다. 모바일 viewport/CSS 확대는 에뮬레이션이다. 실제 기기 목록은 [device-results](../qa/device-results.md), 수치와 측정 한계는 [performance](../qa/performance.md), 결함은 [issues](../qa/issues.md), 고정 근거는 S15 보고를 따른다. 확인된 미해결 P0/P1은0이며 P2 보류 승인은 만들지 않았다.

아직 실제 iOS/Android·청취·물리 지연·VoiceOver/TalkBack·음악교육 전문가·파일럿·학습효과·운영자 로그 보존/배포 대상 검토가 없다. 자동 통과나 Vercel READY로 이를 대체하지 않는다. 원본 에셋 고지와 배포 의존성의 LICENSE를 보존했으며 앱 자체의 권리자를 임의로 확정하지 않는다.
