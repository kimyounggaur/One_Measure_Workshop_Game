# 수용 계약

기준: 설계서 전체 및 프롬프트팩 M00, S00–S16, 부록 A–H. 아래는 충족해야 할 조건이며 현재 구현 완료표가 아니다.

## 참으로 표시할 조건

| 제품 표시 | 필요한 실제 조건 |
| --- | --- |
| 이 기기에 저장됨 | 검증 snapshot의 원자 IndexedDB transaction 완료 후 readback schema/revision 일치. pending·saving·실패·메모리 초안에는 표시 금지 |
| 오프라인 준비됨 | production manifest의 모든 필수 로컬 자산 fetch와 cache 존재 검증. 일부 실패·최초 미접속은 준비되지 않음 |
| 이론 통과 | schema/범위/겹침/잠금/gap 및 목표 조건을 통과한 해당 revision. 설명 응답/탭 성공과 독립 |
| 청음 완료 | 실제 audio 경로의 학습 수행이 확인된 경우만 사용 가능. visualAlternative 또는 solutionViewed를 독립 청음 평가 성공으로 표시 금지 |
| 정밀도/신뢰도 | 유효 출력 시계·현재 보정 프로필·정상 입력 수집 근거에 따른 표시. fallback/미보정/불안정은 practiceOnly 또는 lowConfidence; 중단·큐 지연 초과는 invalidated; 목표0은 notApplicable |
| 배포 완료 | 승인된 별도 Vercel 프로젝트 deployment READY, 정확한 pushed commit, 운영 URL 실제 접근 확인. 개발 build 성공만으로 대체 금지 |

## 음악과 콘텐츠

- 모든 시간 판정은 안전 정수 tick과 기약분수. PPQ480, 1u240, 4/4=1920. N/R1·2·4·8=240·480·960·1920.
- 향후 일반 계산 3/4와 6/8=1440tick. whole-value R8=1920tick과 혼동 금지. 1/7 whole은 거부, 1/12=160tick은 일반 모델만 가능.
- 이벤트 ID 유일, start>=0/240배수, 최대8이벤트, note pitch60/rest pitch금지, sourceValue 일치, tie 거부. 반개구간의 맞닿음은 합법이다.
- sounding+rest+unknown=1920. 빈칸 자동 rest 변환 금지. 인접 rest만 의미 병합하고 note onset 보존.
- oracle의 전체 정답 집합과 생산 판정 전수 열거가 양방향 일치. 개수 1/1/1/3/2/1, L2 원본 잠금 유지, L6 onset동일 반례 실패.
- diagnostics 순서는 schema→범위→겹침/잠금→gap→팔레트/재고/위치→full semantic→설명. 시스템 contentError는 학습자 오답으로 저장하지 않는다.
- 템포: L1–L5 quarter72/50–120, L6 quarter60/50–100, 자유 quarter80/40–140, 보정 quarter80.

## 편집과 접근성

- 성공 command만 revision 증가·undo 기록. 실패는 문서·revision·history 불변. undo/redo100단계, 새 command 후 redo 비움.
- place/move/resize/delete/replaceKind/split/restMerge/freeFill/clear/undo/redo. move는 원본 임시 제거 후 검사, 덮어쓰기·자동 밀기 없음. 기존 조각 탭은 선택만 한다.
- fillGaps는 자유 모드만, preview 뒤 단일 transaction, 왼쪽부터 최대 8/4/2/1u rest, undo 한번으로 복원. R1+R2 편집 merge 거부, note merge 금지.
- 320/390/768/1280px, 200% 확대, 단일 터치·키보드·목록 경로. 단계형 터치44×44 이상/간격8px, 본문16px/rem·줄1.5, 비색상 구분·focus-visible·polite 단발 안내.
- note/rest SVG8종 정확한 명칭/음가, 온쉼표 아래 매달림과 2분쉼표 위 놓임 구별, 적용 대비 측정, dark/high-contrast/reduced-motion.
- 실제 VoiceOver/TalkBack과 실제 모바일은 별도 증거. 미접근이면 BLOCKED_DEVICE.

## 오디오와 입력

