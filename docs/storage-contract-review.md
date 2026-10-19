# S11 저장 계약 및 API 계획

상태: **DESIGN_ONLY / 구현 시작 전**. 2026-10-19. S10 자동 게이트 이후 부모의 구현 요청을 받아 S11을 시작한다. 현재 저장 코드를 작성하거나 DB를 열거나 사용자 데이터를 바꾸지 않았다.

검토 근거: 원문 설계17–18장, 프롬프트 S11 및 부록G 전체, M00/R05/R10/R17–R20. 현재 `src/domain/types.ts`의 실제 RhythmDocument/Puzzle 타입과 package.json을 읽었다. `fake-indexeddb`가 이미 의존성에 있으므로 단위/통합 실패주입 시험에 재사용할 수 있다. 기존의 순수 Domain validator/grader/commands를 호출하고 저장 계층에 음악 판정을 중복 구현하지 않는다.

## 1. UI에 제공할 상태

아래 타입 이름은 API 계획이며 아직 존재하는 구현으로 취급하지 않는다. S10까지 생긴 실제 progress/settings/calibration 타입을 먼저 재사용한다.

```ts
type DraftKey = 'free' | PuzzleId; // 고정된 6개 puzzleId만 허용
type AppData = {
  drafts: Partial<Record<DraftKey, RhythmDocument>>;
  progress: Partial<Record<PuzzleId, PuzzleProgress>>;
  compositions: RhythmDocument[]; // 최대 20, id 유일, 최근 수정순 selector
  settings: AppSettings;
};

type SaveState =
  | { status: 'clean'; savedAppRevision: number }
  | { status: 'pending'; requestedAppRevision: number }
  | { status: 'saving'; requestedAppRevision: number }
  | { status: 'failed'; reason: StorageFailure; dirtyDataAvailable: true };

type WriterState =
  | { mode: 'writer'; ownerId: string; fencingToken: number }
  | { mode: 'readonly'; takeoverAvailable: true }
  | { mode: 'session'; reason: 'unsupported' | 'blocked' | 'unavailable' };

type LoadedData = {
  data: AppData;
  savedAppRevision: number;
  writer: WriterState;
  recovery?: RecoveryOffer;
};
```

`Partial<Record>`는 방문하지 않은 퍼즐 초안을 억지로 생성하지 않기 위한 것이다. UI는 없는 키를 콘텐츠의 권위 있는 initialEvents로 초기화한다. root가 모든 7개 키를 미리 만드는 구조를 선택해도 저장 검증 범위는 같다. drafts의 키 자체가 puzzle 문맥의 권위이며 RhythmDocument에 사용자 임의 `puzzleId`를 추가해 추정하지 않는다.

PuzzleProgress는 원문의 puzzleId/puzzleVersion/objectivePass/explanationReviewed/completedBy/mode/attempts/bestTheorySnapshot/discoveredSignatures이다. objectivePass를 탭 결과나 explanationReviewed에 종속시키지 않는다. 저장은 이미 판정된 snapshot을 보존하고 진도를 새로 채점하는 역할을 갖지 않는다. 다만 import된 progress가 주장하는 통과는 권위 puzzle/version과 bestTheorySnapshot의 validator/grader로 확인할 수 있어야 한다.

AppSettings에는 실제 구현된 음량·메트로놈·배치확인·접근성·선택 보정 프로필만 둔다. raw taps, pointerId, AudioContext, runId의 활성 세션, DOM 객체, device ID/fingerprint는 영속 데이터가 아니다. calibration에는 id/version/offset/clockMode/sampleRate/시각/사용자 선택 출력 라벨만 허용하며 stale 상태를 유지한다.

## 2. 제안 공개 API

```ts
interface StorageController {
  load(): Promise<LoadedData>;
  subscribe(listener: (state: { save: SaveState; writer: WriterState }) => void): () => void;
  requestSave(data: AppData, reason: 'edit' | 'progress' | 'settings'): void;
  flush(data?: AppData): Promise<SaveReceipt>;
  takeOver(): Promise<TakeoverResult>;
  restorePreviousGood(recoveryId: string): Promise<SaveReceipt>;
  prepareImport(file: Blob): Promise<ImportPreview>;
  commitImport(planId: string, selection: ImportSelection): Promise<SaveReceipt>;
  exportBackup(selection?: ExportSelection): ExportFile;
  deleteData(selection: ExplicitDeleteSelection): Promise<SaveReceipt>;
  close(): Promise<void>;
}
```

