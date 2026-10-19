# 구현·검증 인계

2026-10-19 UTC. 현재 PC의 기존 코드/OneDrive/D 백업/GitHub를 조사해 원본 설계와 runtime 에셋으로 별도 game 폴더에 구현했다. 원본 백업과 오프라인 DESKTOP-FVHJSEO는 변경·접속하지 않았다. M00와 S00–S16을 순서대로 수행했다.

구현: 튜토리얼5단계,6주문 전체 정답1/1/1/3/2/1,자유 조립,터치/목록/키보드/undo,힌트/해답/설명/시각대안 분리,A/B,Web Audio·clock·선택 입력/보정,로컬 transaction·복구·백업·writer fencing,오프라인·안전 업데이트,테마/기호/접근성 대안,T1–T8과 교육 review-pack.

최종 자동 검증: type/lint/build exit0,unit140/content21/integration56,Chrome63 E2E(audio15 포함),Edge주요25(24+수정후 privacy1),실제20분497회 soak. buildId4a4958f23f4907e4;core gzip120798bytes;offline213파일759685bytes. 별도 verification-clean에서 npm ci/check를 재현했다. qa/evidence의 실제 출력과 JSON, reports/S15/S16이 권위다.

정식 출시 수용은 보류한다. 물리 iOS/Android·사람 청취·VoiceOver/TalkBack·물리 지연·음악교육 전문가·파일럿·학습효과·운영자 로그 정책 확인은 미실시다. 자동 테스트/viewport 에뮬레이션으로 대체하지 않았다. 후속 절차는 qa/device-results.md,education/review-pack.md,release/checklist.md에 있다. 확인된 미해결 P0/P1은0이며 알려진 경계는 release/known-limitations.md에 기록했다.

실행: Node24/npm, npm ci --no-audit --no-fund; npm run dev(5386); npm run build/preview(4386); npm run verify; npm run test:soak(실제20분). 오프라인은 production/HTTPS에서 준비 완료를 확인한 뒤 사용한다. 사용자가 export한 JSON만 직접 다른 기기로 옮길 수 있다.

GitHub 대상 kimyounggaur/One_Measure_Workshop_Game, 새 Vercel 프로젝트 one-measure-workshop-game. 사용자 승인에 따라 정상 commit/push와 READY·commit·실제운영URL 검증을 이어서 진행한다. 완료 후 release/deployment.json에 결과를 고정한다. force push·새 인증·권한 확대·유료 기능 활성화는 하지 않는다.
