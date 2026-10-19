# 구현 결정

기준일: 2026-10-19. 기준 설계 1.0과 프롬프트팩 1.0을 실제로 전체 열람한 S00 결정이다. 구현·앱 테스트·실기기 검증 결과가 아니다.

## 환경과 승인 범위

- 작업 폴더: `C:\Users\kimyo\Documents\Codex\2026-10-19\task-3\game`.
- 현재 컴퓨터에서만 진행한다. 오프라인인 DESKTOP-FVHJSEO에는 접근하지 않는다.
- 부모 작업에서 기존 코드·OneDrive·D 드라이브 백업·지정 GitHub를 조사한 뒤, 코드가 없고 지정 원격이 비어 있음을 보고하여 이 별도 폴더를 선택했다. 이 문서는 그 조사를 직접 재실행했다고 주장하지 않는다.
- S00 직접 확인 당시 `game`은 빈 폴더였고 Git 저장소가 아니었다. 기존 package/lockfile/README/앱/테스트가 없었다. 적용 경로 상위의 AGENTS.md도 발견되지 않았다.
- 루트의 `source-design.md`, `source-prompts.md`, `assets-original`은 원본 보관용이다. 수정하지 않고 필요한 자산을 별도 작업 폴더로 복사한다.
- 사용자는 M00 및 S00–S16 순차 구현·검증, `https://github.com/kimyounggaur/One_Measure_Workshop_Game` commit/push, 별도 Vercel 프로젝트 배포를 승인했다. 원문 단계별 중단/별도 배포 승인 문장은 이번 명시적 승인으로 충족되었다. 단계별 자동 게이트와 증거는 유지하며 반복 확인을 요구하지 않는다.
- 기존 원격 이력과 사용자 변경을 보존하고 force push를 하지 않는다. 기존 인증만 사용한다. 신규 자격증명·권한 확대·유료 결제는 범위 밖이다. 사용량 제한은 우회하거나 모델을 바꾸지 않고 보고한다.
- dev 포트 5386, production preview/E2E 포트 4386. 다른 프로젝트와 연계하거나 포트를 공유하지 않는다.
- 새 프로젝트 package manager는 npm. 확인 런타임: Node v24.14.0, npm 11.9.0, Git 2.55.0.windows.3. S01에서 실제 호환 안정 버전을 확인하고 lockfile로 고정한다.

## MVP

한국어, 모바일 우선, 4/4 한 마디, 8분 격자 8칸, 한 성부, MIDI 60 대응 지속음 한 종류. 자유 팔레트는 N1/N2/N4/N8 및 R1/R2/R4/R8이다. 숫자는 내부 8분 길이 u이며 사용자에게 노출하지 않는다. PPQ=480, 1u=240tick, 마디=1920tick. 퍼즐은 정확히 6개이며 의미 정답 수는 1/1/1/3/2/1이다.

필수 흐름은 5단계 튜토리얼, 6개 퍼즐, 3단계 힌트, 설명 확인, 모델/내 조립/A·B 듣기, 자유 조립, undo/redo, 선택적 시작 박자 연습, 입력 맞춤, 로컬 저장·복구·JSON 백업, 준비 후 오프라인, 접근성 대체 조작이다.

탭 선택→박 선택→앞/뒤 반 박 선택과 목록/키보드 편집을 먼저 완성한다. 드래그는 선택이며 필수 경로보다 먼저 만들지 않는다. 320px에서 44px 버튼 8개를 한 줄로 밀어 넣지 않는다.

## 후속 범위

3/4·6/8 제품 UI/콘텐츠/import, 점음표·붙임줄·셋잇단음표·16분음표, 다성부·두 마디, 마이크/MIDI, 실시간 AI 채점, 로그인·클라우드 동기화·원격 분석·광고·결제·공개 공유는 제외한다. 순수 시간 모델에서 3/4와 6/8을 계산·시험할 수 있으나 MVP validator는 거부한다. `tieNextId`도 MVP 입력에서 거부한다.

