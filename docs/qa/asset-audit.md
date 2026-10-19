# 에셋·모바일·접근성 검수 준비

검수일: 2026-10-19. 대상: 현재 `game/public/assets` 작업트리와 `docs/ASSET_NOTICES.md`. 검수 시 아직 첫 Git 커밋이 없어 HEAD 식별자는 없음. 원본 백업과 앱 코드는 변경하지 않았다.

이 문서는 **에셋 파일 검사 결과와 S06/S13/S15 실행 계획**이다. 파일 검사 PASS는 실제 UI, 보조기술, 음악교육 검수 또는 출시 준비 PASS를 뜻하지 않는다.

## 읽은 근거

- [프롬프트 원문](../source/one_measure_workshop_vibe_coding_promptpack.md): S06(265행), S13(501행), S15(566행).
- [설계 원문](../source/one_measure_workshop_development_design.md): 11장(349행), 19장(952행), 20장(997행), 22장(1140행), 23장(1239행).
- [출처와 사용 안내](../ASSET_NOTICES.md), `public/assets/asset-map.json`, `design-tokens.json`, `design-tokens.css`, 기호 8개 및 대표 상태 SVG.
- 보존한 런타임 패키지: 작업공간의 `assets-original/runtime/one_measure_workshop/` 아래 README_RUNTIME.md, asset-manifest.json, PROVENANCE_AND_NOTICES.md, contrast-report.json, budget-report.json. `game` 디렉터리 기준으로는 `../assets-original/...`이며 저장소 밖의 보존 원본이다.

## 지금 실행한 파일 검사

PowerShell에서 현재 파일을 읽고 SHA-256, XML, 파일 수, 토큰 대비를 검사했다. 도구 실행은 정상 종료(exit 0). `git rev-parse HEAD`는 초기 커밋 전이므로 해석할 HEAD가 없다는 결과였으며, 이를 커밋 검사 PASS로 기록하지 않는다.

| ID | 검사 | 결과와 한계 |
| --- | --- | --- |
| AS01 | manifest와 배포 이미지 일치 | PASS. 205개 전부 존재하며 SHA-256이 원본 manifest와 일치, 누락/불일치 0. |
| AS02 | 이미지 수와 형식 | PASS. 이미지 205개 = SVG 200 + PNG 3 + WebP 2. JSON 2/CSS 1을 포함한 런타임 파일은 208개. |
| AS03 | SVG 구문/이름 | PASS. SVG 200개 XML 파싱 및 title 존재, 실패 0. 실제 DOM 접근성 이름이나 인라인 ID 충돌은 별도 검증 필요. |
| AS04 | SVG 능동/외부 참조 표지 | PASS(제한적 정적 검색). script, foreignObject, 이벤트 속성, image/use 요소, SVG namespace 외 HTTP URL 검색 결과 0. 일반 보안 감사 전체를 대신하지 않음. |
| AS05 | 고지 보존 | PASS. 원본 PROVENANCE_AND_NOTICES.md와 ASSET_NOTICES.md의 SHA-256 모두 `3a424dd448eb3b6fa7c2d1646dbb4419a671527a2b4eaff8315aefcea26a2e4c`. |
| AS06 | 기호와 음가 메타데이터 | PASS(파일 검사). 8개 이름·분수·tick·박 길이 일치. 아래 표 참조. |
| AS07 | 온쉼표/2분쉼표 방향 | PASS(경로 검사). 온쉼표 기준선 y=28, 몸체 y=28~39로 아래에 매달림. 2분쉼표 기준선 y=36, 몸체 y=25~36으로 위에 놓임. 실제 렌더 및 음악교육 전문가 검수는 NOT_RUN. |
| AS08 | 비색상 상태 | PASS(대표 SVG 구조). 소리는 채움+기호+시작점, 쉼은 빗금+기호, 미정은 점선. 선택 체크·잠금 자물쇠·오류 경고 모양 포함. 실제 축소/흑백/강제색 렌더는 NOT_RUN. |
| AS09 | 정적 토큰 대비 | PASS(18개 불투명 조합). 아래 재계산 표 참조. 전체 앱의 실제 조합, 상태, 투명도, 배경 사진 위 글자는 NOT_RUN. |
| AS10 | 용량 | 측정값만 기록. 이미지 335,806 bytes, JSON/CSS 포함 런타임 359,235 bytes. 전체 앱 전송/캐시 예산이나 성능 PASS가 아님. |