함수 수는 구현 시 불필요한 래퍼 없이 줄일 수 있지만 아래 의미를 유지한다.

- `load()`는 지원 검사→DB open→current/previousGood 각각 검증→writer lease 획득 시도→검증된 데이터 또는 복구 제안을 반환한다. 손상 current를 load 과정에서 덮지 않는다.
- `requestSave()`는 깊은 복사·런타임 검증 후 dirty revision을 생성한다. edit는300ms debounce, 연속입력은 최초 dirty 이후2초 checkpoint. progress/settings도 유실하지 않으며 이론 목표 통과는 `flush`로 즉시 저장 가능하다.
- `flush(data?)`는 재생·제출·이탈·명시 저장·업데이트 적용 앞에서 호출한다. 최신 pending snapshot을 직렬 queue에 넣고 transaction/readback 완료 receipt를 반환한다. receipt가 최신 requested revision과 일치할 때만 UI가 clean을 표시한다.
- `takeOver()`는 사용자의 “여기서 편집하기” 동작에서만 호출한다. DB transaction에서 fencingToken을 증가시키고 새 owner를 설정한다. 기존 dirty 메모리는 자동 버리지 않는다.
- `restorePreviousGood()`는 UI가 복구 대상을 보여준 후 사용자 선택으로만 호출한다. 손상 raw current 보존이 성공하는 동일 transaction에서 검증된 previousGood을 current로 복원한다. 실패하면 current/previousGood 불변이다.
- `prepareImport()`는 파일 크기·JSON/schema/버전·음악/잠금/슬롯 검증만 하는 순수 사전 작업이다. DB를 쓰지 않는다. 결과에 추가/교체/충돌/정규화 내용을 표시한다.
- `commitImport()`는 preview 이후 사용자가 선택한 추가/교체만 수행한다. plan은 현재 DB revision에 묶고 변경된 DB면 다시 preview를 요청한다. commit 직전 lease·revision·슬롯·schema를 다시 확인한다.
- `exportBackup()`는 clean snapshot만이 아니라 실패/lease상실 중 현재 메모리 초안도 선택하여 내보낼 수 있다. DB 쓰기 권한과 무관하다. 오류 raw 복구 데이터 export는 정상 backup과 구분된 진단 파일로만 명시적 제공한다.
- `deleteData()`는 확인된 구체 범위만 받고 default 전체삭제를 두지 않는다. 현재 조립 clear는 도메인 undo command이며 이 API를 사용하지 않는다.
- `close()`는 debounce/checkpoint/lease heartbeat/channel/listener를 정리한다. 가능한 정상 종료에서는 flush를 먼저 시도하지만 beforeunload의 비동기 완료를 보장하지 않는다.

SaveReceipt는 `appRevision`, 저장 document revision 매핑, readback검증 여부와 결과를 담는다. StorageFailure는 quota/abort/unavailable/invalidData/readbackMismatch/leaseLost/revisionConflict/importInvalid/unsupportedVersion/slotFull를 구별한다. 예상 오류는 typed Result로 UI가 처리하고 성공인 척 Promise를 resolve하지 않는다.

## 3. 저장 schema와 원자성

DB 이름은 이 게임 전용 상수로 정의한다. 처음 schemaVersion1/databaseVersion1이며 존재하지 않는 이전 version migration을 만들지 않는다. source schema와 DB 버전, appVersion, contentVersion, puzzleVersion, gradingVersion은 별개다.

필수 object stores는 `settings`, `drafts`, `progress`, `compositions`, `metadata`다. 단순하고 검증 가능한 첫 구현은 각 컬렉션 store에서 `current`와 `previousGood` 두 slot을 관리하고, metadata에 같은 두 slot의 envelope를 둔다.

```ts
type SnapshotEnvelope = {
  schemaVersion: 1;
  appRevision: number; // settings/progress/작품을 포함한 저장 전체 revision
  appVersion: string;
  contentVersion: string;
  committedAt: string;
};
type Lease = { ownerId: string; fencingToken: number; expiresAtMs: number };
```

