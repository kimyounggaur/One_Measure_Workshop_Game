import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, AUDIO_READY_TIMEOUT_MS } from '../../src/audio/AudioEngine';
import type { AudioEngineEvent, AudioRunRequest, AudioStatus, AudioStartOptions } from '../../src/audio/types';
import { createDocument, eventsFromTokens } from '../../src/domain/rhythm';

class FakeParam {
  value = 0;
  setValueAtTime(value: number, _time: number) { this.value = value; return this; }
  linearRampToValueAtTime(value: number, _time: number) { this.value = value; return this; }
  cancelScheduledValues(_time: number) { return this; }
}
class FakeNode {
  connections = 0;
  gain = new FakeParam();
  connect(_target: unknown) { this.connections++; return _target; }
  disconnect() { this.connections = 0; }
}
class FakeSource extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  onended: (() => void) | null = null;
  startSec?: number;
  stopSec?: number;
  private endedTimer?: ReturnType<typeof setTimeout>;
  constructor(private readonly context: FakeContext) { super(); }
  setPeriodicWave(_wave: unknown) {}
  start(time: number) { if (this.startSec !== undefined) throw new Error('already started'); this.startSec = time; }
  stop(time: number) {
    this.stopSec = time;
    clearTimeout(this.endedTimer);
    this.endedTimer = setTimeout(() => this.onended?.(), Math.max(0, time - this.context.currentTime) * 1000);
  }
}
class FakeContext extends EventTarget {
  state: AudioContextState = 'suspended';
  destination = new FakeNode();
  sampleRate = 48000;
  nodes: FakeNode[] = [];
  sources: FakeSource[] = [];
  resumeCalls = 0;
  mode: 'resolve' | 'reject' | 'pending' | 'resolvedSuspended' = 'resolve';
  private startMs = Date.now();
  private frozenSec = 0;
  private pendingResume?: () => void;
  get currentTime() { return this.state === 'running' ? (Date.now() - this.startMs) / 1000 : this.frozenSec; }
  setState(state: AudioContextState) {
    this.frozenSec = this.currentTime;
    if (state === 'running') this.startMs = Date.now() - this.frozenSec * 1000;
    this.state = state; this.dispatchEvent(new Event('statechange'));
  }
  resume(): Promise<void> {
    this.resumeCalls++;
    if (this.mode === 'reject') return Promise.reject(new Error('resume rejected'));
    if (this.mode === 'pending') return new Promise(resolve => { this.pendingResume = resolve; });
    if (this.mode !== 'resolvedSuspended') this.setState('running');
    return Promise.resolve();
  }
  resolveResume() { this.setState('running'); this.pendingResume?.(); }
  close() { this.setState('closed'); return Promise.resolve(); }
  createGain() { const node = new FakeNode(); this.nodes.push(node); return node; }
  createOscillator() { const node = new FakeSource(this); this.nodes.push(node); this.sources.push(node); return node; }
  createPeriodicWave() { return {}; }
}
class Visibility extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  hide() { this.visibilityState = 'hidden'; this.dispatchEvent(new Event('visibilitychange')); }
}
function request(id = 'preview-1', purpose: AudioRunRequest['purpose'] = 'preview'): AudioRunRequest {
  return { runId: id, documentRevision: 0, purpose, snapshot: createDocument(eventsFromTokens(['N2', 'N2', 'R2', 'N2'])) };
}
function fixture() {
  const context = new FakeContext();
  const visibility = new Visibility();
  const orientation = new EventTarget();
  const events: AudioEngineEvent[] = [];
  const statuses: AudioStatus[] = [];
  const factory = vi.fn(() => context as unknown as AudioContext);
  const engine = new AudioEngine({ createContext: factory, nowMs: () => Date.now(), visibilityTarget: visibility as unknown as Document,
    orientationTarget: orientation as Window, onEvent: event => events.push(event), onStatus: status => statuses.push(status) });
  return { engine, context, visibility, orientation, events, statuses, factory };
}
function begin(engine: AudioEngine, run: AudioRunRequest, options?: AudioStartOptions) { void engine.unlockFromGesture(); return engine.start(run, options); }
const engines: AudioEngine[] = [];
function setup() { const data = fixture(); engines.push(data.engine); return data; }

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose(); vi.clearAllTimers(); vi.useRealTimers(); });