## 해석을 확정한 계약

1. `sourceValue`는 기약분수. 생성 함수의 정규화와 저장 validator의 canonical 요구를 분리한다.
2. 잠금 권위는 콘텐츠의 `initialEvents`다. import의 `locked` 또는 provenance를 신뢰하지 않는다. L2는 원본 ID·시간·음가·종류를 보존하고 정상 백업은 권위 ID로 재바인딩한다.
3. 팔레트는 새로 생성·변형한 조각에 적용한다. 원본과 동일한 초기 N2는 L2의 N1 팔레트 밖이어도 합법이다. 최종 재고는 N2 3개+N1 2개이다.
4. 해답 수는 `fullSignature` 중복 제거 기준이다. 독립 generator→production grader 결과 집합과 수작업 oracle 집합을 양방향 대조한다. 개수만 일치하면 부족하다.
5. `VALIDATION_DONE`에서 structurePass와 objectivePass 성공을 먼저 저장한다. explanationReviewed, 탭 성과, 보정 유무는 이론 해금과 독립이다.
6. L4/L5는 사용자가 만든 통과 snapshot에서 듣기/탭 목표를 만든다. 고정 모범답으로 대체하지 않는다.
7. L6의 `R1 N1 N2 N2 N2`는 onset이 정답과 같아도 duration/silence가 다르므로 반드시 실패한다.
8. 보정은 `raw=input-expected`, `corrected=raw-offset`이다. positive offset을 더하지 않는다. outputTimestamp 뒤 latency 이중 보정을 하지 않는다.
9. performance의 BAR_COMPLETE는 음원만 정리한다. `max(barEnd, barEnd+W+offset)`까지 listener·runId·snapshot을 유지하고 INPUT_WINDOW_CLOSED에서 결과를 확정한다.
10. 정상 이전 current만 previousGood으로 승격한다. fencing 상실 후 무권한 recovery write도 금지하고 메모리/export로 초안을 보존한다.

## 용어집

| 용어 | 계약 |
| --- | --- |
| onset | 새로운 음의 시작. 지속 중간·rest·표기 fragment는 onset 아님 |
| duration | note/rest 이벤트가 차지하는 음악적 정수 tick 길이 |
| rest | 사용자가 명시한 결정된 침묵 |
| unknown | 미배치 시간. 재생 시 무음이어도 rest로 저장/판정하지 않음 |
| splitAndRearticulate | 음을 나누어 새로운 onset을 하나 추가. 총 길이는 보존 |
| notationFragments | 표시용 분할. sounding event와 onset을 늘리지 않음 |
| whole-value rest | 온음표 비율 1의 쉼. 1920tick |
| 미래 measure rest | 해당 박자 한 마디의 쉼. 미래 3/4·6/8에서는 1440tick이며 whole-value rest와 다름 |
| canonicalization | 복사본을 정렬하고 인접 rest만 합침. note는 병합하지 않고 원본 표시 유지 |
| semantic/inventory | R1 R1과 R2는 침묵 의미가 같아도 조각 재고는 다름 |

## 미정과 검증 경계

연령/학습자 특성, 음악교육 검수자, 실제 지원 기기/OS/출력 목록, 파일럿 참여자와 공개 대상은 TBD이다. 로컬 개발과 승인된 테스트 배포를 계속할 수 있다. 실기기·보조기술·교육 검수·호스팅 로그 정책·실제 배포 검증이 없으면 이를 출시 검증 PASS로 바꾸지 않는다. 별도 승인된 배포와 정식 출시 수용 완료를 구별한다.

자동 필수 게이트 실패 시 의존 구현 전에 해결한다. 기기만 없으면 독립 작업은 계속하고 `AUTO_PASS / DEVICE_PENDING` 또는 `BLOCKED_DEVICE`를 기록한다. 사람의 청취, 보조기술 조작, 물리 지연 측정, 학습효과 관찰은 자동 시험으로 대체하지 않는다.
