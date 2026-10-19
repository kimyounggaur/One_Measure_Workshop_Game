# S07 audio verification

Date: 2026-10-19. Audio-specific automated gate: **PASS** (75 unit/integration cases and 10 actual Chrome OfflineAudioContext cases). The root agent owns the final fresh production build/UI integration gate. Physical-device gate: **DEVICE_PENDING**.

## Implementation

- `src/audio/AudioEngine.ts`: a single explicitly gesture-created/resumed AudioContext, bounded readiness waiting, immutable run snapshot, identity-checked callbacks, duplicate-start sharing, source and session disposal, interruption, and output-derived position.
- `src/audio/compileSchedule.ts`: pure validated absolute count-in/note/metronome scheduling, one/two/four preview loops, one performance bar, and explicit unknown-gap accounting. Calibration remains reserved for S10.
- `src/audio/synthVoice.ts`: the same synth for live and offline rendering; one sine-plus-second-harmonic oscillator per voice, separate gain envelope, exact semantic-end zero, short cancellation fade, and idempotent disposal.
- `src/audio/ClockMapper.ts`: native output timestamps or explicit anchor fallback without adding latency attributes. Native stale/backwards/invalid samples and timeline changes are detected.
- UI integration belongs to `src/ui/useAudioSession.ts` and `AudioTransport.tsx`. The sound/listen button calls unlock immediately; the effect calls `start` without creating or resuming a context. RAF only renders cursor/count-in position.

## Product constants

These are implementation choices, not guaranteed browser/device accuracy:

| Constant | Value |
| --- | ---: |
| Initial scheduling lead | 150 ms |
| Readiness timeout / poll | 2000 ms / 10 ms |
| Lifecycle clock poll (never note scheduling) | 25 ms |
| Native timestamp maximum age | 500 ms, inclusive |
| Native performance future tolerance | 20 ms |
| Native context future tolerance | 20 ms |
| Timeline discontinuity threshold | 150 ms |
| Master gain | 0.18 |
| Fundamental / second harmonic | 261.63 Hz / relative 0.12, normalized periodic wave |
| Attack | 5 ms |
| Release | min(15 ms, 10% of duration), ending at semantic end |
| Normal source stop grace / cancellation fade | 5 ms / 5 ms |
| Metronome voice gain / duration | 0.35 / 45 ms |

## Automated evidence

Pure schedule and synth-spy tests: **48 passed**. The tests cover appendix D values, safe boundaries, invalid tempo/document/options, no note sources for rests/gaps, immutable schedules, absolute four-loop starts, equal-length sustained versus repeated notes, source-cancellation monotonicity, and gain semantic ends.

Engine integration tests: **19 passed**. Actual Web Audio interfaces are replaced by controlled fakes only for lifecycle assertions. Cases include no context without a gesture, no effect-driven unlock retry, ten simultaneous starts creating one context/run, actual running/time-advancement readiness, rejected/pending/suspended resume, pending hidden/rotation cancellation, late promise invalidation, caller mutation after snapshot, full preview cleanup, performance source-only cleanup, future cancellation, stale stop isolation, interruptions, and five complete runs returning timers/listeners/sources to baseline.

Clock tests: **8 passed**. They check the independent `10 s / 20000 ms / 10.5 s -> 20500 ms` oracle, no double latency, unsupported/zero/nonfinite native fallback, future/stale/backwards samples, exact stale-age boundary, timeline change, and no silent mid-run fallback promotion. The final combined command `npx vitest run tests/unit/audio-clock.test.ts tests/unit/audio-schedule.test.ts tests/integration/audio-engine.test.ts` passed **75/75**, exit 0.

The root agent separately reported **5 production UI lifecycle tests passed** for gesture/start/stop/replay, missing-audio silent editing, hidden/orientation interruption with theory preserved, gap preview/four-loop navigation stop, and normal completion/edit unlock. A final root-owned fresh build/UI regression is pending at this report's audio handoff.

Actual Chrome OfflineAudioContext tests: **10/10 passed**, exit 0, 8.7 seconds. The harness bundles the production schedule/synth in memory with Vite `write:false`; it does not overwrite the production build. At both **44100 Hz and 48000 Hz**, isolated L3 rest interiors, semantic-end samples, all-rest output, unknown gaps, and post-stop output measured **peak 0**. Interior windows exclude exactly two boundary samples; exact semantic-end points are also checked separately. Four loops preserve their absolute start positions. All rendered sources were disposed. Mixed note/count-in/metronome output peak was **0.2429816** at 44100 Hz and **0.2429626** at 48000 Hz, below clipping. The largest sample difference before a scheduled stop was **2.235e-8**, below the 1e-5 waveform tolerance.

Detailed JSON evidence is in `output/playwright/s07-{note-boundaries,articulation,loops-mix,stop,stop-envelope}-{44100,48000}.json` (ten files), and is attached to the Playwright results. Local browser/server execution needed the same approved elevated execution context as the other UI tests; the initial sandbox socket restriction was an execution-environment issue, not an audio failure. `npm run test:audio` includes both waveform and UI lifecycle suites.

TypeScript passed after the engine and clock additions. Targeted audio ESLint passed. The final repository-wide check remains owned by the root agent.

## Integration corrections from independent review

- STOP or failed resume must still allow SUBMIT; the root corrected the editor/machine guard mismatch.
- The machine now accepts identity-scoped `AUDIO_INTERRUPTED`, preventing a stale native callback from interrupting a newer run. The root reported four added machine regressions and 22 passing machine cases.
- Both pending unlock and the UI PREPARING phase observe hidden/pagehide/orientation. The engine checks visibility again before scheduling. No delayed resume can schedule a hidden or cancelled run.
- `AudioEngine.start` never creates/resumes a context in a React effect. It shares an explicit gesture unlock or uses an already unlocked running context; an immediately rejected unlock is not retried automatically.
- The root made App's reducer initialization lazy so cursor RAF updates do not repeatedly deep-clone the initial document.

## Verification limits and manual procedure

No human listening or physical iOS/Android device test has been performed. Browser offline synthesis can verify the generated signal; it cannot prove speaker/Bluetooth output, acoustic latency, physical touch timing, or the system silent switch. Headless Chrome and mobile viewport emulation are not physical-device tests.

On each supported physical iOS Safari and Android Chrome device, record OS/browser version/date and built-in, wired, or Bluetooth output. Enable sound, build/listen to L3, check its third-beat silence, stop during count-in and during a note, replay from a fresh four-beat count-in, repeat four times, rotate/lock/background the app, and confirm interruption then fresh restart. Verify that the theory draft and passed objective survive, that no future note sounds after stop, and that failed sound setup still allows silent theory completion. Record actual listening separately from automated waveform measurements. Calibration/direct tapping belongs to S09/S10 and is not claimed by this gate.
