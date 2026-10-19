# Audio and performance contract review

Status: **design review only; this document does not implement or validate audio**.

Read in full: [prompt pack](source/one_measure_workshop_vibe_coding_promptpack.md) S07–S10 (lines 296–428), appendix D (748–765), and appendix E (767–809). Cross-checked against [design](source/one_measure_workshop_development_design.md) §§14–16, §20.2, and §22.2. The repository calls its source file `one_measure_workshop_vibe_coding_promptpack.md`; there is no `source-prompts.md` alias at review time.

## Integration order and ownership

1. S07 consumes a validated S06 edit snapshot and proves L3 assemble → listen → stop → listen. It owns scheduling, synthesis, output clocks, interruption, resource disposal, and preview lifecycle.
2. S08 connects the actual tutorial/puzzle experience. Its objective progress is independent of explanation answers, audio availability, and optional tapping. It passes the user's accepted snapshot to performance; it must not substitute a canonical answer for L4/L5 alternatives.
3. S09 adds pure, deterministic tap-window and sequence-matching math with complete-search oracle tests. It does not access the browser, write progress, or estimate physical device latency.
4. S10 integrates output clocks, input collection, calibration, and optional performance. It preserves the distinction between audible bar completion and the later close of the input window.

The S07 automated gate does not grant DEVICE_PASS. All real iOS/Android listening and internal/wired/Bluetooth input checks remain DEVICE_PENDING until recorded on physical hardware.

## Proposed API boundaries

Names below are proposals to adapt to the domain types once they exist. Avoid parallel competing rhythm types. Public time values carry `Sec`, `Ms`, or `Tick` suffixes.

```ts
type Purpose = 'preview' | 'performance' | 'calibration';
type ClockMode = 'outputTimestamp' | 'anchorFallback';
type AudioIdentity = { runId: string; documentRevision: number };
type RunSnapshot = Readonly<AudioIdentity & {
  rhythmHash: string;
  rhythm: DeepReadonly<ValidatedRhythm>;
  tempo: DeepReadonly<Tempo>;
  purpose: Purpose;
  loops: 1 | 2 | 4;
}>;

// Pure: ticks + frozen tempo -> absolute source schedule; no timers or DOM.
compileSchedule(snapshot, countInStartSec): AudioSchedule;
// Real-time and OfflineAudioContext must share the same voice implementation.
createSynthVoice(context, noteBus, startSec, semanticEndSec): DisposableVoice;

interface AudioEngine {
  enableFromUserGesture(): Promise<AudioAvailability>;
  start(snapshot: RunSnapshot): Promise<RunHandle>;
  stop(reason: StopReason): void; // idempotent; invalidates pending starts, too
  subscribe(listener: (event: AudioEvent) => void): () => void;
  getDiagnostics(): { activeRuns: number; activeSources: number; clockMode: ClockMode };
}

// BAR_COMPLETE frees sound resources only during performance.
// INPUT_WINDOW_CLOSED triggers scoring and full session cleanup.
type AudioEvent = AudioIdentity & ({
  type: 'AUDIO_READY' | 'COUNT_IN_ENDED' | 'BAR_COMPLETE' |
        'INPUT_WINDOW_CLOSED' | 'INTERRUPTED';
  purpose: Purpose;
  reason?: string;
});

interface ClockMapper {
  sample(): ClockSampleResult;
  audioToPerformanceMs(audioSec: number): number;
  performanceToAudioSec(performanceMs: number): number;
  readonly mode: ClockMode;
}

deriveTapTargets(acceptedSnapshot): readonly TargetTick[];
computeTapWindows(targetsMs, barDurationMs): Windows | NotApplicable;
computeInputBounds(barStartMs, barEndMs, windowMs, offsetMs): InputBounds;
matchPerformance(targetsMs, inputs, windows, metadata): PerformanceResult;
// Separate cardinality guard: 12 measurement targets, not performance's N <= 8.
matchCalibration(targetsMs, inputs): CalibrationMatches;
estimateCalibration(rawErrorsMs, profileContext): CalibrationDecision;
```

`DeepReadonly` must be backed by an actual deep clone/freeze at the run boundary; TypeScript alone cannot prevent mutation. `start` shares or rejects duplicate pending intent so ten clicks cannot create ten contexts/runs. All async callbacks carry runId and revision, and are ignored after stop/navigation/replacement. Editing stays locked from preparation until stop or complete session disposal. Changing UI tempo only affects the next run.

