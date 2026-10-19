# S09 tap mathematics contract review

Status: **PLAN ONLY — no S09/S10 code or tests implemented by this review.** Implementation awaits the parent's S08 gate. Read the actual prompt S09/S10, appendix E, design 14.5–14.8/15/17.3/22.2, and the existing `audio-contract-review.md`. The contracts below extend the current `RhythmDocument`, `Tempo`, `onsetSignature`, and exact tick engine; they do not add competing rhythm types.

## Stage and ownership boundary

S09 owns pure input-window arithmetic, deterministic matching, snapshot-derived targets, aggregate result construction, and their independent fixtures/oracles. It imports no DOM, React, AudioContext, storage, or progress reducer. S10 owns actual output-clock sampling, pointer/keyboard collection, lifecycle events, calibration scheduling/profile persistence, and precision wording. Calibration's pure math can share a private sequence-matching kernel, but it must have a separate public cardinality guard from one-bar performance.

No automatic result from this work can establish physical latency, iOS/Android behavior, Bluetooth timing, actual listening, or educational effectiveness. These stay DEVICE_PENDING/NOT_RUN until corresponding physical evidence exists.

## One time coordinate per operation

Use unit-bearing names throughout. Semantic source positions remain exact `startTick` values. `ticksToSeconds` transforms a frozen accepted snapshot into audio seconds; S10 maps the scheduled audio targets into absolute expected-output performance milliseconds. S09 compares only values in that latter coordinate system.

```ts
type OutputAnchor = {
  contextTimeSec: number;
  performanceTimeMs: number;
};
// Pure formula, wrapped by S10's sample-validity/lifecycle policy:
audioToPerformanceMs(audioTimeSec, anchor) =
  anchor.performanceTimeMs + 1000 * (audioTimeSec - anchor.contextTimeSec);

rawErrorMs       = rawInputPerformanceMs - expectedOutputPerformanceMs;
correctedErrorMs = rawErrorMs - offsetMs;
correctedInputMs = rawInputPerformanceMs - offsetMs;
```

Positive error means late. `(c0=10 s,p0=20000 ms,a=10.5 s)` produces **20500 ms**. `target1000/raw1120/offset+100` and `target1000/raw920/offset-100` both produce **+20 ms**. Never add/subtract baseLatency or outputLatency after output timestamp mapping. Native-sample zero/zero, backward/stale/nonfinite samples, fallback policy, and timeline discontinuity detection belong to S10; no exact stale threshold is specified by the source, so its future named constant must be labeled a product decision.

Clock mode values remain `'outputTimestamp' | 'anchorFallback'`. Changing clock mode, sample rate, or output route invalidates an active attempt and makes an existing calibration profile stale. Epoch-origin/invalid/future input timestamps fall back to handler time and low confidence; only valid-origin queue delay is compared against the product cutoff **>150 ms** (150 included, 151 invalidated). S09 does not infer these conditions from raw numbers alone; S10 supplies trust metadata.

## Proposed S09 API

```ts
// Public names are proposed; preserve these units and semantics when integrating.
deriveTapTargets(snapshot: RhythmDocument): number[]; // semantic note onset ticks
computeTapWindows(targetsPerformanceMs: readonly number[], barDurationMs: number):
  | { applicable: false }
  | { applicable: true; minIOIMs: number; WMs: number; GMs: number };

computeInputBounds(barStartPerformanceMs: number, barEndPerformanceMs: number,
                   WMs: number, offsetMs: number): {
  correctedOpenMs: number; correctedCloseMs: number;
  rawOpenMs: number; rawCloseMs: number; finalizeMs: number;
};

matchPerformance(targetsPerformanceMs: readonly number[],
                 correctedInputsMs: readonly number[], WMs: number): MatchResult;

type MatchPair = {
  targetIndex: number;
  inputIndex: number; // original input-array index, never its temporary sorted position
  errorMs: number;    // corrected input minus expected output
};
type MatchResult = {
  pairs: MatchPair[];
  missedTargetIndices: number[];
  extraInputIndices: number[];
  totalAbsErrorMs: number;
};

// Wraps window filtering, matching, rest-only extra classification, and metadata.
buildPerformanceResult(request: PerformanceRequest): {
  result: TapResult;         // persistence-safe aggregate, no raw timestamps
  detail?: PerformanceDetail; // ephemeral pair/miss/extra detail for open result UI
};
```

`PerformanceRequest` should explicitly carry `runId`, `rhythmHash`, `gradingVersion`, frozen `tempo`, `clockMode`, calibration id/version when current, `offsetMs`, bar bounds, expected targets, explicit rest spans transformed to performance ms, eligible raw inputs, and confidence/interruption metadata. It must never accept or mutate `PuzzleProgress`. Persisted TapResult fields follow design 17.3: counts, optional median absolute error, confidence, invalid reason, and identity metadata. Add `calibrationVersion` if needed to preserve the design's profile-version requirement; do not persist pair timestamps. The UI discards ephemeral detail on result close.

Input collection filters count-in taps against the corrected window before storing candidates. Both the collector and public performance matcher enforce **N ≤ 8, M ≤ 64**; a 65th eligible input invalidates rather than truncating. Raw count-in taps outside the eligible window are ignored rather than becoming extras. Invalid or duplicate targets, nonfinite values, invalid bar bounds/window sizes, and out-of-range offset are rejected explicitly. Sorting must not mutate caller arrays.

## Target, window, and closure rules

Targets come from the actual accepted snapshot. `N2 N4 N2` has `[0,480,1440]` ticks, while `N2 N2 N4` has `[0,480,960]`; both L4 answers are valid and require different targets. L5 follows its actual accepted answer too. Rests, sustained-note interiors, and notation fragments never introduce targets.