- 사용자 intent에서 단일 AudioContext unlock/resume, running/time 진행 확인. 깊은 불변 snapshot/runId/revision, 4박 count-in, audioStart=currentTime+0.15.
- 음색261.63Hz sine+낮은 2차 배음, attack5ms, release≤15ms 및 duration10% 이하, semantic end gain0. note/metronome/UI bus 분리. rest/unknown note 생성0.
- preview1/2/4회, performance1회, 절대식 loop 예약. stop/hidden/회전/context중단/출력변경은 노드와 세션 정리, 자동 중간 재개 없음.
- targets는 실제 통과 snapshot note onset만. N≤8/M≤64. all-rest notApplicable.
- W=min(160,0.45*minIOI), G=min(55,0.5*W), 경계 포함. DP는 match수 최대→총 abs오차 최소→이른 pair sequence.
- correctedInput=rawInput-offset. COUNT_IN부터 corrected 창[barStart-W,barEnd+W] 수집. raw 창[barStart-W+offset,barEnd+W+offset], close=max(barEnd,barEnd+W+offset).
- outputTimestamp P(a)=p0+1000*(a-c0), 0/0·역행·stale 거부. fallback은 저신뢰도. latency 이중 가감 금지.
- 정상 timestamp 큐151ms 무효,150ms 경계 허용; epoch/미래/비정상은 handler fallback/저신뢰도. pointer 중복 down 및 keyboard repeat/synthetic click 이중 채점 방지.
- 보정4 warmup+12 measurement, ±350ms 후보, 최종≥8표본, 이상치 기준 max(3MAD,60), 최종MAD≤45, offset[-250,+250]포함/범위밖 clamp금지. 12목표 보정은 성과N≤8 경로와 분리.
- raw taps는 메모리만, 결과 닫기 시 폐기. clockMode/sampleRate/출력 변경은 calibration stale. 탭은 이론 진도 변경 불가.

## 데이터·오프라인

- stores=settings/drafts/progress/compositions/metadata. current/previousGood 원자 관리, 정상 이전 current만 승격, 손상본 보존/사용자 복구 선택.
- 300ms debounce/2초 checkpoint/재생·제출·이탈·저장 즉시 요청, revision 직렬화/readback. beforeunload 완료 보장 금지.
- DB transaction 기반 단일 writer lease/owner/단조 fencing. BroadcastChannel은 알림만. 이전 writer와 무권한 recovery 쓰기 거부, 메모리/export 보존.
- exportFormat/schemaVersion/exportedAt/appVersion/documents 및 선택 progress/settings. 파일명 one-measure-backup-YYYY-MM-DD.json, title≤40 plain text.
- import≤1MiB/20작품/8이벤트 및 깊이·문자열 한도, 허용 키만, 위험키 __proto__/constructor/prototype 거부, URL fetch/HTML실행 없음. 미등록 과거/미래schema 거부. 현재schema1에 허구 migration 만들지 않음.
- import preview, 기본 새ID 사본, 명시 교체만 원자적 실행/readback/previous 보존. 정상 L2 잠금ID 권위 재바인딩. 실패 import 전체 DB 불변, 20슬롯 자동삭제 없음.
- production 필수 cache 검증 후 offlineReady, 업데이트 waiting→홈 사용자 적용→저장 검증→오디오 정지→reload. 새 앱 성공 전 호환 cache 보존, cache와 DB 별개.
- 계정/원격분석/광고/외부폰트/마이크/카메라 없음. 앱의 전송 없음과 호스팅 접근 로그 정책은 별개로 안내.

## 완료 증거와 보류 기준

각 단계는 코드 식별값, 변경 파일, 실제 명령/환경/exit code/검사 수/로그, R-ID 상태, 회귀와 미실시 이유를 기록한다. 상태는 PASS/FAIL/NOT_RUN/BLOCKED_DEVICE/BLOCKED_DECISION을 구별한다. 원문 자체의 59/232 문서 검사는 앱 시험 PASS가 아니다.

S15 순서: typecheck→lint→unit→content enumeration→integration→audio→production build→E2E. 성능 예산: core gzip500KB, offline2MiB, cold20회 p75≤3초, pointer p95≤100ms, 화면 p95≤200ms, 저장 p95≤100ms, domain1000회≤5ms,20분 soak.

P0 데이터손실/외부전송/안 멈추는 소리와 P1 음악오판정/핵심접근불가/중복재생은 출시 차단. 기기·교육·보조기술 미검증을 자동 PASS로 덮지 않는다. 승인된 배포를 하더라도 릴리스 후보의 검증 보류 상태를 정확히 남긴다.