재현 핵심: `Get-FileHash -Algorithm SHA256`으로 manifest의 각 `runtime/...`를 `public/assets/...`에 매핑해 비교했다. SVG는 `[xml]` 파싱하고 `svg.title`을 검사했다. 대비는 현재 `design-tokens.json`의 sRGB를 선형화한 상대 휘도 `(Lmax+0.05)/(Lmin+0.05)`로 새로 계산했다. 제공된 예전 QA JSON만을 근거로 PASS 처리하지 않았다.

| 이미지 군 | 수 | bytes |
| --- | ---: | ---: |
| notation | 8 | 2,927 |
| controls | 34 | 13,020 |
| patterns | 3 | 1,394 |
| tiles | 129 | 148,262 |
| overlays | 7 | 2,321 |
| badges | 18 | 16,824 |
| app | 4 | 20,232 |
| backgrounds | 2 | 130,826 |

## 출처·권리·배포 고지

| 범위 | 버전/작성자/출처 | 수정·고지 근거 | 아직 필요한 작업 |
| --- | --- | --- | --- |
| notation/controls/patterns/tiles/overlays/badges/app | manifest 1.0.0, 2026-10-19. 원본 manifest의 저자: OpenAI assistant for this commissioned project. 이 프로젝트용으로 작성한 벡터라는 출처 기록. | ASSET_NOTICES의 “직접 제작한 벡터”. SVG 및 제작 스크립트 직접 편집·프로젝트 통합·크기/색 변경 설명. 외부 아이콘/음악 글꼴 경로를 복사하지 않았다는 원본 제작 기록. | S13 `docs/assets.md`에 실제 사용 ID와 파일별 manifest 정보를 저장소 내에서 추적 가능하게 남긴다. 현재 원본 manifest는 저장소 밖의 보존 패키지에 있다. |
| 배경 WebP 2개 | OpenAI 내장 imagegen, 2026-10-19. 모델명은 확인되지 않아 임의 명명하지 않음. | ASSET_NOTICES의 생성 배경 항목. 요청자 프로젝트 산출물이며 이용 조건/법률 적용, 독점성 등의 보증이 아님. | 장식 전용, 빈 alt 또는 CSS 배경. 배경이 기보 정확성의 근거가 되면 안 됨. 생성 프롬프트/원본 마스터는 전체 패키지에 있다는 기록이며 현재 런타임 패키지에는 없음. |
| UI 글꼴 | 시스템 한글 글꼴 사용 계획. 런타임 SVG에 글꼴/텍스트 path 필요 없음. | ASSET_NOTICES의 글꼴 항목. Noto Sans CJK는 검수 미리보기 라벨에 사용했다는 기록이며 글꼴 파일은 미배포. | 실제 앱에 외부 글꼴/새 라이브러리를 추가하면 그 버전·라이선스 원문·배포 조건을 별도 기록. 이미지 고지가 npm 의존성 라이선스까지 보증하지 않음. |

앱 help/about/license 화면에서 ASSET_NOTICES의 출처를 읽을 수 있게 연결해야 한다. 앱 자체 저작권 주체·사용 조건을 임의로 확정하지 않는다. 원문은 출처 고지 초안을 선택적 문구로 설명하므로 강제된 제3자 라이선스라고 바꾸지 않는다. 원본에 없는 게임 캐릭터·스크린샷·곡·추출 사운드를 추가하지 않는다.

`sources/build_assets.py`와 `sources/image-generation.json`는 ASSET_NOTICES가 전체 패키지의 제작 근거로 가리키는 파일이다. 현재 확보한 런타임 ZIP에는 포함되지 않는다. 이를 현재 읽거나 검증했다고 주장하지 않는다. 이미 배포된 SVG 자체는 보존되었으며 AS01로 확인했다.

