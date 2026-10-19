# 한 마디 조립실

소리와 쉼을 조립하며 한 마디를 배우는 한국어 웹 게임입니다. 4/4 한 마디, 8분 격자, 지속되는 한 음색으로 튜토리얼·여섯 주문·자유 조립을 제공합니다. 정답 집합은 **1 / 1 / 1 / 3 / 2 / 1**입니다.

이 버전은 자동 검사를 갖춘 **테스트 후보**입니다. 실제 iOS/Android, 사람 청취, VoiceOver/TalkBack, 음악교육 전문가·사용성·학습효과 검수는 아직 하지 않았습니다. [검증 범위](docs/qa/matrix.md)와 [출시 보류 항목](docs/release/checklist.md)을 확인하세요.

## 실행

검증 환경은 Node **24.14.0**, npm **11.9.0**, Windows입니다. Node24 계열과 npm을 설치한 뒤 저장소 루트에서 실행합니다. 환경 변수나 API 키가 필요하지 않습니다.

```sh
npm ci --no-audit --no-fund
npm run dev
```

개발 주소는 `http://127.0.0.1:5386`입니다. 포트 충돌 시 다른 게임을 종료하지 말고 현재 프로세스를 확인하세요. production 검사는 다음과 같습니다.

```sh
npm run check
npm run build
npm run preview
```

미리보기는 `http://127.0.0.1:4386`입니다. `check`는 typecheck, lint, 단위 검사, content gate를 포함한 build를 수행합니다. 새 폴더 설치에서 위 설치/check/build 경로를 [실제로 재현](docs/qa/build-reproduction.md)했습니다.

## 검사

브라우저 검사는 설치된 Google Chrome을 사용합니다. Chrome이 없는 환경에서는 먼저 운영체제의 Chrome 설치가 필요합니다. 테스트를 실행하려고 새 사용자 자격증명이나 원격 서비스를 만들 필요는 없습니다.

```sh
npm run verify
npm run test:soak
```

`verify`는 typecheck → lint → unit → content → integration → audio → build → E2E 순서로 실행하고 `output/qa/verification.log`에 실제 출력을 기록합니다. `test:soak`는 **실제20분** 동안 편집·재생·정지·문제 이동을 반복합니다. production build 뒤 실행하세요. 두 명령을 동시에 실행하지 마세요. 업데이트 검사는 dist의 worker를 잠시 변경한 뒤 복구합니다.

각 검사 명령은 `test:unit`, `test:content`, `test:integration`, `test:audio`, `test:e2e`입니다. Edge가 설치되어 있으면 `npm run test:e2e -- --config=playwright.edge.config.ts`로 주요 흐름을 검사합니다. 측정값·원시 JSON·스크린샷은 `output/qa`, `output/playwright`에 생깁니다. 이 실행 산출물은 Git에서 제외하며 고정한 근거는 `docs/qa/evidence`에 보관합니다.

## 사용

소리/쉼과 길이를 고른 뒤 박, 앞·뒤 반 박을 선택합니다. 목록·키보드 조작도 가능합니다. 빈칸은 아직 결정하지 않은 시간이며 쉼표와 다릅니다. 긴 음의 중간은 새 음의 시작이 아닙니다. 실수는 되돌리기/다시 하기로 고칩니다.

설명 응답과 선택적인 ‘직접 치기’ 결과는 이론 통과와 별개입니다. ‘내 입력 맞춤’은 준비4회 뒤12회 입력을 사용하며 일정하지 않은 표본은 거부합니다. 출력 장치를 바꾸면 다시 확인하세요. 이 수치는 신체 능력 점수나 기기의 물리 지연 측정이 아닙니다. 소리 없이도 여섯 주문의 이론 학습이 가능합니다.

작품·진도·설정은 이 브라우저의 IndexedDB에 저장합니다. ‘이 기기에 저장됨’은 transaction/readback이 끝난 상태입니다. 보관함에서 작품 사본20개와 JSON 백업을 관리합니다. 가져오기는 미리보기 후 적용하고 기본적으로 새 ID 사본을 만듭니다. 현재1 이외의 파일 schema는 원본을 수정하지 않고 거부합니다.

두 탭은 동시에 쓰지 않습니다. 읽기 전용이면 ‘여기서 편집하기’로 명시적으로 인수하세요. 새로고침 직후에도 이전 lease가 남아 이 절차가 필요할 수 있습니다. 손상된 current와 유효한 이전 저장본이 있으면 원본을 보존한 복구를 선택할 수 있습니다. 저장 실패 시 메모리 초안을 JSON으로 내려받으세요. 브라우저 정리로 저장 데이터가 없어질 수 있으며 기기 간 자동 동기화는 없습니다.

오프라인 기능은 HTTPS 배포 또는 production preview에서 동작합니다. 온라인에서 **‘오프라인 준비 완료’**를 확인한 뒤 사용하세요. 최초 방문부터 오프라인이면 로드할 수 없습니다. 업데이트는 주문 목록의 ‘새 버전 적용’에서 저장 확인·오디오 정지 후 적용합니다. 개발 서버의 동작과 혼동하지 마세요.

## 구조와 출처

`src/domain`은 PPQ480 정수 음악 모델·명령·채점·탭 수학, `content`는 여섯 주문/전이 문항, `audio`는 Web Audio/시계/입력, `persistence`는 로컬 transaction/복구, `offline`은 worker 연결, `ui`는 React 화면입니다. build는 모든 필수 파일의 SHA256 manifest를 생성합니다.

제공된 설계·프롬프트와 runtime 에셋을 별도 폴더에 복사해 개발했습니다. 원본 백업은 수정하지 않았습니다. [탐색 기록](docs/discovery.md), [원문](docs/source/README.md), [에셋 고지](docs/ASSET_NOTICES.md), [의존성 고지](THIRD_PARTY_NOTICES.txt)를 확인하세요. 런타임은 외부 글꼴·광고·분석 SDK·로그인·마이크를 사용하지 않습니다. [개인정보와 호스팅 구분](docs/release/privacy.md)을 함께 읽으세요.

GitHub 대상: [kimyounggaur/One_Measure_Workshop_Game](https://github.com/kimyounggaur/One_Measure_Workshop_Game). 운영 URL과 commit/READY 검증은 최종 배포 기록으로 추가합니다.