RhythmDocument.revision은 해당 악보 semantic command revision이다. settings 변경 등은 document revision을 바꾸지 않고 appRevision만 증가시킨다. 서로 다른 문서의 revision 숫자를 비교하여 전체 최신 순서를 결정하면 안 된다.

하나의 readwrite transaction은 5 stores를 함께 연다. 순서는 다음과 같다.

1. 같은 transaction에서 lease의 owner/token/미만료, current appRevision과 요청의 expectedBaseRevision을 읽어 확인한다.
2. 현재 snapshot을 완전 검증한다. 정상 current만 previousGood으로 승격한다. invalid current가 기존 정상 previousGood을 덮지 못한다.
3. 검증된 새 컬렉션4개와 metadata envelope를 모두 current에 쓰고, 필요한 previousGood 갱신도 같은 transaction에서 처리한다.
4. `transaction.oncomplete` 뒤 별도 readonly transaction에서 모든 current 컬렉션과 envelope를 읽고 schema/appRevision/document revisions/의미를 재검증한다.
5. 일치해야 SaveReceipt 성공. mismatch면 failed이며 dirty 메모리를 보존하고 저장됨 표시를 하지 않는다.

readback 시 더 새로운 revision이 보이는 경우를 조심한다. 같은 writer 직렬 queue에서는 후속 write가 readback 전 실행되지 않게 한다. 다른 writer가 takeover한 경우 lease 상실을 감지하여 이전 요청이 clean UI를 덮지 못하게 한다.

복구는 metadata의 별도 `recovery:<id>` 레코드 등에 원본5개 raw slot과 출처 revision/이유를 보관할 수 있다. 복구 슬롯은 일반20작품 슬롯과 별개이며 자동삭제하지 않는다. 보존 transaction이 quota로 실패하면 손상원본을 덮지 않고 메모리/export 대안을 제공한다. current가 손상된 상태의 일반 save는 자동 복구로 취급하지 않으며 명시적 복구 또는 원본 보존을 포함한 안전한 경로가 필요하다.

IndexedDB transaction 활성 기간 안에서 network/불필요한 Promise 대기/crypto를 수행하지 않는다. 순수 검증·사전 복사는 transaction 전에 준비하되 잠금·기준 revision·current 검증은 transaction 내 실제 읽은 값으로 확인한다. 성능 최적화를 위해 snapshot 내용을 믿고 fencing 검사를 생략하지 않는다.

## 4. revision queue와 UI 저장 상태

- controller가 모든 AppData mutation 요청에 단조 요청 번호를 부여한다. 메모리의 requested revision과 persisted appRevision을 별도로 유지한다.
- snapshot은 request 시점 복사본이다. queued snapshot을 React의 가변 참조로 보관하지 않는다.
- write는 한 개만 실행하고 commit+readback까지 직렬화한다. debounce 중 아직 시작 안 한 중간 요청은 최신 것으로 coalesce할 수 있다.
- 이미 시작한 revision9 뒤10이 요청되면9가 먼저 완료되어도 clean으로 표시하지 않는다.10의 readback 성공 후 clean이다. 어떠한 늦은9콜백도10을 덮거나 clean 상태를 역행시키지 못한다.
- 실패는 메모리 문서와 dirty 상태 유지, export가능, 재생 상태 unchanged. 저장 오류가 `PERFORMING`을 `EDITING`으로 바꾸는 reducer 동작은 금지한다.
- 앱 screen 이동은 flush 결과를 확인한다. 실패 시 메모리 초안을 유지하고 안내/export 경로를 남기며 임의 초기화하지 않는다.
- `beforeunload` 전부 저장을 약속하지 않는다. G01은 마지막 완료 저장까지만 복원하는 기대값이다.

## 5. 한 origin 한 writer

초기 제품 상수 제안: `LEASE_DURATION_MS=15000`, `LEASE_RENEWAL_MS=5000`. 이는 브라우저 보장이나 물리 기기 측정값이 아니며 fake clock 시험으로 명시한다. background timer throttling 때문에 lease가 만료될 수 있음을 안전하게 처리하는 것이 목적이다.

