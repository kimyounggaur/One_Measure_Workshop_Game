# 결함과 미검증 항목

2026-10-19 UTC. 현재 자동 검사에서 확인된 **미해결 P0/P1은 0**이다. 이는 미검증 물리 기기에 결함이 없다는 선언이 아니다. 수동 출시 게이트는 별도 보류한다. P2 보류 승인을 임의로 생성하지 않았다.

| ID·심각도 | 재현·기대·실제 | 환경/영향/R-ID | 수정과 재검증 |
| --- | --- | --- | --- |
| FIX-01 P1 | 동일 퍼즐을 편집/비교/학습에서 표시하면 sibling key가 겹침. 각 view가 독립이어야 함 | React UI, R07/R09 | view별 key prefix 분리. puzzle-flow/editor 전체 PASS |
| FIX-02 P0 | v2 waiting cache 생성 후 v1 APP_READY가 새 cache를 지울 수 있음. 새 앱 ACK 전 양쪽 보존 필요 | 실제 Chrome worker, R19 | installing/waiting 검사 전후 추가. offline-update5 PASS |
| FIX-03 P0 | 복구/인수 후 홈 전환이 오래된 현재 editor를 새 저장본에 덮을 수 있음 | IndexedDB hydration, R17 | 복구 전용 home 흐름 분리. recovery4 및 storage8 PASS |
| FIX-04 P1 | stop/실패 unlock 뒤 SUBMIT이 막히면 무음 이론 경로 중단 | machine/audio, R10/R11 | INTERRUPTED 제출 및 run identity 보호. machine/audio-lifecycle PASS |
| QA-01 검사 코드 | 대비 parser가 #fff/#000을 해석하지 못해 NaN 실패. UI 대비 자체는 정상 | S13 E2E, R21 | 3자리 hex 해석 수정;12조합+forced colors 13 PASS |
| QA-02 검사 코드 | soak wrapper의 clearTimeout/clearInterval 타입 부적합 | TypeScript, R24 | 원래 함수 타입으로 단언;typecheck PASS, 실제 soak 별도 실행 |
| QA-03 검사 코드 | Edge 다운로드 뒤 browser 자체 edge://downloads-hub 자원을 외부 전송으로 집계 | 실제 Edge, R20 | chrome:/edge: 내부 UI와 네트워크 요청을 분리 집계. HTTP/HTTPS 등 외부 요청은 계속 실패 처리. 재검사 기록 별도 |
| FIX-05 빌드 식별 | Windows 재귀 경로의 역슬래시로 Linux와 buildId가 달라지고 설정 변경이 키에 포함되지 않음 | Windows/Vercel Linux, R19/R24 | 상대 경로를 /로 정규화하고 build 설정·notice 입력도 hash. 최종 로컬/Vercel build-meta 대조로 확인 |

알려진 동작: 새로고침 직후 이전 tab lease가 아직 유효하면 읽기 전용으로 열릴 수 있다. ‘여기서 편집하기’로 명시 인수하거나 lease 만료를 기다린다. 이전 writer는 DB를 덮지 못하고 메모리 초안을 export할 수 있다. 이것은 동시 쓰기 보호 정책이며 자동 인수 성공으로 보고하지 않는다.

미실시: 사람 청취·물리 지연·실제 iOS/Android·VoiceOver/TalkBack·교육 전문가·5명 사용성 파일럿·학습효과·실제 호스팅 로그 보존 정책 확인. device-results와 education/pilot-protocol에 가장 작은 후속 절차가 있다. 승인된 테스트 배포와 정식 학습 서비스 출시 수용을 구분한다.