describe('S07 gesture/readiness and immutable run lifecycle', () => {
  it('start effects never create or retry a context without a successful explicit unlock', async () => {
    const { engine, context, factory } = setup();
    expect(await engine.start(request())).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    context.mode = 'reject';
    expect(await engine.unlockFromGesture()).toBe(false);
    expect(await engine.start(request('after-rejection'))).toBe(false);
    expect(context.resumeCalls).toBe(1);
  });
  it('constructs no context until the gesture and shares ten simultaneous starts', async () => {
    const { engine, context, factory, events } = setup();
    expect(factory).not.toHaveBeenCalled();
    const pending = Array.from({ length: 10 }, () => { void engine.unlockFromGesture(); return begin(engine, request()); });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(context.resumeCalls).toBe(1);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(20);
    expect(await Promise.all(pending)).toEqual(Array(10).fill(true));
    expect(events.filter(event => event.type === 'AUDIO_READY')).toHaveLength(1);
    expect(engine.getDiagnostics()).toMatchObject({ contextsCreated: 1, activeRuns: 1, activeSources: 7, pendingStart: false });
  });
  it('retains the original tempo and events when the caller changes its document', async () => {
    const { engine, context } = setup();
    const run = request();
    const pending = begin(engine, run, { loops: 4 });
    run.snapshot.tempo.bpm = 140;
    run.snapshot.events.length = 0;
    await vi.advanceTimersByTimeAsync(20);
    expect(await pending).toBe(true);
    const noteSources = context.sources.slice(0, 12);
    expect(noteSources.map(source => source.startSec)).toEqual([3.16, 3.91, 5.41, 6.16, 6.91, 8.41, 9.16, 9.91, 11.41, 12.16, 12.91, 14.41]);
    expect(engine.getPosition().loops).toBe(4);
  });
  it('does not report readiness just because resume resolved while still suspended', async () => {
    const { engine, context, events, statuses } = setup();
    context.mode = 'resolvedSuspended';
    const pending = begin(engine, request());
    await vi.advanceTimersByTimeAsync(AUDIO_READY_TIMEOUT_MS + 20);
    expect(await pending).toBe(false);
    expect(events).toEqual([]);
    expect(statuses.at(-1)?.state).toBe('unavailable');
    expect(engine.getDiagnostics()).toMatchObject({ activeRuns: 0, activeTimers: 0, activeListeners: 0 });
  });
  it.each(['reject', 'pending'] as const)('handles resume %s without an unhandled promise or false AUDIO_READY', async mode => {
    const { engine, context, events } = setup(); context.mode = mode;
    const pending = begin(engine, request());
    await vi.advanceTimersByTimeAsync(AUDIO_READY_TIMEOUT_MS + 20);
    expect(await pending).toBe(false);
    context.resolveResume(); await vi.advanceTimersByTimeAsync(20);
    expect(events).toEqual([]);
    expect(engine.getDiagnostics()).toMatchObject({ activeRuns: 0, activeSources: 0, activeTimers: 0 });
  });
  it('missing AudioContext returns false and permits a silent application path', async () => {
    const engine = new AudioEngine({ createContext: () => { throw new Error('not supported'); } }); engines.push(engine);
    expect(await engine.unlockFromGesture()).toBe(false);
    expect(await begin(engine, request())).toBe(false);
    expect(engine.getDiagnostics().contextsCreated).toBe(0);
  });
  it.each(['stop', 'hidden', 'orientation'] as const)('cancels pending readiness on %s and ignores late resume', async action => {
    const { engine, context, visibility, orientation, events } = setup(); context.mode = 'pending';
    const pending = begin(engine, request());
    if (action === 'stop') engine.stop();
    if (action === 'hidden') visibility.hide();
    if (action === 'orientation') orientation.dispatchEvent(new Event('orientationchange'));
    expect(await pending).toBe(false);
    context.resolveResume(); await vi.advanceTimersByTimeAsync(3000);
    expect(events).toEqual([]);
    expect(engine.getDiagnostics()).toMatchObject({ activeRuns: 0, activeSources: 0, activeTimers: 0, activeListeners: 0 });
  });
  it('will not start a run while the document is already hidden', async () => {
    const { engine, visibility, factory } = setup(); visibility.hide();
    expect(await begin(engine, request())).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });
});

