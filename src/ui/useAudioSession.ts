import { useEffect, useRef, useState, type Dispatch } from 'react';
import { AudioEngine } from '../audio/AudioEngine';
import type { AudioStatus, PreviewLoops, RunTiming,AudioStartOptions } from '../audio/types';
import {InputCollector} from '../audio/InputCollector';
import {calibrate,type CalibrationProfile} from '../audio/Calibration';
import {buildPerformanceResult,type TapResult,type PerformanceDetail} from '../domain/performanceResult';
import {fullSignature} from '../domain/signatures';
import { isPlaybackPhase, type SessionState } from '../app/machine';
import type { SessionIntent } from '../app/sessionReducer';
import type { RhythmEvent } from '../domain/types';
import type { TransportPosition } from './AudioTransport';

const idlePosition: TransportPosition = { phase:'idle',tick:0,loopIndex:0 };
export function useAudioSession(state: SessionState, dispatch: Dispatch<SessionIntent>) {
  const stateRef = useRef(state); stateRef.current = state;
  const [status,setStatus] = useState<AudioStatus>({ state:'idle',clockMode:'anchorFallback' });
  const [position,setPosition] = useState<TransportPosition>(idlePosition);
  const [loops,setLoops] = useState<PreviewLoops>(1);
  const [metronome,setMetronome] = useState(false);
  const pad=useRef<HTMLButtonElement>(null);
  const [profile,setProfile]=useState<CalibrationProfile|undefined>(undefined);
  const [profileStale,setProfileStale]=useState(false);
  const [outputLabel,setOutputLabel]=useState<CalibrationProfile['outputLabel']>('speaker');
  const [calibrationMessage,setCalibrationMessage]=useState('');
  const [tapResult,setTapResult]=useState<TapResult|undefined>(undefined);
  const [tapDetail,setTapDetail]=useState<PerformanceDetail|undefined>(undefined);
  const timing=useRef<RunTiming|undefined>(undefined),lowConfidence=useRef(false),invalidReason=useRef<string|undefined>(undefined);
  const profileRef=useRef(profile);profileRef.current=profile;
  const outputLabelRef=useRef(outputLabel);outputLabelRef.current=outputLabel;
  const options = useRef({ loops,metronome }); options.current = { loops,metronome };
  const nextOptions = useRef<AudioStartOptions | undefined>(undefined);
  const engineRef = useRef<AudioEngine | null>(null);
  if (!engineRef.current) engineRef.current = new AudioEngine({
    onStatus: next => {
      const run = stateRef.current.run;
      if (next.runId && next.runId !== run?.runId) return;
      setStatus(previous => next.state === 'idle' && previous.state === 'unavailable' ? previous : next);
      if (next.state === 'unavailable' && run && next.runId === run.runId) dispatch({ type:'AUDIO_INTERRUPTED',runId:run.runId,documentRevision:run.documentRevision });
    },
    onEvent: event => {
      const run = stateRef.current.run;
      if (!run || run.runId !== event.runId || run.documentRevision !== event.documentRevision) return;
      const current=engineRef.current?.getRunTiming();if(current)timing.current=current;
      if(event.type==='AUDIO_READY'&&run.purpose==='performance'&&profileRef.current&&!current?.calibration)setProfileStale(true);
      if (event.type === 'INTERRUPTED') {
        invalidReason.current='audioInterrupted';
        if(/장치|출력|시계/.test(event.reason))setProfileStale(true);
        dispatch({ type:'AUDIO_INTERRUPTED',runId:event.runId,documentRevision:event.documentRevision });
      } else dispatch(event);
    },
  });
  const engine = engineRef.current;
  useEffect(() => {
    for (const effect of state.effects) {
      if (effect.type === 'prepareAudio') {
        const selectedOptions = nextOptions.current ?? options.current;
        nextOptions.current = undefined;
        void engine.start(effect.request,selectedOptions).then(started => {
          const run = stateRef.current.run;
          if (!started && run?.runId === effect.request.runId && run.documentRevision === effect.request.documentRevision) dispatch({ type:'AUDIO_INTERRUPTED',runId:effect.request.runId,documentRevision:effect.request.documentRevision });
        });
      } else if (effect.type === 'stopAudio') engine.stop(effect.runId);
      else if(effect.type==='calculatePerformance'&&timing.current){
        const t=timing.current,r=effect.request;
        const value=buildPerformanceResult({runId:r.runId,rhythmHash:fullSignature(r.snapshot.events),tempo:r.snapshot.tempo,...t,rawInputsMs:r.rawTapsMs,calibrationId:t.calibration?.id,calibrationVersion:t.calibration?.version,lowConfidence:lowConfidence.current,invalidReason:invalidReason.current});
        setTapResult(value.result);setTapDetail(value.detail);dispatch({type:'PERFORMANCE_RESULT_READY',runId:r.runId,documentRevision:r.documentRevision,result:value.result});
      }else if(effect.type==='calculateCalibration'&&timing.current){
        const t=timing.current,estimate=calibrate(t.targetsMs,effect.request.rawTapsMs);
        if(estimate.ok&&!lowConfidence.current&&!invalidReason.current){
          setProfile({id:crypto.randomUUID(),version:1,offsetMs:estimate.offsetMs,clockMode:t.clockMode,sampleRate:t.sampleRate,calibratedAt:new Date().toISOString(),outputLabel:outputLabelRef.current});setProfileStale(false);
          setCalibrationMessage(`내 입력 맞춤을 적용했어요. 유효 입력 ${estimate.keptCount}회. 이 값은 사용자의 움직임과 출력 경로를 함께 반영해요.`);
        }else setCalibrationMessage('입력이 일정하지 않거나 시계 신뢰도가 낮아 새 맞춤값을 적용하지 않았어요. 이전 맞춤값은 유지해요. 다시 시도하거나 건너뛸 수 있어요.');
      }
    }
  },[state.effects,engine]);
  const active = isPlaybackPhase(state.phase);
  const collecting=!!state.run&&state.run.purpose!=='preview'&&['COUNT_IN','PERFORMING','CALIBRATING'].includes(state.phase);
  useEffect(()=>{
    const run=state.run;
    if(!run||!collecting||!pad.current)return;
    const collector=new InputCollector({pad:pad.current,getBounds:()=>engine.getRunTiming(),onInput:input=>{
      lowConfidence.current ||= input.lowConfidence;
      if(input.invalidReason){invalidReason.current=input.invalidReason;engine.stop(run.runId);dispatch({type:'AUDIO_INTERRUPTED',runId:run.runId,documentRevision:run.documentRevision});return;}
      const t=engine.getRunTiming();if(!t)return;timing.current=t;
      dispatch({type:'TAP',runId:run.runId,documentRevision:run.documentRevision,timestampMs:input.timestampMs,inputBounds:{rawStartMs:t.rawOpenMs,rawEndMs:t.rawCloseMs,barEndMs:t.barEndMs}});
    }});
    pad.current.focus({preventScroll:true});
    return ()=>collector.dispose();
  },[state.run?.runId,collecting,engine,dispatch]);
  useEffect(()=>{
    const changed=()=>setProfileStale(true);navigator.mediaDevices?.addEventListener('devicechange',changed);
    return ()=>navigator.mediaDevices?.removeEventListener('devicechange',changed);
  },[]);
  useEffect(()=>{if(!state.run){setTapDetail(undefined);timing.current=undefined;}},[state.run]);
  useEffect(() => {
    if (!active) return;
    const interrupt = () => {
      const run = stateRef.current.run;
      if (!run) return;
      engine.stop(run.runId);
      dispatch({ type:'AUDIO_INTERRUPTED',runId:run.runId,documentRevision:run.documentRevision });
    };
    const visibility = () => { if (document.hidden) interrupt(); };
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',interrupt);
    window.addEventListener('orientationchange',interrupt);
    if (document.hidden) interrupt();
    return () => {
      document.removeEventListener('visibilitychange',visibility);
      window.removeEventListener('pagehide',interrupt);
      window.removeEventListener('orientationchange',interrupt);
    };
  },[active,engine,dispatch]);
  useEffect(() => {
    if (!active) { setPosition(idlePosition); return; }
    let frame = 0;
    const paint = () => {
      const next = engine.getPosition();
      setPosition({ phase:next.phase === 'countIn' ? 'countIn' : next.phase === 'playing' || next.phase === 'awaitingInput' ? 'bar' : 'idle',tick:next.cursorTick,countInBeat:next.countInBeat ?? undefined,loopIndex:next.loopIndex });
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  },[active,engine]);
  useEffect(() => () => engine.dispose(),[engine]);
  const play = (events?: RhythmEvent[], count?: PreviewLoops) => {
    if (isPlaybackPhase(stateRef.current.phase)) return;
    nextOptions.current = { ...options.current,loops:count ?? options.current.loops };
    void engine.unlockFromGesture();
    dispatch({ type:'PLAY_PREVIEW',previewEvents:events });
  };
  const stop = () => { engine.stop(); dispatch({ type:'STOP' }); };
  const beginPractice=(calibration=false)=>{
    if(isPlaybackPhase(stateRef.current.phase))return;
    lowConfidence.current=false;invalidReason.current=undefined;setTapResult(undefined);setTapDetail(undefined);setCalibrationMessage('');
    nextOptions.current={loops:1,metronome:false,profile:profileStale?undefined:profile};
    void engine.unlockFromGesture();dispatch({type:calibration?'START_CALIBRATION':'PLAY_PERFORMANCE'});
  };
  const closeResult=()=>{setTapResult(undefined);setTapDetail(undefined);setCalibrationMessage('');timing.current=undefined;dispatch({type:'CLOSE_RESULT'});};
  const message = status.state === 'unavailable' ? '소리 재생을 시작하지 못했어요. 듣기를 다시 누르거나 소리 없이 조립을 계속할 수 있어요.'
    : status.state === 'interrupted' || state.phase === 'INTERRUPTED' ? '재생이 중단됐어요. 듣기를 누르면 새로운 카운트인부터 시작해요.'
    : status.state === 'unlocking' ? '브라우저의 소리를 준비하고 있어요.'
    : status.state === 'countIn' ? '네 박을 센 다음 리듬이 시작돼요.'
    : status.state === 'playing' ? '조립한 길이대로 소리와 쉼을 듣고 있어요.'
    : '듣기를 누르면 소리가 켜져요. 소리 없이도 모든 이론 문제를 풀 수 있어요.';
  return { engine,status,position,loops,setLoops,metronome,setMetronome,active,play,stop,message,pad,beginPractice,closeResult,tapResult,tapDetail,profile,setProfile,profileStale,setProfileStale,outputLabel,setOutputLabel,calibrationMessage,invalidReason:invalidReason.current };
}