`RunHandle` should expose schedule identity, frozen snapshot, note-source disposal, full disposal, and cursor position derived from the output clock. Make source disposal and full disposal separate, idempotent methods. Full disposal cancels sources, gain automation, timers, RAF, listeners, captures, and retained raw inputs. S09/S10 result contains targets/matched/missed/extras/medianAbsErrorMs/confidence/invalidReason plus runId/rhythmHash/gradingVersion/tempo and calibration-profile version; it never mutates objective progress.

## S07 scheduling and synthesis invariants

- One AudioContext is created/resumed inside the explicit sound/listen gesture. AUDIO_READY requires `state === running` and observed `currentTime` advancement. Missing context, rejected resume, or suspended state keeps silent learning available and offers retry.
- Count-in is four quarter beats for the MVP. `audioStart = currentTime + 0.15`; `barStart = audioStart + countInDuration`. Schedule every event in advance at `barStart + loopIndex * barDuration + eventOffset`; do not accumulate successive loop durations or schedule onsets from setInterval/render/RAF.
- Preview loops are 1/2/4; performance is exactly one. All-rest and unknown spans produce no note source. An unfinished preview is allowed with explicit unknown-gap wording and never grants full coverage.
- Use 261.63 Hz sine plus a low second harmonic. Attack 5 ms. Release `min(0.015, noteDurationSec * 0.1)` begins before semantic end so gain is zero at semantic end. Source stop may have a short safety margin after that end; the safety tail cannot produce sound in a rest.
- Master gain 0.18 is an initial product value. Separate note, metronome, and UI buses; reserve headroom. No reverb, delay, or streamed samples. A/B share timbre/volume/BPM/count-in/time coordinates and play sequentially.
- Stop fades briefly, stops/disconnects even future sources, invalidates runId, and releases every resource. Preview completion fully disposes. Performance BAR_COMPLETE disposes note/metronome sound resources but retains input listener, runId, and snapshot until INPUT_WINDOW_CLOSED.
- Hidden page, non-running context, orientation change, OS interruption, or detectable output change interrupts the run and invalidates that tap attempt. Keep the theory draft/result. There is no automatic mid-run resume; retry starts a new run/count-in.
- Cursor is a function of output-clock position. RAF only paints it. Completion timers may lag; they must not move already scheduled onsets or authorize early input-window closure.

### Independent audio golden values

Quarter = 80; countInStart = 10.000 s; countInDuration = 3.000 s; barStart = 13.000 s.

| Rhythm | Note onsets (s) | Semantic ends (s) | Note-bus silence |
| --- | --- | --- | --- |
| L3 N2 N2 R2 N2 | 13, 13.75, 15.25 | 13.75, 14.5, 16 | [14.5, 15.25) |
| L4 N4 N2 N2 | 13, 14.5, 15.25 | 14.5, 15.25, 16 | none |
| L4 N2 N4 N2 | 13, 13.75, 15.25 | 13.75, 15.25, 16 | none |
| N2 | 13 | 13.75 | none in comparison span |
| N1 R1 | 13 | 13.375 | [13.375, 13.75) |
| R8 | none | none | [13, 16) |

Count-in click onsets: 10, 10.75, 11.5, 12.25. L3 four-loop starts: 13, 16, 19, 22. L6 quarter = 60: bar 4 s, relative onsets [0.5, 1, 2, 3], silence [0, 0.5) and [2.5, 3).

OfflineAudioContext tests use the actual synth on the isolated note bus. Record sampleRate and exactly how many boundary samples are excluded; test rest interior `abs(sample) < 1e-5`, finite samples, peaks below clipping, semantic release, and equal-length N4 versus N2 N2 with one versus two restarts. Metronome clicks must not contaminate rest measurements. Also test all-rest, four loops, future-node cancellation after stop, duplicate start, late callback after exit, and live-node count returning to baseline. Offline waveform correctness is not actual listening evidence.

## S09 pure matching contract