describe('S07 audio clock completion and cleanup', () => {
  it('reports count-in beat and output-derived cursor before fully disposing preview', async () => {
    const { engine, events } = setup(); const pending = begin(engine, request());
    await vi.advanceTimersByTimeAsync(20); expect(await pending).toBe(true);
    expect(engine.getPosition()).toMatchObject({ phase: 'countIn', countInBeat: 1, cursorTick: 0 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(engine.getPosition().countInBeat).toBe(2);
    await vi.advanceTimersByTimeAsync(2500);
    expect(engine.getPosition().phase).toBe('playing');
    expect(engine.getPosition().cursorTick).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(events.map(event => event.type)).toEqual(['AUDIO_READY', 'COUNT_IN_ENDED', 'BAR_COMPLETE']);
    expect(engine.getDiagnostics()).toMatchObject({ activeRuns: 0, activeSources: 0, activeTimers: 0, activeListeners: 0 });
  });
  it('keeps performance identity/listeners after bar completion while disposing all sound nodes', async () => {
    const { engine, events } = setup(); const pending = begin(engine, request('perform-1', 'performance'));
    await vi.advanceTimersByTimeAsync(6200); expect(await pending).toBe(true);
    expect(events.at(-1)?.type).toBe('BAR_COMPLETE');
    expect(engine.getPosition()).toMatchObject({ runId: 'perform-1', phase: 'awaitingInput', cursorTick: 1920 });
    expect(engine.getDiagnostics()).toMatchObject({ activeRuns: 1, activeSources: 0 });
    expect(engine.getDiagnostics().activeListeners).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(events.at(-1)?.type).toBe('INPUT_WINDOW_CLOSED');
    expect(engine.getDiagnostics()).toMatchObject({ activeRuns: 0, activeTimers: 0, activeListeners: 0 });
  });
  it('stop is idempotent, cancels every future source, and stale stop cannot kill a new run', async () => {
    const { engine, context, events } = setup(); let pending = begin(engine, request(), { loops: 4 });
    await vi.advanceTimersByTimeAsync(20); expect(await pending).toBe(true);
    engine.stop(); engine.stop(); await vi.advanceTimersByTimeAsync(20);
    expect(context.sources.every(source => source.stopSec! <= 0.025)).toBe(true);
    const countBefore = events.length;
    await vi.advanceTimersByTimeAsync(20000); expect(events).toHaveLength(countBefore);
    expect(engine.getDiagnostics()).toMatchObject({ activeRuns: 0, activeSources: 0, activeTimers: 0, activeListeners: 0 });
    pending = begin(engine, request('preview-2')); await vi.advanceTimersByTimeAsync(20); expect(await pending).toBe(true);
    engine.stop('preview-1'); expect(engine.getDiagnostics().activeRuns).toBe(1);
    expect(engine.getDiagnostics().contextsCreated).toBe(1);
  });
  it.each(['hidden', 'orientation', 'context', 'output'] as const)('interrupts on %s and leaves no late run callback', async interruption => {
    const { engine, context, events, visibility, orientation } = setup();
    const pending = begin(engine, request()); await vi.advanceTimersByTimeAsync(20); expect(await pending).toBe(true);
    if (interruption === 'hidden') visibility.hide();
    if (interruption === 'orientation') orientation.dispatchEvent(new Event('orientationchange'));
    if (interruption === 'context') context.setState('suspended');
    if (interruption === 'output') context.dispatchEvent(new Event('sinkchange'));
    await vi.advanceTimersByTimeAsync(30);
    expect(events.at(-1)).toMatchObject({ type: 'INTERRUPTED', runId: 'preview-1', documentRevision: 0 });
    expect(engine.getDiagnostics()).toMatchObject({ activeRuns: 0, activeSources: 0, activeTimers: 0, activeListeners: 0 });
    const previousEvents = events.length;
    await vi.advanceTimersByTimeAsync(10000); expect(events).toHaveLength(previousEvents);
  });
  it('repeated complete runs return resource counts to baseline and dispose closes the context', async () => {
    const { engine, context } = setup();
    for (let index = 0; index < 5; index++) {
      const pending = begin(engine, request(`repeat-${index}`)); await vi.advanceTimersByTimeAsync(6500); expect(await pending).toBe(true);
      expect(engine.getDiagnostics()).toMatchObject({ contextsCreated: 1, activeRuns: 0, activeSources: 0, activeTimers: 0, activeListeners: 0 });
    }
    engine.dispose(); engine.dispose();
    expect(context.state).toBe('closed');
    expect(context.nodes.every(node => node.connections === 0)).toBe(true);
  });
});

describe('S10 calibrated windows and separate calibration timeline',()=>{
  it.each([-250,250])('retains the raw window and only closes at max(bar end, raw close): %d',async offsetMs=>{
    const {engine,events}=setup();const pending=begin(engine,request('offset','performance'),{profile:{id:'test',version:1,offsetMs,clockMode:'anchorFallback',sampleRate:48000,calibratedAt:'2026-10-19T00:00:00Z',outputLabel:'speaker'}});
    await vi.advanceTimersByTimeAsync(20);expect(await pending).toBe(true);const t=engine.getRunTiming()!;
    expect(t.rawOpenMs).toBeCloseTo(t.barStartMs-160+offsetMs);expect(t.rawCloseMs).toBeCloseTo(t.barEndMs+160+offsetMs);
    await vi.advanceTimersByTimeAsync(t.finalizeMs-Date.now()-1);expect(events.some(e=>e.type==='INPUT_WINDOW_CLOSED')).toBe(false);
    if(offsetMs>0){expect(engine.getDiagnostics().activeSources).toBe(0);expect(engine.getDiagnostics().activeListeners).toBeGreaterThan(0);}
    await vi.advanceTimersByTimeAsync(30);expect(events.at(-1)?.type).toBe('INPUT_WINDOW_CLOSED');expect(engine.getDiagnostics()).toMatchObject({activeSources:0,activeListeners:0,activeTimers:0,activeRuns:0});
  });
  it('calibration schedules four warmups and twelve measured clicks at 80 BPM',async()=>{
    const {engine,context}=setup();const pending=begin(engine,request('calibration','calibration'));await vi.advanceTimersByTimeAsync(20);expect(await pending).toBe(true);
    const t=engine.getRunTiming()!;expect(t.targetsMs).toHaveLength(12);expect(context.sources).toHaveLength(16);expect(t.targetsMs[1]-t.targetsMs[0]).toBeCloseTo(750);expect(t.barEndMs-t.barStartMs).toBeCloseTo(9000);engine.stop();
  });
  it('stale sample-rate/mode profile is not reused',async()=>{
    const {engine}=setup();const pending=begin(engine,request('stale','performance'),{profile:{id:'test',version:1,offsetMs:200,clockMode:'outputTimestamp',sampleRate:44100,calibratedAt:'2026-10-19T00:00:00Z',outputLabel:'wired'}});await vi.advanceTimersByTimeAsync(20);expect(await pending).toBe(true);expect(engine.getRunTiming()).toMatchObject({offsetMs:0,calibration:undefined});
  });
});