For two or more targets, `minIOIMs` is the smallest adjacent chronological target interval. A single target uses the full bar duration. Then `WMs=min(160,0.45*minIOIMs)` and `GMs=min(55,0.5*WMs)`. Match and near-center boundaries are inclusive. Quarter120 consecutive eighths give IOI250/W112.5/G55; quarter140 gives W approximately 96.428571 ms. Do not derive W from sustain/envelope duration.

No targets means `notApplicable`: do not divide by target count or fabricate an accuracy 0/100, precision grade, or median. Counts may describe actual input facts, but they are not a scored musical result. The UI says there are no sounding starts to press.

```text
corrected window = [barStart - W,          barEnd + W]
raw window       = [barStart - W + offset, barEnd + W + offset]
finalize         = max(barEnd, barEnd + W + offset)
```

The raw listener is attached from COUNT_IN so negative offsets cannot lose an early valid tap. At BAR_COMPLETE sound resources can be freed, but the listener, immutable snapshot, and run identity stay alive until INPUT_WINDOW_CLOSED. The event should be dispatched only once the same performance clock actually reaches `finalizeMs`; a rounded timer alone cannot authorize early closure.

| Bar1000–4000, W160 | Raw window | Finalize | Critical sample |
| --- | --- | --- | --- |
| offset−250 | [590,3910] | 4000 | raw750 → corrected1000, retained |
| offset+250 | [1090,4410] | 4410 | raw4300 → corrected4050, unmatched extra retained |

Only unmatched eligible inputs are extras. Classify `extraInRest` using the **corrected** timestamp in an explicit half-open rest span `[start,end)`. A tap early within the next note's W window that is matched to that note is not also a rest mistake. An unknown editing gap is not an explicit rest.

## Deterministic sequence matching

1. Validate finite, strictly increasing targets (semantic onsets are unique). Stable-sort input records by `(timestamp, originalIndex)` and keep original indices.
2. Dynamic programming over target/input prefixes permits skip-target, skip-input, and match when `abs(error)<=W`.
3. Compare states by maximum matched count, then minimum total absolute error, then lexicographically earliest chronological `(target rank,input rank)` pair sequence. Map ranks back to original input indices only when returning results. Thus unsorted inputs `[1010,990]` still choose timestamp990 in a tie, returning original index1; duplicate equal-time inputs choose the earlier original index.
4. Carry matched pairs in states (N≤8 makes this inexpensive). Never allocate one target/input twice. Build misses/extras as complements of selected indices, not as a second proximity pass.

Use exact `<=` for contractual boundaries; do not silently widen W with a tolerance. Any tiny tolerance used solely to compare DP sum ties must be a documented, independently tested numeric policy, not a way to admit an out-of-window match. Prefer direct arithmetic and deterministic comparisons until tests demonstrate a necessary alternative.

Golden cases: targets1000/1500 and inputs900/1000/1500 choose pairs `[[0,1],[1,2]]`, with input0 extra. A first-valid greedy algorithm would be wrong. Target1000 and inputs990/1010 chooses990. Input840 at W160 matches target1000; 839.999 is extra. Exact ±G is the near-center category; just outside it remains matched but early/late.

The independent test oracle enumerates every monotonic partial matching for small arrays without using the production DP recurrence/comparator implementation. Compare full pair lists, match counts, total absolute error, misses, and extras. Include translated timestamps, repeated input timestamps, shuffled input arrays, duplicate-allocation prevention, and common shifts to raw-error/offset that preserve corrected error.

## Calibration math boundary for S10

Calibration uses quarter80 with 4 warmup clicks followed by **12 measurement targets**. Warmups are not samples. Provide a separate `matchCalibration` wrapper around a shared private sequence kernel with its own 12-target guard and inclusive ±350 ms; do not call the public 8-target performance API. Keep only one input per measured target and exclude unmatched duplicates/out-of-window taps.

Proposed pure API: `estimateCalibration(rawErrorsMs)` returns either `{ok:true,offsetMs,keptCount,madMs}` or `{ok:false,reason,keptCount,madMs?}`. No database write occurs here.

1. Require at least8 valid matched raw errors.
2. Compute first median and median absolute deviation (MAD).
3. Keep errors with `abs(error-median) <= max(3*MAD,60)`.
4. Recompute median and MAD from retained samples.
5. Reject final count<8, final MAD>45, or offset outside inclusive [−250,+250]. Never clamp. Failed estimation leaves the previous persisted profile untouched.

Independent fixture `[100,102,98,101,99,100,103,97,101,100,99,102]` has count12 and median100. Test outliers300/−200, final7 samples, MAD60 rejection, boundaries count8/MAD45/error-threshold60/offset±250, and offset251 rejection. A positive estimate means consistently late input and is subtracted during performance.

Profile storage belongs to S10/S11: id/version/offset/clockMode/sampleRate/calibratedAt/user-selected output label only. No fingerprint, hardware id, raw samples, or claim of isolated device-latency measurement. UI wording is “내 입력 맞춤”; uncalibrated/fallback/stale output remains a practice or low-confidence mode.

## Planned evidence and handoff

Copy appendix E JSON unchanged to `tests/fixtures/timing.json`. Implement `tapWindows.ts`, `tapMatching.ts`, `performanceResult.ts`, and tests only after S08 gate. Tests must demonstrate all golden cases, complete-search comparison, all-rest, 65-input invalidation, actual L4/L5 targets, no duplicate extra-in-rest accounting, and no progress mutation. S10 additionally verifies listeners survive BAR_COMPLETE until late grace closes, timestamp trust/fallback boundaries, interruption cleanup, and stale calibration behavior. No tests have been executed for this plan.