- ownerId는 세션 임시 난수이고 device ID가 아니다. lease는 metadata에 저장한다.
- lease획득/renew/takeover는 metadata readwrite transaction에서 실행한다. 동시 획득 둘 중 하나만 writer다.
- fencingToken은 안전정수 단조 증가이며 owner가 바뀔 때 증가한다. 만료된 writer가 같은 token으로 돌아오면 거부한다.
- 모든 write는5storetransaction안에서 owner/token/expiry를 확인한다. recovery/import/delete도 예외가 아니다.
- BroadcastChannel 지원 여부는 정확성에 영향을 주지 않는다. 미지원이면 알림만 늦어지고 실제DBfencing은 그대로다.
- takeover 후 이전 탭은 readonly/leaseLost로 전환하고 dirtyAppData를 메모리에서 유지한다. 자기 recovery슬롯에 우회write하지 않는다. export하거나 새writer와 조정하거나 명시적으로 권한을 다시 획득해야만 recovery저장할 수 있다.
- 명시 takeover 시 저장된 cleanAppData와 기존 메모리 dirtyAppData가 다르면 자동 last-write-wins를 하지 않는다. 사용자가 보존/사본가져오기/내보내기를 선택하도록 실제 충돌을 표시한다.
- lease 반환/close는 자신이 여전히 같은 owner/token일 때만 적용한다. 이전 탭의 늦은 close가 새writer lease를 지우면 안 된다.
- wall clock 변화는 자동 권한 확대로 해석하지 않는다. backward/forward change 후 renew/read에서 안전하게 lease 상실을 다루고 초안은 보존한다.

## 6. 백업·import와 L2 잠금

필수 envelope는 `exportFormat`, `schemaVersion`, `exportedAt`, `appVersion`, `documents`, 선택 `progress/settings`다. `documents`는 일반 작품 최대20개다. 전체기록 백업에 작업중인7개 초안까지 포함해야 하므로 구현에서는 **선택 `drafts` 필드(키는 free+6개puzzle,각8이벤트 이하)** 를 schema1 허용키로 명시하는 방안을 사용한다. 이 필드는 임의 extra key 허용이 아니라 버전 있는 AppData 계약이다. 작품20슬롯과 복구/작업중초안의 한도는 혼동하지 않는다. 원문에서 export의 drafts 키를 직접 제시하지 않았다는 점을 여기 기록하며, 실제 UI 통합 시 부모와 이 계약을 맞춘다.

파일명은 `one-measure-backup-YYYY-MM-DD.json`. 제목 최대40문자 plain text. 앱버전과 ISO시각은 검증하되 export 시간만으로 데이터를 신뢰하지 않는다. 문서의 외부 URL 또는 unknown fields를 실행/fetch하지 않는다.

검증 순서:

1. Blob.size≤1,048,576bytes 확인 후 제한된 text읽기/JSON.parse. MIME·확장자는 힌트만.
2. 전체객체 순회에서 `__proto__`, `constructor`, `prototype` 거부. null·배열·객체 타입과 깊이·문자열·컬렉션 한도를 확인한다. UI에 object를 직접 HTML로 넣지 않는다.
3. envelope의 허용키/현재schema1/exportFormat 검증. 미등록 과거/미래schema는 거부하고 원본파일 유지. 등록된 미래 migration 구조의 순수성만 테스트용 fixture로 검증한다.
4. 모든 RhythmDocument를 domain validator에 넣는다. supported 4/4/PPQ480/sourceValue/정수/8event/ID/title/범위/겹침 검증. 미완성draft gap은허용한다.
5. `drafts[puzzleId]`와 `progress[puzzleId].bestTheorySnapshot`은 권위 있는 puzzleId/version에 바인딩하여 initialEvents와 잠금 의미를 확인한다. imported locked/provenance는 신뢰하지 않는다.
6. L2 lock은 원본이 있어야 하는 세 위치0/960/1440tick에서 종류/길이/pitch/sourceValue와 원본semantic 일치를 확인한 뒤 권위 initialEvents의 ID로 재바인딩한다. 새ID발급 때문에 정상백업을 거부하지 않으며, 잠긴영역이 변조되었으면 재바인딩으로 오류를 숨기지 않는다. 나머지 이벤트ID와 documentID는 collision없이 새로 만든다.
7. 일반 compositions는 자유 작품 사본이다. puzzle진도 복원과 구별하고 free문맥의 불필요 locked flag는 정규화할 수 있다. semantic 결과는 유지한다.
8. 새documentID사본을 기본으로preview한다. progress/settings/drafts 복원은 선택 대상을 따로 보여준다. 기존draft를 암묵적으로 덮지 않는다. 명시교체시 이전snapshot 보존이필수다.
9. 20슬롯에추가불가/충돌은미리표시한다. 마지막document오류라도전체import거부.확정transaction에서선택·lease·appRevision·slot을재검증하고한번에적용한다.
10. readback성공까지import완료표시금지. export→import가음악signature/도움유형/visualAlternative/보정stale의미를보존하는지회귀한다.