## 음악 기호 매핑

4/4, PPQ=480 기준. N/R 뒤 숫자는 내부 8분 단위이며 사용자 화면의 “몇 분 음표/쉼표” 숫자로 그대로 출력하면 안 된다.

| 내부 도구 | SVG | 사용자 명칭 | sourceValue | tick | 길이 |
| --- | --- | --- | --- | ---: | --- |
| N1 | note-eighth.svg | 8분음표 | 1/8 | 240 | 반 박 |
| N2 | note-quarter.svg | 4분음표 | 1/4 | 480 | 한 박 |
| N4 | note-half.svg | 2분음표 | 1/2 | 960 | 두 박 |
| N8 | note-whole.svg | 온음표 | 1/1 | 1920 | 네 박 |
| R1 | rest-eighth.svg | 8분쉼표 | 1/8 | 240 | 반 박 |
| R2 | rest-quarter.svg | 4분쉼표 | 1/4 | 480 | 한 박 |
| R4 | rest-half.svg | 2분쉼표 | 1/2 | 960 | 두 박 |
| R8 | rest-whole.svg | 온쉼표 | 1/1 | 1920 | 네 박 |

통합 시 기호의 종횡비를 유지하고 시간 막대 너비만 `durationTick/1920`에 비례시킨다. SVG 전체를 가로로 늘려 기호를 찌그러뜨리지 않는다. 외부 img의 내부 title만으로 버튼 이름을 보장하지 말고 DOM에 한국어 이름·길이·위치·상태를 제공한다. 중복 장식은 빈 alt/aria-hidden으로 처리한다. 인라인 복제는 title/pattern ID와 참조에 인스턴스별 접두사를 붙인다. 외부 img는 부모 CSS color가 SVG 내부로 상속된다고 가정하지 않는다. pause/unlock 그림의 존재는 MVP에 일시정지 재개나 L2 잠금 해제를 추가하라는 뜻이 아니다.

## 토큰 대비 재계산

아래는 배경 사진·투명도·실제 DOM 상태가 없는 **토큰 쌍만**의 결과이다. 정적 텍스트 쌍 목표 4.5:1, 의미 경계 쌍 목표 3:1을 적용했다. 실제 선택 테두리 인접색, disabled, placeholder, focus, warning, 링크, 오류, hover 상태는 S13에서 각각 추가 측정한다.

| 테마 | 본문/바탕 | 음표 잉크/음표 | 쉼표 잉크/쉼표 | 선택/바탕 | 오류/바탕 | 미정/바탕 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| light | 13.993 | 6.130 | 5.740 | 5.035 | 6.303 | 4.793 |
| dark | 15.579 | 9.559 | 8.924 | 9.817 | 9.337 | 11.238 |
| high-contrast | 21 | 21 | 21 | 21 | 21 | 21 |

## S06 실행할 모바일·입력 검사

아래 전부 현재 NOT_RUN. 구현된 UI를 대상으로 최신 작업트리에서 실행하고 실제 selector/스크린샷/브라우저 버전/명령/exit code를 기록한다.

