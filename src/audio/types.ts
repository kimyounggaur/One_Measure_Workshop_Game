import type { ActiveRun, AsyncIdentity, RunPurpose, InputBounds } from '../app/machine';
import type { CalibrationProfile } from './Calibration';

export type ClockMode = 'outputTimestamp' | 'anchorFallback';
export type PreviewLoops = 1 | 2 | 4;
export type AudioStartOptions = { loops?: PreviewLoops; metronome?: boolean; profile?:CalibrationProfile };
export type AudioEngineEvent =
  | (AsyncIdentity & { type: 'AUDIO_READY'; inputBounds?:InputBounds })
  | (AsyncIdentity & { type: 'COUNT_IN_ENDED'; purpose: RunPurpose })
  | (AsyncIdentity & { type: 'BAR_COMPLETE' })
  | (AsyncIdentity & { type: 'INPUT_WINDOW_CLOSED'; nowMs:number;inputBounds?:InputBounds })
  | (AsyncIdentity & { type: 'INTERRUPTED'; reason: string });
export type AudioStatus = {
  state: 'idle' | 'unlocking' | 'ready' | 'countIn' | 'playing' | 'awaitingInput' | 'interrupted' | 'unavailable';
  reason?: string;
  clockMode: ClockMode;
  runId?: string;
};
export type AudioPosition = {
  runId?: string;
  purpose?: RunPurpose;
  phase: 'idle' | 'countIn' | 'playing' | 'awaitingInput';
  /** Count-in beats are 1–4; null outside the count-in. */
  countInBeat: number | null;
  beatProgress: number;
  cursorTick: number;
  progress: number;
  loopIndex: number;
  loops: PreviewLoops;
};
export type ScheduledNote = { startSec: number; endSec: number; startTick: number; durationTick: number; loopIndex: number };
export type ScheduledClick = { startSec: number; accented: boolean; countIn: boolean };
export type AudioSchedule = {
  countInStartSec: number;
  countInDurationSec: number;
  barStartSec: number;
  barEndSec: number;
  barDurationSec: number;
  quarterDurationSec: number;
  loops: PreviewLoops;
  notes: readonly ScheduledNote[];
  clicks: readonly ScheduledClick[];
  unknownTicks: number;
};
export type AudioEngineOptions = {
  onEvent?: (event: AudioEngineEvent) => void;
  onStatus?: (status: AudioStatus) => void;
  /** Test seam only; production uses a single gesture-created native context. */
  createContext?: () => AudioContext;
  nowMs?: () => number;
  visibilityTarget?: Document | null;
  orientationTarget?: Window | null;
};
export type AudioRunRequest = Pick<ActiveRun, 'runId' | 'documentRevision' | 'snapshot' | 'purpose'>;
export type RunTiming={barStartMs:number;barEndMs:number;targetsMs:number[];restSpansMs:{startMs:number;endMs:number}[];rawOpenMs:number;rawCloseMs:number;finalizeMs:number;offsetMs:number;clockMode:ClockMode;sampleRate:number;calibration?:CalibrationProfile};
export type AudioDiagnostics = {
  contextsCreated: number;
  activeRuns: number;
  activeSources: number;
  totalSourcesCreated: number;
  activeTimers: number;
  activeListeners: number;
  pendingStart: boolean;
  clockMode: ClockMode;
  contextState: string;
};