깊이·문자열 한도는 상수로 명시한다. 제안: MAX_JSON_DEPTH=16, MAX_RAW_STRING_CHARS=4096, MAX_ID_CHARS=128, title40. 원문이 명시한 이름/필드 한도에 더 느슨하게 적용하지 않으며 정상 콘텐츠에 필요한 최대길이를 확인하고 상수를 확정한다. 순수 validator 결과를 AppData로 casting하여 unknown을 우회하지 않는다.

## 7. G01–G18 수용 시험 연결

| ID | 시험 수단/재현 | 필요한 결과 |
| --- | --- | --- |
| G01 | fake clock debounce직전종료/reload | 마지막완료revision만복원,미완료보장문구없음 |
| G02 | 요청9write지연→10요청/commit,oldcompletion | 저장10/최신UI유지;늦은9clean불가 |
| G03 | quota/AbortError/readbackMismatch 주입 | failed+메모리/export,거짓저장됨0,재생상태불변 |
| G04 | 테스트DBcurrent손상/previousGood정상 | 복구제안/손상원본보존/정상백업미덮기/명시복구 |
| G05 | 동시controller/2page lease획득 | transaction writer1,BC없어도동일 |
| G06 | A token7만료→B token8→Awrite | A거부,dirty메모리/export보존 |
| G07 | fence잃은Arecoverywrite | 거부;권한재획득/조정전DB무변경 |
| G08 | 정상L2전체백업/newIDs 및 변조 | 정상권위ID복원/정답유지,변조거부 |
| G09 | 1,048,577/2MiB Blob | parse전크기거부,DB무변경 |
| G10 | 21작품/9이벤트/title41/deep | 각각이유포함거부,원자불변 |
| G11 | future/unknownpast schema | migration추정없음,원본보존 |
| G12 | 위험키3종객체 | 거부,prototype변경없음 |
| G13 | title HTML/script와외부URL | plain text/스키마정책,실행0/외부요청0 |
| G14 | 마지막문서만invalid | 모든storetransaction무변경 |
| G15 |20slot사본추가 | 자동삭제0,내보내기/명시교체안내 |
| G16 |한작품명시교체 | 대상만교체,previous보존/readback |
| G17 |cache삭제/update/rollback | DB문서수/signature불변,미래schema파괴금지;S12와통합 |
| G18 |전체삭제취소 |모든store/snapshot불변 |

추가 시험: store별write가중간abort되어도전체불변,invalidcurrent가previousGood승격되지않음,oldownerclose가newlease유지,import preview뒤revision변경재검증,settings저장에서도fencing적용,unsupportedIndexedDB세션모드,rawtap제거,두초checkpoint,deletion대상제한.

Unit/integration은 fake-indexeddb+fakeclock/failureadapter로 재현하고, 실제browserE2E는 productionpreview4386에서 reload·2탭takeover·export/import·L3전체흐름을 검증한다. 테스트용 browser context/DB만 손상시킨다. 현재 사용자의 실제 DB를 지우거나 손상시키지 않는다.

## 8. 구현 착수 전 연결 확인

S10 완료 후 실제 AppData/progress/settings 및 validator/grader의 함수명을 읽어 타입 중복을 없앤다. UI는 storage.subscribe의 상태만 저장표시로 사용하고 localStorage에별도authoritative copy를 만들지 않는다. 기존 UI callback을 requestSave/flush와 연결할 정확한 위치, drafts선택export field 계약, appVersion/contentVersion 소유 모듈을 부모와 맞춘 후 구현한다.

현 단계 차단은 없다. 저장 구현은 요청된 순서에 따라 **S10 자동 게이트 후 시작 대기**다. 이 파일 작성 자체는 S11 PASS가 아니다.