- Targets are semantic note starts in the user's passed snapshot, never notation fragments, sustain subdivisions, rests, or a fixed answer. Performance limits: N <= 8, M <= 64. All-rest yields `notApplicable` with no invented 0/100 score or division by zero.
- `W = min(160, 0.45 * minIOIMs)`; `G = min(55, 0.5 * W)`. A sole target uses bar duration as minimum IOI. Both ±W and ±G are inclusive; W + 0.001 is excluded. Eighth notes at quarter120: IOI250, W112.5, G55. At quarter140: W96.428571… .
- Every target/input lies in the same performance-ms coordinate system. `rawError = rawInput - expectedOutput`; `correctedError = rawError - offset`; `correctedInput = rawInput - offset`. Positive error/offset means late.
- Time-ordered DP priority: maximum match count, minimum total absolute error, lexicographically earliest target/input pair sequence. Stable sort inputs by time and retain original index. Assign each target/input at most once. A first-valid greedy implementation fails [targets1000,1500; inputs900,1000,1500; W160].
- Only unmatched inputs are extras. Only unmatched inputs whose corrected time lies inside an explicit half-open rest span are `extraInRest`. An early input matched to the next note is not additionally a rest error.
- Validate finite timestamps, nonnegative finite duration/window, sorted target policy, legal cardinality, valid run metadata, and finite bounded offset. A 65th input invalidates the attempt instead of silently truncating it.

### Input collection and closure

Accept corrected inputs in `[barStart-W, barEnd+W]`; equivalent raw window is `[barStart-W+offset, barEnd+W+offset]`. Attach listeners at COUNT_IN, then filter by the corrected window. Do not discard an early raw tap merely because the audible bar has not begun.

`closePerformanceMs = max(barEnd, barEnd+W+offset)`. BAR_COMPLETE and INPUT_WINDOW_CLOSED are distinct events. Close checks the current clock again and must not finalize early because a timer was rounded.

| Fixture (ms) | Expected |
| --- | --- |
| target1000, raw1120, offset100 | corrected error +20 |
| target1000, raw920, offset-100 | corrected error +20 |
| bar1000–4000, W160, offset-250 | raw590–3910, finalize4000, raw750 preserved as corrected1000 |
| bar1000–4000, W160, offset250 | raw1090–4410, finalize4410, raw4300 remains corrected4050 extra |
| targets[1000,1500], inputs[900,1000,1500], W160 | pairs[[0,1],[1,2]], extra0 |
| target1000, inputs990/1010 | choose990, 1010 extra |
| target1000, input840, W160 | match |
| target1000, input839.999, W160 | extra |
| L4 N2 N4 N2 | target ticks [0,480,1440] |
| L4 N2 N2 N4 | target ticks [0,480,960] |

Add exhaustive small-array oracle/property tests: no duplicate allocation, objective ordering, deterministic ties, translation invariance, raw-error/offset common-shift invariance, and all-rest/overflow behavior.

## S10 clock, input, and calibration contract

Output timestamp mapping is `P(a) = p0 + 1000 * (a-c0)`. `(c0=10s,p0=20000ms,a=10.5s)` must give 20500 ms. Do not add or subtract baseLatency/outputLatency after this mapping. Reject zero/zero, nonfinite, backwards, and stale samples. Refresh about every 100 ms or by RAF, using one continuous audio timeline. Specify a named, tested stale threshold as a product constant; the source does not prescribe an exact stale age. Timeline discontinuity invalidates the run.

Unsupported/unstable native output timestamp uses adjacent `currentTime`/`performance.now()` anchor reads. This is `anchorFallback`, not proof of exact acoustic output. Changing clockMode/sampleRate or output route stales calibration and invalidates a current performance attempt. Never claim to detect the system mute switch or all route changes.

InputCollector receives pointerdown only (no synthetic click), retains distinct simultaneous pointers, ignores repeat down for the same active pointer until up/cancel, and releases pointer capture on cleanup. Keyboard only accepts non-repeat Space/Enter while the pad itself has focus and prevents their scroll behavior. Timestamp sanity distinguishes performance-origin events from epoch/future/nonfinite values. Invalid-origin timestamps use handler time and lowConfidence; valid-origin queue delay >150 ms invalidates, exactly150 remains valid. A derived delay from a known-wrong origin must not trigger the valid-origin rule.

Calibration is its own 16-click timeline at quarter80: 4 unscored warmups then **12** measured targets, one input each within inclusive ±350 ms. Do not route it through the performance N<=8 guard. Keep at least8 valid samples. Compute median and MAD, reject `abs(error-median) > max(3*MAD,60)`, then recompute both with the retained values. Final count<8, final MAD>45, or offset outside inclusive [-250,+250] rejects saving. Never clamp251 to250 or overwrite/delete the previous profile on rejection.

