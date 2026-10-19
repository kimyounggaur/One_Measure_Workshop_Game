import { freezeSnapshot } from '../app/machine';
import { WHOLE_TICKS,ticksToSeconds } from '../domain/time';
import {computeInputBounds,computeTapWindows} from '../domain/tapWindows';
import {calibrationSchedule,profileMatches,type CalibrationProfile} from './Calibration';
import { ClockMapper } from './ClockMapper';
import { compileSchedule } from './compileSchedule';
import { createClickVoice, createSynthVoice, STOP_FADE_SEC } from './synthVoice';
import type { DisposableVoice } from './synthVoice';
import type { AudioDiagnostics, AudioEngineEvent, AudioEngineOptions, AudioPosition, AudioRunRequest, AudioSchedule, AudioStartOptions, AudioStatus,RunTiming } from './types';

export const AUDIO_START_LEAD_SEC = 0.15;
export const AUDIO_READY_TIMEOUT_MS = 2000;
export const AUDIO_READY_POLL_MS = 10;
export const AUDIO_EVENT_POLL_MS = 25;
export const MASTER_GAIN = 0.18;

type Timer = ReturnType<typeof setTimeout>;
type RunningAudio = {
  request: AudioRunRequest;
  schedule: AudioSchedule;
  mapper: ClockMapper;
  voices: Set<DisposableVoice>;
  buses: GainNode[];
  countInEnded: boolean;
  barComplete: boolean;
  sourcesDisposed: boolean;
  calibration?:CalibrationProfile;
  poll?: Timer;
  removeListeners: (() => void)[];
};

const IDLE_POSITION: AudioPosition = { phase: 'idle', countInBeat: null, beatProgress: 0, cursorTick: 0, progress: 0, loopIndex: 0, loops: 1 };

/** One gesture-created context; the audio timeline owns every scheduled onset. */
export class AudioEngine {
  private context?: AudioContext;
  private run?: RunningAudio;
  private unlockPromise?: Promise<boolean>;
  private cancelUnlock?: () => void;
  private pendingStart?: { runId: string; promise: Promise<boolean> };
  private generation = 0;
  private disposed = false;
  private explicitlyUnlocked = false;
  private contextsCreated = 0;
  private totalSourcesCreated = 0;
  private readonly voices = new Set<DisposableVoice>();
  private readonly timers = new Set<Timer>();
  private readonly cleanupReleases = new Set<() => void>();
  private readonly pendingListeners = new Set<() => void>();
  private readonly nowMs: () => number;
  private status: AudioStatus = { state: 'idle', clockMode: 'anchorFallback' };

  constructor(private readonly options: AudioEngineOptions = {}) {
    this.nowMs = options.nowMs ?? (() => performance.now());
  }

