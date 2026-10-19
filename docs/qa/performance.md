# S15 성능과 안정성

2026-10-19 UTC. Windows10.0.26200, Intel Core i9-11980HK(16 logical), 68,448,612,352 bytes RAM, Chrome155.0.8059.80 headless, Node24.14.0. localhost HTTP, 망/CPU throttling 없음, 전원 상태 미기록. 모바일 수치나 지연 보장이 아니다.

`tests/e2e/metrics.spec.ts`가 production build에서 측정한다. percentile은 오름차순 `ceil(n*p)-1` 위치의 값이다. 각 raw sample과 환경은 `output/qa/{cold-start,interaction-performance,bundle-budget}.json`에 저장한다.

| 항목 | 표본/방법 | 측정값 | 초기 예산 | 판단 |
| --- | --- | ---: | ---: | --- |
| 최초 핵심 압축 | HTML+JS+CSS gzip 합계 | 120,798 bytes | 512,000 bytes | PASS |
| 필수 offline | SHA256 manifest 213파일 합 | 759,685 bytes | 2,097,152 bytes | PASS; 라이선스 포함 최종 측정 |
| 첫 조립 가능 | 새 context/cache 20회, 390 CSS px, 홈 자유조립 button enabled 시 performance.now | p75 260.2ms | 3000ms | 이 PC PASS; 지정 모바일/망 미검증 |
| 편집 반응 | 30 pointerdown→aria-pressed mutation→다음 RAF | p95 5.8ms | 100ms | PASS; 물리 화면 센서 측정 아님 |
| 화면 이동 | 20 pointerdown→main mutation→다음 RAF | p95 10.3ms | 200ms | PASS |
| 저장 | 30회 schema검증+5-store transaction+readback | p95 3.0ms | 100ms | PASS; 의도적300ms debounce 제외 |
| domain 최대8이벤트 | 고정fixture1000회 판정 | max1.2ms / p95 0.2ms | 매회5ms | PASS |
| 연속 사용 | 실제 시계20분, 편집/undo/redo/재생/stop/여섯 주문 이동 | 1,200,878ms / 497회 | 회수되지 않는 자원 누적 없음 | PASS |

파형 렌더는 44.1/48kHz 양쪽에서 쉼·semantic end·stop 이후 peak0, 혼합 최대0.242982로 clipping 없음. 이는 OfflineAudioContext 합성 결과이며 실제 speaker/Bluetooth 출력·음향·물리 입력 지연을 증명하지 않는다.

Soak의 `tests/soak/soak.spec.ts`는 AudioContext/oscillator/선택 전역 listener/timer/interval을 계수한다. 매 반복 후 소스0 및 기준 이내를 요구하고, 매60초 강제GC 후 heap을 채취하며 최종 증가16MiB 미만을 예산으로 둔다. long-task observer 값도 원시 결과에 남긴다. 강제GC와 headless instrumentation 자체의 영향이 있으므로 사용자 체감이나 장시간 모든 환경 보장을 주장하지 않는다.

최종 빌드의 별도 재측정은 S16 보고와 최종 JSON이 권위다. 앱 동작 코드가 바뀌지 않은 라이선스 배포 파일 추가는 UI/오디오 성능 개선으로 보고하지 않는다.

최종 soak: AudioContext1, sources0, timers0, intervals1, 선택 전역listeners2. 첫 GC heap4,317,792→최종5,554,108 bytes(증가1,236,316 bytes). 50ms 이상 long task8회, 최대158ms가 관측되었으므로 long task0이라고 주장하지 않는다. 약20분497회에서 매 회 종료 자원 기준을 유지했다. 상세 evidence/soak-result.json 참조. soak build9ba33e66741d23a4 뒤 앱 src는 그대로이며 portable buildId/라이선스 배포 파일만 변경했다. 새 build4a4958f23f4907e4의 전체 Chrome회귀63개도 통과했다.

최종20회 cold 중앙값은 237.4ms다. cold는 각 context의 캐시·저장소를 새로 만든 조건이며 브라우저 프로세스/OS 캐시는 공유될 수 있다. 앞선 측정과의 변동을 최적화 효과로 해석하지 않는다.