Required calibration vectors include [100,102,98,101,99,100,103,97,101,100,99,102] → count12, median100; outliers300/-200 excluded if at least8 remain; valid7 rejected; MAD60 rejected; 250 accepted and251 rejected. Boundary fixtures must test equality at350,45,8,60 and both signed250 limits.

Persist profile only with id/version/offsetMs/clockMode/sampleRate/calibratedAt/user-selected output label. No hardware ID, fingerprint, microphone, or raw timestamp history. Keep raw events in memory only, deleting on result close except explicit user-authorized debug export. Uncalibrated/fallback/unstable paths are practiceOnly or lowConfidence, not a claim of precise performance or poor skill.

## S08/S10 UI and completion checks

- TUT1–5 allow silence, skip, and replay without timer pressure. TUT5 demonstrates three onset targets with no failure score or persistence and is always skippable.
- Say “시작 박자 연습: 길게 누를 필요 없어요” and “내 입력 맞춤”. Do not say that press duration or exact device latency was measured. Lead with factual onset counts/extras, with error details optional.
- Keep objectivePass immediately after structure+objective success. Explanation unanswered/wrong, tapping skipped/poor/invalidated, audio failure, and all-rest never revoke it. All-rest text: “이번 마디에는 눌러야 할 소리가 없어요”.
- L4/L5 accept any valid alternative and derive its own targets. L6 visualAlternative and solutionViewed are separate; do not claim ear-only completion after visual help.
- Every exit stops audio and requests saving through the storage interface. Do not claim persistent save before S11 actually confirms it.
- Automated gates require pure fixtures, offline waveform tests, lifecycle/input integration, all six puzzle flows, silent learning, all-rest and gap paths, duplicate-start/stop cleanup, hidden/rotate/context/output interruption, and preservation of theory results. The later S15 20-minute resource test remains a separate gate.
- Physical-device manual checklist must record OS/browser/version/output route/date, enable → listen → rest → stop → repeat, lock/rotation/interrupt → new count-in, calibration status and route staleness. Browser mobile emulation and WebKit automation do not count as physical iOS/Android or human listening.

## Implementation decisions still to record

Before implementation, choose and test named constants for native-clock stale age, timeline-discontinuity tolerance, future timestamp tolerance, short stop fade/source cleanup margin, and second-harmonic gain. These values are not specified by the source and must be labeled product choices. Keep synth disposal usable with fakes and OfflineAudioContext so resource and waveform assertions do not depend on the UI.

## Official API access check — 2026-10-19

Both official sources were accessible. The pinned [Web Audio Recommendation (2021-06-17)](https://www.w3.org/TR/2021/REC-webaudio-20210617/) remains the contractual baseline. The generic latest URL currently resolves to [Web Audio 1.1 Working Draft (2026-09-22)](https://www.w3.org/TR/2026/WD-webaudio-1.1-20260922/), not another Recommendation; draft-only features are not required.

- `resume()` can remain **pending** when starting is disallowed; closed contexts reject. Implementation implication: bound readiness waiting, allow cancellation/retry, and ignore a late resolution after run invalidation. [AudioContext methods](https://www.w3.org/TR/2021/REC-webaudio-20210617/#dom-audiocontext-resume)
- Sources are single-start objects. Negative scheduling times throw; past times execute immediately. Calling stop before a scheduled future start prevents playback, and a subsequent stop replaces the previous stop time. Implementation implication: create fresh voices per onset and prevent repeat cleanup from extending an earlier cancellation. [Scheduled source methods](https://www.w3.org/TR/2021/REC-webaudio-20210617/#AudioScheduledSourceNode)
- `getOutputTimestamp()` may return zero/zero before rendering. Its output estimate uses context seconds and performance milliseconds; `currentTime - contextTime` is not a reliable latency measurement. [Output timestamp](https://www.w3.org/TR/2021/REC-webaudio-20210617/#dom-audiocontext-getoutputtimestamp)
- An exponential ramp cannot end at zero. Use the specified linear release to semantic-end zero. [AudioParam automation](https://www.w3.org/TR/2021/REC-webaudio-20210617/#dom-audioparam-exponentialramptovalueattime)
- Chrome documents user-interaction creation/resume and `state`/`statechange` checks. Keep a real sound/listen button and silent fallback; do not use autoplay-bypass flags as production evidence. This guidance does not establish Safari behavior. [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/#web-audio)

This was a documentation check, not a browser/device compatibility or listening test. No audio implementation was started by this review.