  /** Call directly from the sound/listen button, before dispatch/await/effects. */
  unlockFromGesture(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.unlockPromise) return this.unlockPromise;
    if (this.run && this.context?.state === 'running') return Promise.resolve(true);
    if (this.visibilityTarget()?.visibilityState === 'hidden') return Promise.resolve(false);
    let context: AudioContext;
    try {
      if (!this.context) {
        const factory = this.options.createContext ?? (() => {
          const AudioContextConstructor = globalThis.AudioContext ??
            (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioContextConstructor) throw new Error('AUDIO_CONTEXT_UNAVAILABLE');
          return new AudioContextConstructor();
        });
        this.context = factory();
        this.contextsCreated++;
      }
      context = this.context;
      if (context.state === 'closed') throw new Error('AUDIO_CONTEXT_CLOSED');
    } catch {
      this.setStatus('unavailable', '이 브라우저에서 소리를 준비하지 못했어요. 소리 없이 계속하거나 다시 시도할 수 있어요.');
      return Promise.resolve(false);
    }
    this.setStatus('unlocking');
    const initialTime = context.currentTime;
    const deadline = this.nowMs() + AUDIO_READY_TIMEOUT_MS;
    const promise = new Promise<boolean>(resolve => {
      let settled = false;
      let poll: Timer | undefined;
      const finish = (ready: boolean, cancelled = false) => {
        if (settled) return;
        settled = true;
        this.explicitlyUnlocked = ready;
        this.clearTimer(poll);
        this.cancelUnlock = undefined;
        for (const remove of this.pendingListeners) remove();
        this.pendingListeners.clear();
        if (!cancelled && !this.disposed) this.setStatus(ready ? 'ready' : 'unavailable', ready ? undefined : '소리가 아직 준비되지 않았어요. 소리 없이 계속하거나 소리 켜기를 다시 눌러 주세요.');
        resolve(ready);
      };
      this.cancelUnlock = () => finish(false, true);
      const listen = (target: EventTarget | null, type: string, listener: EventListener) => {
        if (!target) return;
        target.addEventListener(type, listener);
        this.pendingListeners.add(() => target.removeEventListener(type, listener));
      };
      const documentTarget = this.visibilityTarget();
      const windowTarget = this.orientationTarget();
      listen(documentTarget, 'visibilitychange', () => { if (documentTarget?.visibilityState === 'hidden') finish(false); });
      listen(windowTarget, 'orientationchange', () => finish(false));
      listen(windowTarget, 'pagehide', () => finish(false));
      const check = () => {
        if (this.disposed) { finish(false, true); return; }
        if (context.state === 'running' && Number.isFinite(context.currentTime) && context.currentTime > initialTime) {
          finish(true); return;
        }
        if (this.nowMs() >= deadline || context.state === 'closed') { finish(false); return; }
        poll = this.setTimer(check, AUDIO_READY_POLL_MS);
      };
      // resume is invoked synchronously in this user-gesture call. A pending
      // browser promise is bounded by the independent readiness check above.
      try {
        if (context.state !== 'running') void context.resume().catch(() => finish(false));
      } catch { finish(false); }
      if (!settled) poll = this.setTimer(check, AUDIO_READY_POLL_MS);
    });
    this.unlockPromise = promise;
    void promise.then(() => { if (this.unlockPromise === promise) this.unlockPromise = undefined; });
    return promise;
  }

  start(request: AudioRunRequest, options: AudioStartOptions = {}): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.run) return Promise.resolve(this.run.request.runId === request.runId && this.run.request.documentRevision === request.documentRevision);
    if (this.pendingStart) return this.pendingStart.runId === request.runId ? this.pendingStart.promise : Promise.resolve(false);
    const generation = ++this.generation;
    const promise = this.prepare(request, options, generation);
    this.pendingStart = { runId: request.runId, promise };
    void promise.then(() => { if (this.pendingStart?.promise === promise) this.pendingStart = undefined; });
    return promise;
  }

  private async prepare(request: AudioRunRequest, options: AudioStartOptions, generation: number): Promise<boolean> {
    const identity = { runId: request.runId, documentRevision: request.documentRevision };
    let frozen: AudioRunRequest;
    try {
      if (!request.runId || request.snapshot.revision !== request.documentRevision) throw new Error('INVALID_AUDIO_IDENTITY');
      frozen = { ...identity, purpose: request.purpose, snapshot: freezeSnapshot(request.snapshot) };
      // Validate before creating/resuming browser resources.
      if(request.purpose !== 'calibration')compileSchedule(frozen, 0, {loops:options.loops,metronome:options.metronome});
    } catch {
      this.setStatus('unavailable', '이 조립의 소리를 준비할 수 없어요. 조각과 박자를 다시 확인해 주세요.');
      return false;
    }
    // React effects must never create/resume a context. Only the explicit
    // gesture entry point may request unlock; a rejected gesture is not retried.
    const ready = this.unlockPromise ? await this.unlockPromise : this.explicitlyUnlocked && this.context?.state === 'running';
    if (!ready || this.disposed || generation !== this.generation || !this.context || this.context.state !== 'running' || this.visibilityTarget()?.visibilityState === 'hidden') return false;
    const context = this.context;
    const mapper = new ClockMapper(context, this.nowMs);
    const sample = mapper.sample();
    if (sample.discontinuity) { this.setStatus('unavailable', '소리 시계를 확인하지 못했어요. 다시 시도해 주세요.'); return false; }
    const schedule = frozen.purpose === 'calibration'?calibrationSchedule(context.currentTime+AUDIO_START_LEAD_SEC):compileSchedule(frozen, context.currentTime + AUDIO_START_LEAD_SEC, {loops:options.loops,metronome:options.metronome});
    const calibration=frozen.purpose==='performance'&&profileMatches(options.profile,mapper.mode,context.sampleRate)?options.profile:undefined;
    const run: RunningAudio = { request: frozen, schedule, mapper, calibration, voices: new Set(), buses: [], countInEnded: false, barComplete: false, sourcesDisposed: false, removeListeners: [] };
    this.run = run;
    try {
      const master = context.createGain(); run.buses.push(master); master.gain.value = MASTER_GAIN; master.connect(context.destination);
      const noteBus = context.createGain(); run.buses.push(noteBus); noteBus.connect(master);
      const metronomeBus = context.createGain(); run.buses.push(metronomeBus); metronomeBus.connect(master);
      const uiBus = context.createGain(); run.buses.push(uiBus); uiBus.connect(master);
      for (const note of schedule.notes) this.addVoice(run, callback => createSynthVoice(context, noteBus, note.startSec, note.endSec, callback));
      for (const click of schedule.clicks) this.addVoice(run, callback => createClickVoice(context, metronomeBus, click.startSec, click.accented, callback));
      this.attachInterruptionListeners(run);
      this.setStatus('countIn');
      const timing=this.getRunTiming();
      this.emit(run, { ...identity, type: 'AUDIO_READY',...(timing&&frozen.purpose!=='preview'?{inputBounds:{rawStartMs:timing.rawOpenMs,rawEndMs:timing.rawCloseMs,barEndMs:timing.barEndMs}}:{}) });
      if (this.run === run) this.pump(run);
      return this.run === run;
    } catch {
      this.interrupt('소리 예약을 완료하지 못했어요. 처음부터 다시 시도해 주세요.');
      return false;
    }
  }

  private addVoice(run: RunningAudio, create: (onDisposed: () => void) => DisposableVoice): void {
    const handle: { voice?: DisposableVoice } = {};
    const voice = create(() => { if (handle.voice) { run.voices.delete(handle.voice); this.voices.delete(handle.voice); } });
    handle.voice = voice;
    run.voices.add(voice); this.voices.add(voice); this.totalSourcesCreated++;
  }

  /** Idempotent. A stale stop effect cannot stop a newer run. */
  stop(runId?: string): void {
    const currentId = this.run?.request.runId ?? this.pendingStart?.runId;
    if (runId && currentId && currentId !== runId) return;
    ++this.generation;
    this.cancelUnlock?.();
    this.pendingStart = undefined;
    const run = this.run;
    this.run = undefined;
    if (run) this.disposeRun(run, true);
    if (!this.disposed) this.setStatus('idle');
  }

  private interrupt(reason: string): void {
    const run = this.run;
    if (!run) return;
    const identity = { runId: run.request.runId, documentRevision: run.request.documentRevision };
    ++this.generation;
    this.run = undefined;
    this.disposeRun(run, true);
    this.setStatus('interrupted', reason);
    this.options.onEvent?.({ ...identity, type: 'INTERRUPTED', reason });
  }

  private attachInterruptionListeners(run: RunningAudio): void {
    const listen = (target: EventTarget | null | undefined, type: string, listener: EventListener) => {
      if (!target) return;
      target.addEventListener(type, listener);
      run.removeListeners.push(() => target.removeEventListener(type, listener));
    };
    const documentTarget = this.visibilityTarget();
    const windowTarget = this.orientationTarget();
    listen(documentTarget, 'visibilitychange', () => { if (this.run === run && documentTarget?.visibilityState === 'hidden') this.interrupt('화면을 벗어나 소리를 멈췄어요. 처음부터 다시 시작해 주세요.'); });
    listen(windowTarget, 'orientationchange', () => { if (this.run === run) this.interrupt('화면 방향이 바뀌어 소리를 멈췄어요. 처음부터 다시 시작해 주세요.'); });
    listen(windowTarget, 'pagehide', () => { if (this.run === run) this.interrupt('화면을 벗어나 소리를 멈췄어요.'); });
    listen(this.context, 'statechange', () => { if (this.run === run && this.context?.state !== 'running') this.interrupt('소리 재생이 중단됐어요. 처음부터 다시 시작해 주세요.'); });
    listen(this.context, 'sinkchange', () => { if (this.run === run) this.interrupt('소리 출력이 바뀌었어요. 처음부터 다시 시작해 주세요.'); });
    // devicechange is only a detectable-route-change signal, not a promise that
    // every Bluetooth, system volume, or silent-switch change can be observed.
    const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    listen(mediaDevices, 'devicechange', () => { if (this.run === run) this.interrupt('소리 장치가 바뀌었어요. 처음부터 다시 시작해 주세요.'); });
  }

  private pump(run: RunningAudio): void {
    if (this.run !== run || this.disposed) return;
    if (this.context?.state !== 'running') { this.interrupt('소리 재생이 중단됐어요. 처음부터 다시 시작해 주세요.'); return; }
    const sample = run.mapper.sample();
    if (sample.modeChanged || sample.discontinuity) { this.interrupt('소리 시계가 바뀌었어요. 처음부터 다시 시작해 주세요.'); return; }
    const audioSec = run.mapper.performanceToAudioSec(this.nowMs());
    const identity = { runId: run.request.runId, documentRevision: run.request.documentRevision };
    if (!run.countInEnded && audioSec >= run.schedule.barStartSec) {
      run.countInEnded = true;
      this.setStatus('playing');
      this.emit(run, { ...identity, type: 'COUNT_IN_ENDED', purpose: run.request.purpose });
      if (this.run !== run) return;
    }
    if (!run.barComplete && audioSec >= run.schedule.barEndSec) {
      run.barComplete = true;
      this.disposeSources(run, false);
      this.emit(run, { ...identity, type: 'BAR_COMPLETE' });
      if (this.run !== run) return;
      if (run.request.purpose === 'preview') {
        this.run = undefined;
        this.disposeRun(run, false);
        this.setStatus('idle');
        return;
      }
      // Sound resources finish first; input stays live until the raw grace closes.
      this.setStatus('awaitingInput');
    }
    const timing=this.getRunTiming();
    if(run.barComplete&&timing&&this.nowMs()>=timing.finalizeMs){
      this.emit(run,{...identity,type:'INPUT_WINDOW_CLOSED',nowMs:this.nowMs(),inputBounds:{rawStartMs:timing.rawOpenMs,rawEndMs:timing.rawCloseMs,barEndMs:timing.barEndMs}});
      if(this.run===run){this.run=undefined;this.disposeRun(run,false);this.setStatus('idle');}
      return;
    }
    run.poll = this.setTimer(() => this.pump(run), AUDIO_EVENT_POLL_MS);
  }

  getRunTiming():RunTiming|undefined{
    const run=this.run,context=this.context;if(!run||!context)return;
    const map=(sec:number)=>run.mapper.audioToPerformanceMs(sec),s=run.schedule;
    const barStartMs=map(s.barStartSec),barEndMs=map(s.barEndSec);
    const targetsMs=run.request.purpose==='calibration'?s.clicks.filter(c=>!c.countIn).map(c=>map(c.startSec)):s.notes.filter(n=>n.loopIndex===0).map(n=>map(n.startSec));
    const windows=run.request.purpose==='calibration'?{applicable:true,WMs:350}:computeTapWindows(targetsMs,s.barDurationSec*1000);
    const offsetMs=run.calibration?.offsetMs??0;
    const bounds=computeInputBounds(barStartMs,barEndMs,windows.applicable?windows.WMs:0,offsetMs);
    return {...bounds,barStartMs,barEndMs,targetsMs,offsetMs,clockMode:run.mapper.mode,sampleRate:context.sampleRate,calibration:run.calibration,restSpansMs:run.request.snapshot.events.filter(e=>e.kind==='rest').map(e=>({startMs:map(s.barStartSec+ticksToSeconds(e.startTick,run.request.snapshot.tempo)),endMs:map(s.barStartSec+ticksToSeconds(e.startTick+e.durationTick,run.request.snapshot.tempo))}))};
  }

  getPosition(): AudioPosition {
    const run = this.run;
    if (!run) return { ...IDLE_POSITION };
    const { schedule } = run;
    const audioSec = run.mapper.performanceToAudioSec(this.nowMs());
    const countInElapsed = Math.max(0, audioSec - schedule.countInStartSec);
    if (audioSec < schedule.barStartSec) return {
      runId: run.request.runId, purpose: run.request.purpose, phase: 'countIn',
      countInBeat: Math.min(4, Math.floor(countInElapsed / schedule.quarterDurationSec) + 1),
      beatProgress: (countInElapsed % schedule.quarterDurationSec) / schedule.quarterDurationSec,
      cursorTick: 0, progress: 0, loopIndex: 0, loops: schedule.loops,
    };
    const totalElapsed = Math.max(0, audioSec - schedule.barStartSec);
    const finished = totalElapsed >= schedule.barDurationSec * schedule.loops;
    const loopIndex = Math.min(schedule.loops - 1, Math.floor(totalElapsed / schedule.barDurationSec));
    const progress = finished ? 1 : (totalElapsed - loopIndex * schedule.barDurationSec) / schedule.barDurationSec;
    return { runId: run.request.runId, purpose: run.request.purpose, phase: finished ? 'awaitingInput' : 'playing', countInBeat: null,
      beatProgress: (totalElapsed % schedule.quarterDurationSec) / schedule.quarterDurationSec,
      cursorTick: progress * WHOLE_TICKS, progress, loopIndex, loops: schedule.loops };
  }

  getDiagnostics(): AudioDiagnostics {
    return { contextsCreated: this.contextsCreated, activeRuns: this.run ? 1 : 0, activeSources: this.voices.size,
      totalSourcesCreated: this.totalSourcesCreated, activeTimers: this.timers.size,
      activeListeners: (this.run?.removeListeners.length ?? 0) + this.pendingListeners.size, pendingStart: !!this.pendingStart,
      clockMode: this.run?.mapper.mode ?? this.status.clockMode, contextState: this.context?.state ?? 'missing' };
  }
  getDebugState(): AudioDiagnostics { return this.getDiagnostics(); }

  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    for (const timer of [...this.timers]) this.clearTimer(timer);
    for (const release of [...this.cleanupReleases]) release();
    for (const voice of [...this.voices]) voice.dispose();
    this.voices.clear();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => undefined);
  }

  private disposeSources(run: RunningAudio, fade: boolean): void {
    if (run.sourcesDisposed) return;
    run.sourcesDisposed = true;
    const release = () => {
      this.cleanupReleases.delete(release);
      for (const voice of [...run.voices]) { voice.dispose(); this.voices.delete(voice); }
      run.voices.clear();
      for (const bus of run.buses) bus.disconnect();
      run.buses = [];
    };
    if (fade && this.context?.state === 'running') {
      for (const voice of run.voices) voice.stop(this.context.currentTime);
      this.cleanupReleases.add(release);
      this.setTimer(release, STOP_FADE_SEC * 1000 + 10);
    } else release();
  }
  private disposeRun(run: RunningAudio, fade: boolean): void {
    this.clearTimer(run.poll);
    for (const remove of run.removeListeners.splice(0)) remove();
    this.disposeSources(run, fade);
  }
  private emit(run: RunningAudio, event: AudioEngineEvent): void { if (this.run === run) this.options.onEvent?.(event); }
  private setStatus(state: AudioStatus['state'], reason?: string): void {
    this.status = { state, ...(reason ? { reason } : {}), clockMode: this.run?.mapper.mode ?? this.status.clockMode, ...(this.run ? { runId: this.run.request.runId } : {}) };
    this.options.onStatus?.(this.status);
  }
  private setTimer(callback: () => void, delayMs: number): Timer {
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, delayMs);
    this.timers.add(timer);
    return timer;
  }
  private clearTimer(timer?: Timer): void { if (timer !== undefined) { clearTimeout(timer); this.timers.delete(timer); } }
  private visibilityTarget(): Document | null { return this.options.visibilityTarget === undefined ? (typeof document === 'undefined' ? null : document) : this.options.visibilityTarget; }
  private orientationTarget(): Window | null { return this.options.orientationTarget === undefined ? (typeof window === 'undefined' ? null : window) : this.options.orientationTarget; }
}