| ID / 요구사항 | 조작과 판정 | 증거 |
| --- | --- | --- |
| UI01 / R09 | 320·390·768·1280 CSS px 각각 L3를 단일 탭만으로 완성. 드래그 없이 팔레트 → 박 → 앞/뒤 반 박으로 8개 시작 위치 모두 접근. | viewport별 절차, screenshot, E2E 결과. |
| UI02 / R09 | 단계형 버튼 각각 ≥44×44 CSS px, 간격 ≥8px. 320px에 8×44px 격자를 억지로 배치하지 않음. | DOMRect 측정 JSON. 44px는 이 제품 기준이며 WCAG AA 최소값의 인용으로 쓰지 않음. |
| UI03 / R03·R09 | N4 막대/N2 막대 너비=2, 소리+쉼+미정=4박. 박 1·2·3·4와 반박 1 & 2 & 3 & 4 & 구별. | 같은 fixture 스크린샷, DOMRect, summary 텍스트. |
| UI04 / R06 | 기존 조각 탭은 선택만. 확인 모드 ghost 취소는 events/revision/history 불변. 이동·삭제·길이·나누기·쉼 병합은 command 경로. | 전후 snapshot/revision 및 E2E. |
| UI05 / R05·R06 | L2 잠금 삭제/이동/변경 거부. 겹침/넘침 오류 후 focus 유지, 설명 polite 한 번. | focused element/announcement 기록. |
| UI06 / R09 | L6를 키보드와 목록만으로 완성. 목록에 모든 이벤트/빈 구간의 시작·길이·종류 노출, 배치·이동·삭제 가능. | Tab/방향키/Enter/Delete/Escape/Ctrl 또는 Cmd+Z 절차. 단순 읽기 목록은 불충족. |
| UI07 / R09 | 텍스트 입력 단축키 보호. Space는 탭 패드에서만 연주. 오류 뒤 조작 지점 유지. | 이벤트 횟수 및 focus 검사. |
| UI08 / R09·R21 | 200% 텍스트/브라우저 확대, 세로·가로, safe-area/화면 키보드 조건에서 주문·경고·핵심 버튼 접근. footer 가림 없음. | CSS viewport 변경과 브라우저 확대를 구분한 기록. 브라우저 자동 확대 흉내는 실제 OS 확대 PASS가 아님. |
| UI09 / R06·R09 | 드래그를 제공한다면 handle/8px 임계/ghost 32px/단일 포인터 확인. cancel/lostcapture/회전/숨김/밖 드롭은 commit 0, 원본 복구. | 이벤트별 전후 snapshot. 드래그 미제공이면 선택 기능 제외로 기록하고 단일 탭 완성은 필수. |

## S13 실행할 접근성 검사

| ID / 요구사항 | 검사 | 초기 상태 |
| --- | --- | --- |
| AX01 / R21 | axe 등 자동 검사를 4개 폭, 주요 화면과 modal/오류 상태에서 실행. 정상·다크·고대비·forced-colors·reduced-motion 확인. | NOT_RUN |
| AX02 / R21 | 흑백에서도 소리/쉼/미정 및 선택/잠금/오류 구별. 기본 1rem/line-height 1.5, 주문18~20px, 선택3px, reduced-motion 위치 이동 없음. | NOT_RUN |
| AX03 / R21 | 기호8개를 실제 팔레트·막대·도움말에서 읽고 sourceValue/한국어 명칭과 맞춤. 온/2분쉼표 구분, 기호 잘림·왜곡 없음. | NOT_RUN(파일 검사 AS06/07와 별개) |
| AX04 / R09·R21 | L2 잠금 유지·L6 완성·export/import를 키보드/목록으로 수행. 화면 이동 heading focus, modal focus 복귀, 오류 뒤 focus 유지. | NOT_RUN |
| AX05 / R03·R21 | VoiceOver/Safari, TalkBack/Chrome에서 “앞 음의 지속 구간”을 쉼으로 읽지 않음. 미정은 “아직 정하지 않은 반 박”. 재생 cursor 반복 낭독 없음. | BLOCKED_DEVICE — 승인된 실제 보조기술 기기 접근을 아직 확인하지 못함. |
| AX06 / R10·R21 | 음소거로 모든 이론 완료. 시각 없이 목록/이름/듣기 경로 완성. 시각 대안을 청취 능력 검증으로 표시하지 않음. | NOT_RUN; 시각 없는 실제 AT 경로는 BLOCKED_DEVICE |
| AX07 / R21 | 실제 computed 색/합성/상태별 대비를 측정하고 적용 기준·도구 기록. hover만 가능한 설명 없음. | NOT_RUN; AS09는 정적 토큰만 PASS |
| AX08 / R21 | 실제 사용 에셋 모두 출처/버전/저자/수정 근거/원문/고지 위치에 연결. 도움말·고지 화면 도달 가능. | NOT_RUN; AS05는 문서 보존만 PASS |

