# S15 회귀 행렬

2026-10-19 UTC. 자동 검사는 Windows 10.0.26200 / Chrome 155.0.8059.80에서 실행했다. `npm run verify`는 typecheck → lint → unit → content → integration → audio → build → E2E 순서다. 현재 실행 기록은 `output/qa/verification.log`이며 이 폴더는 Git에서 제외한다. 아래 PASS는 자동 검사에만 적용한다. 수동 검증이 없는 행 전체를 출시 PASS로 해석하지 않는다.

| 회귀군 | R-ID | 자동 근거 | 수동 근거·남은 항목 | 상태 |
| --- | --- | --- | --- | --- |
| 음악 시간 | R01–03,R23 | unit/time, rhythm: 정수·분수·미래 박자·rest/unknown·note onset | 음악 검수자 검토 없음 | AUTO_PASS / EDUCATION_PENDING |
| 퍼즐 | R04–05,R08 | content/enumeration: 독립 oracle와 전체 집합 양방향 일치, 1/1/1/3/2/1, L2 잠금, L6 반례 | 주문·해설 검수 없음 | AUTO_PASS / EDUCATION_PENDING |
| 편집 | R06,R09,R16 | unit/commands, E2E/editor 13: 단일 터치·목록·실제 Tab/Enter·undo·320/390/768/1280 | 물리 작은 화면 없음. 선택 사항인 드래그는 미구현 | AUTO_PASS / DEVICE_PENDING |
| 다중 답 | R07 | unit/learning, content/enumeration, E2E/puzzle-flow: L4 세 답/L5 두 답 및 사용자 snapshot | 설명 이해 인터뷰 없음 | AUTO_PASS / EDUCATION_PENDING |
| 오디오 | R11 | unit/audio-schedule, E2E/audio 10: 실제 OfflineAudioContext 44.1/48kHz 파형·쉼·종료·중단 | 실제 스피커·이어폰 청취 없음 | AUTO_PASS / DEVICE_PENDING |
| 수명주기 | R11,R15 | integration/audio-engine, E2E/audio-lifecycle 5: 단일 context·연타·stop·hidden·회전·정상 완료 | 물리 화면잠금·전화/OS 중단 없음 | AUTO_PASS / DEVICE_PENDING |
| 입력 | R12,R14–15 | unit/tapMatching 및 integration/input-audio: ±W/G/offset·early/late·64입력·400개 독립 DP 대조 | 물리 내장·유선·Bluetooth 없음 | AUTO_PASS / DEVICE_PENDING |
| 보정 | R12–13 | unit/calibration, integration/input-audio: 4+12·MAD·8개·±250·stale | 장치 변경/사용성/물리 지연 없음 | AUTO_PASS / DEVICE_PENDING |
| 신뢰도 | R10,R15 | unit/performance fixtures, integration/input-audio/machine, E2E/performance: fallback·queue·invalidated·all-rest | 안내 해석 인터뷰 없음 | AUTO_PASS / MANUAL_PENDING |
| 학습 | R10,R22 | content/transfer, E2E/puzzle-flow/transfer: 무음·힌트·해답·설명 분리·T1–T8 | 교육 검수/파일럿/학습효과 미실시 | AUTO_PASS / EDUCATION_PENDING |
| 저장 | R17–18 | unit/importExport, integration/storage, E2E/recovery: transaction/readback·fencing·손상·20슬롯·악성 import·roundtrip·두 탭 | 실제 디스크 가득 참/공간 회수 미실시. quota 등은 주입 실패 | AUTO_PASS / DEVICE_PENDING |
| 오프라인 | R19 | unit/update, E2E/offline-update 6: 준비·최초 미준비·부분 캐시·waiting·실패·DB 보존·offline reload | 물리 비행기 모드 없음 | AUTO_PASS / DEVICE_PENDING |
| 접근성 | R09,R21 | E2E/accessibility 13 + editor: 12폭/테마/글자 조합 axe0·overflow0·대비 및 forced-colors/reduced-motion | VoiceOver/TalkBack/OS 200% zoom 미실시 | AUTO_PASS / BLOCKED_DEVICE |
| 성능 | R24 | E2E/metrics: 20 cold·30 pointer·20화면·30저장·1000domain·번들. 별도 실시간20분 soak | 지정 물리 중급/저사양 모바일·망 없음 | AUTO_PASS / DEVICE_PENDING |
| 개인정보 | R20 | E2E/privacy: 외부 요청0·비GET0·capture0·beacon0·쿠키0·DB/백업 raw 입력 키0. unit/importExport 악성 입력 | 호스팅 보존기간/운영 문구 책임자 확인 미실시 | AUTO_PASS / MANUAL_PENDING |
| 출시 문구 | R21,R24 | 앱 도움말의 테스트 버전 표시, 원본 provenance, 의존성 MIT 원문 포함, S16 릴리스 문서 대조 완료 | 책임자·교육·실기기 지원 선언 없음 | DOCUMENTED / MANUAL_PENDING |

최종 변경 후 전체 Chrome 회귀64개를 실행하여 전부 통과했다. S15/S16 보고와 evidence/verification-output.txt에 고정했다. 테스트용 주입, 실제 브라우저 API, 사람 관찰은 서로 다른 증거다.