## S15 검수 행렬과 증거 수준

S15는 `typecheck → lint → unit → content enumeration → integration → audio → production build → E2E`를 현재 코드에서 실제 실행한다. 정답 수 1/1/1/3/2/1, L4 세 해·L5 두 해, L6 onset 동일/duration 상이 반례, 무음 첫 방문/진도 복원, all-rest, 실패 저장/손상/20슬롯/악성 import/두 탭/오프라인 업데이트 회귀를 포함한다. 이 문서에서는 해당 앱 검사를 실행하지 않았다.

| 환경/경로 | 필요한 증거 | 초기 상태 |
| --- | --- | --- |
| Desktop Windows Chrome/Edge/Firefox | 실제 버전·날짜, 키보드·UI 자동화, fallback과 레이아웃 | NOT_RUN |
| 실제 iPhone Safari 현재·이전 주요 OS | 각각 모델/OS/브라우저, 320px 근접 화면·회전·중단·음성 안내 | BLOCKED_DEVICE |
| 실제 iPad Safari | 터치+키보드, 세로/가로, safe-area | BLOCKED_DEVICE |
| 실제 Android Chrome 중급/저사양 | 각각 기기/OS, 단일 탭·성능·TalkBack | BLOCKED_DEVICE |
| 내장/유선/Bluetooth 실제 출력 | unlock/resume·쉼·중단·출력 변경·보정·재시작의 실제 청취 | BLOCKED_DEVICE — 브라우저 오디오 자동 검사를 실제 청취로 바꾸지 않음. |
| OfflineAudioContext | note bus onset/duration/silence, stop 예약 취소 | NOT_RUN; 물리 출력/청취 증거 아님. |
| Playwright 모바일 viewport/WebKit | UI 에뮬레이션과 엔진 호환 결과 | NOT_RUN; 실제 모바일/VoiceOver 결과 아님. |
| 물리 입력-출력 지연 | 루프백 등 측정 장비·방법·표본 | BLOCKED_DEVICE; 측정 전 지연 수치 주장 금지. |
| 음악교육 전문가/학습효과 | 검수자·문장/기호 확인·사람 대상 평가 | NOT_RUN; 에셋 파일/자동 판정 결과와 별개. |

성능 기록은 전체 핵심 압축500KB, 필수 오프라인2MiB, 20 cold runs p75≤3초, pointer→시각 p95≤100ms, 화면 이동 p95≤200ms, 저장 p95≤100ms, 도메인8이벤트1000회≤5ms, 20분 편집/재생/정지/문제이동의 heap/node/listener/timer와 long task를 대상으로 한다. 기기·브라우저·망·표본·통계식을 남기며 정적 이미지 byte 수로 대체하지 않는다.

P0(데이터손실/외부전송/멈추지 않는 소리), P1(음악 오판정/핵심 접근 불가/중복 재생)은 출시 차단이다. 결함은 최소 재현·기대/실제·환경·영향·R-ID·수정·재검증을 기록한다. 실제 기기/보조기술/교육 검수가 남으면 자동 검사 성공과 별도로 `AUTO_PASS / DEVICE_PENDING` 또는 해당 `BLOCKED_DEVICE`를 유지하고 S16에 출시 보류 조건을 전달한다. 승인된 배포의 기술적 READY와 제품 검수 완료는 분리한다.

## 다음 담당자 인계

1. S06 구현 후 위 UI01–09를 실행하고 실제 screenshot/selector/측정을 연결한다.
2. S13에서 앱 화면별 기호와 고지 위치를 확인하고 `docs/assets.md`, `docs/qa/accessibility.md`를 완성한다. 현재 파일 감사만으로 S13 전체 통과를 선언하지 않는다.
3. S15의 실제 기기 접근이 없으면 정확한 미검증 목록을 유지한다. 실제 청취/AT/기기 검사를 수행한 사람·기기·날짜 없이 PASS로 바꾸지 않는다.
