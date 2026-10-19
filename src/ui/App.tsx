import { useEffect, useReducer, useRef, useState } from 'react';
import { PUZZLES } from '../content';
import { createDocument, analyzeCoverage,eventsFromTokens } from '../domain/rhythm';
import { gradePuzzle } from '../domain/grading';
import type { Puzzle, RhythmDocument } from '../domain/types';
import { createSessionState, sessionReducer } from '../app/sessionReducer';
import { Editor, Icon } from './Editor';
import { AudioTransport } from './AudioTransport';
import { useAudioSession } from './useAudioSession';
import { TutorialFlow } from './TutorialFlow';
import { ComparePanel, FreeComparison, LearningPanel } from './LearningPanels';
import {PerformancePanel} from './PerformancePanel';
import {useStorageSession} from './useStorageSession';
import {StoragePanel} from './StoragePanel';
import {OfflineStatus} from './OfflineStatus';
import {HelpSettings} from './HelpSettings';
import {DiagnosticFlow,AssessmentHistory} from './DiagnosticFlow';
import {recheckDue,clockElapsedIsTrusted,type AssessmentRecord} from '../content/transfer';
import './styles.css';

const badgeNames = ['four-beats','split-beat','explicit-rest','sustain','rest-position','half-beat'];
export function App() {
  const [state, dispatch] = useReducer(sessionReducer, undefined, () => createSessionState(createDocument([], 'draft-measure-01', 72), PUZZLES[0], 'HOME'));
  const [screen, setScreen] = useState<'home' | 'build' | 'tutorial'|'assessment'>('home');
  const [assessmentPhase,setAssessmentPhase]=useState<AssessmentRecord['phase']>('pre');
  const clockAnchor=useRef({wall:Date.now(),mono:performance.now()});
  const [freeMessage, setFreeMessage] = useState('');
  const drafts = useRef<Record<string, RhythmDocument>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const homeHeading=useRef<HTMLHeadingElement>(null);
  const puzzle = state.editor.puzzle;
  const audio = useAudioSession(state,dispatch);
  const storage=useStorageSession(state,screen,drafts,dispatch,audio);
  useEffect(()=>{document.documentElement.dataset.theme=storage.settings.theme;document.documentElement.dataset.reducedMotion=String(storage.settings.reducedMotion);},[storage.settings.theme,storage.settings.reducedMotion]);
  useEffect(()=>{if(screen==='home')homeHeading.current?.focus();},[screen]);
  useEffect(() => {
    for (const effect of state.effects) {
      if (effect.type === 'validate' && puzzle) {
        const result = gradePuzzle(puzzle, effect.request.snapshot.events);
        dispatch({ type:'VALIDATION_DONE', runId:effect.request.runId, documentRevision:effect.request.documentRevision, result });
      }
    }
  }, [state.effects,puzzle]);
  useEffect(() => { if (screen === 'build') heading.current?.focus(); }, [screen, puzzle?.id]);
  const open = (next?: Puzzle) => {
    if (screen === 'build') drafts.current[puzzle?.id ?? 'free'] = structuredClone(state.editor.document);
    const id = next?.id ?? 'free';
    const doc = drafts.current[id] ?? createDocument(structuredClone(next?.initialEvents ?? []), `draft-${id}`, next?.tempo.default.bpm ?? 80);
    dispatch({ type:'LOAD_DOCUMENT',document:doc,puzzle:next }); setScreen('build'); setFreeMessage('');
  };
  const home = () => { if (screen === 'build') drafts.current[puzzle?.id ?? 'free'] = structuredClone(state.editor.document); dispatch({ type:'LEAVE' }); setScreen('home'); };
  const restoredHome=()=>{dispatch({type:'LEAVE'});setScreen('home');};
  const tutorial = () => {
    if (screen === 'build') drafts.current[puzzle?.id ?? 'free'] = structuredClone(state.editor.document);
    dispatch({type:'LOAD_DOCUMENT',document:createDocument(eventsFromTokens(['N2','N2','R2','N2']),'tutorial',80)});setScreen('tutorial');
  };
  const currentIndex = PUZZLES.findIndex(item => item.id === puzzle?.id);
  const records=storage.settings.assessments??[];
  const assessment=(phase:AssessmentRecord['phase'])=>{if(screen==='build')drafts.current[puzzle?.id??'free']=structuredClone(state.editor.document);dispatch({type:'LEAVE'});setAssessmentPhase(phase);setScreen('assessment');};
  return <div className="app-shell"><a className="skip-link" href="#main">본문으로 건너뛰기</a><header className="site-header shell"><button className="brand" onClick={home}><img src="/assets/app/app-icon.svg" alt="" width="44" height="44" /><span><strong>한 마디 조립실</strong><small>소리와 쉼을 만드는 작은 작업실</small></span></button><span className="session-note">서두르지 않아도 괜찮아요</span></header>
    <main id="main" className="shell">
      <OfflineStatus home={screen==='home'} save={storage.flush} stop={audio.stop}/>
      <StoragePanel storage={storage} document={screen==='build'?state.editor.document:undefined} onHome={restoredHome} onOpen={document=>{if(screen==='build')drafts.current[puzzle?.id??'free']=structuredClone(state.editor.document);drafts.current.free=document;dispatch({type:'LOAD_DOCUMENT',document});setScreen('build');}}/>
      <fieldset className="workspace-fieldset" disabled={!storage.canEdit}>
      {screen==='assessment'?<DiagnosticFlow key={assessmentPhase} phase={assessmentPhase} path={Object.values(state.progress).map(p=>({assistance:p.completedBy,mode:p.mode}))} onExit={restoredHome} onComplete={record=>{storage.setSettings({...storage.settings,assessments:[...records,record]});restoredHome();}}/>:screen === 'tutorial' ? <TutorialFlow onDone={()=>open(PUZZLES[0])} onPlay={events=>audio.play(events,1)} onStop={audio.stop} onEnableSound={()=>audio.engine.unlockFromGesture()} active={audio.active} message={audio.message} practice={<PerformancePanel state={state} audio={audio} tutorial/>}/> : screen === 'home' ? <>
        <section className="hero"><div className="hero-copy"><p className="eyebrow">오늘의 작은 음악 작업</p><h1 ref={homeHeading} tabIndex={-1}>한 마디 조립실</h1><p>음표를 놓고, 쉼표를 더하고.<br />네 박 안에서 나만의 리듬을 발견해요.</p><div className="hero-actions"><button className="primary" onClick={tutorial}>조립실 시작 <span aria-hidden="true">→</span></button><button onClick={() => open()}>자유롭게 만들기</button></div><p className="muted">악보를 몰라도 괜찮아요 · 한 번에 한 마디씩</p></div><div className="hero-illustration" aria-hidden="true"><span className="hero-stamp">4개의 박<br /><strong>무궁무진한 리듬</strong></span></div></section>
        <section className="orders-section" aria-labelledby="orders-title"><div className="section-heading"><div><p className="eyebrow">차근차근 쌓이는 발견</p><h2 id="orders-title">오늘의 여섯 가지 주문</h2></div><span className="progress-label">{Object.values(state.progress).filter(progress => progress.objectivePass).length} / 6 이론 통과</span></div><div className="puzzle-grid">{PUZZLES.map((item,index) => <button key={item.id} className="puzzle-card" onClick={() => open(item)}><img src={`/assets/badges/badge-0${index+1}-${badgeNames[index] + (state.progress[item.id]?.objectivePass ? '' : '-available')}.svg`} alt="" width="68" height="68" /><span className="puzzle-card-copy"><small>주문 {String(index+1).padStart(2,'0')}</small><strong>{item.title}</strong><span>{state.progress[item.id]?.objectivePass ? '✓ 이론 통과 · 다시 만들기' : item.expectedConcept}</span></span><span className="arrow" aria-hidden="true">↗</span></button>)}</div></section>
        <section className="free-banner"><div><p className="eyebrow">정답 없이 즐기는 시간</p><h2>나만의 한 마디</h2><p>소리도, 쉼도, 길이도 자유롭게 조립해 보세요.</p></div><button onClick={() => open()}>자유 조립 열기 →</button></section>
        <section className="card assessment-entry"><h2>내가 이해한 것, 천천히 확인하기</h2><p>선택 사항이에요. 확인하지 않아도 바로 조립실을 이용할 수 있어요. 시간 제한이나 순위는 없어요.</p><div className="action-buttons"><button disabled={records.length>=20} onClick={()=>assessment('pre')}>내가 아는 것 확인하기</button><button disabled={records.length>=20} onClick={()=>assessment('post')}>새 문제로 확인하기</button></div>{clockElapsedIsTrusted(clockAnchor.current.wall,clockAnchor.current.mono,Date.now(),performance.now())&&recheckDue(records,Date.now())&&<p>마지막 확인 뒤 일주일이 지났어요. 원할 때 다시 살펴볼까요? <button disabled={records.length>=20} onClick={()=>assessment('recheck')}>선택 재확인</button></p>}{records.length>=20&&<p>확인 기록 20회가 가득 찼어요. JSON으로 보관할 수 있고 조립은 계속할 수 있어요.</p>}</section><AssessmentHistory records={records}/>
      </> : <>
        <div className="build-heading"><button onClick={home}><Icon name="back" />주문 목록</button><div><p className="eyebrow">{puzzle ? `주문 ${String(currentIndex+1).padStart(2,'0')} / 06` : '자유 조립'}</p><h1 ref={heading} tabIndex={-1}>{puzzle?.title ?? '나만의 한 마디'}</h1></div><button onClick={tutorial}>처음 배우기</button></div>
        <section className="order-card"><span className="order-label">이번에 만들 리듬</span><p>{puzzle?.prompt ?? '네 박을 소리와 쉼으로 채워 보세요. 빈칸과 쉼은 서로 달라요.'}</p></section>
        {puzzle?.modelReferenceId && <ComparePanel key={'compare-'+puzzle.id} a={puzzle.references[puzzle.modelReferenceId]} b={state.editor.document.events} active={audio.active} onPlay={audio.play} initiallyHidden={puzzle.id==='measure-06'} onReveal={()=>dispatch({type:'SET_MODE',mode:'visualAlternative'})}/>}
        <Editor key={'editor-'+(puzzle?.id ?? 'free')} state={state} dispatch={dispatch} playbackTick={audio.position.phase === 'bar' ? audio.position.tick : undefined} onSubmit={() => {
          if (puzzle) dispatch({ type:'SUBMIT' }); else { const coverage = analyzeCoverage(state.editor.document.events); setFreeMessage(coverage.fullCoverage ? coverage.soundingTicks===0 ? '소리가 없는 한 마디예요. 이번 마디에는 눌러야 할 소리가 없어요.' : '네 박이 완성됐어요. 나만의 한 마디를 만들었어요!' : `아직 ${coverage.unknownTicks/480}박이 미입력이에요. 소리나 쉼으로 채워 보세요.`); }
        }}><AudioTransport active={audio.active} preparing={state.phase === 'PREVIEW_PREPARING'} loops={audio.loops} onLoops={audio.setLoops} metronome={audio.metronome} onMetronome={audio.setMetronome} onPlay={() => audio.play()} onStop={audio.stop} message={audio.message} position={audio.position} hasGaps={!analyzeCoverage(state.editor.document.events).fullCoverage} /></Editor>
        {state.feedback && <section className={`feedback card ${state.feedback.objectivePass ? 'success' : ''}`} aria-label="조건 확인 결과" role="status"><h2>{state.feedback.objectivePass ? '이론 통과! 한 마디가 완성됐어요' : '한 조각씩 다시 살펴볼까요?'}</h2><p>{state.feedback.objectivePass ? puzzle?.expectedConcept : state.feedback.representativeError?.message ?? '주문의 조건과 조각을 확인해 보세요.'}</p>{state.feedback.objectivePass && currentIndex < 5 && <button className="primary" onClick={() => open(PUZZLES[currentIndex+1])}>다음 주문 열기 →</button>}</section>}
        {puzzle && state.progress[puzzle.id]?.objectivePass && <p className="card progress-detail" data-testid="learning-progress">이론 통과 · {state.progress[puzzle.id].completedBy==='independent' ? '스스로 조립' : state.progress[puzzle.id].completedBy==='hinted' ? '힌트 사용' : '해답 확인'} · {state.progress[puzzle.id].mode==='visualAlternative' ? '시각 대안으로 조립' : '조립 학습'} · 발견한 답 {state.progress[puzzle.id].discoveredSignatures.length} / {puzzle.expectedAnswerCount}{puzzle.expectedAnswerCount>1 && <button disabled={audio.active} onClick={()=>dispatch({type:'EDIT_COMMAND',command:{type:'clear'},updatedAt:new Date().toISOString()})}>다른 답 찾기</button>}</p>}
        {puzzle ? <LearningPanel key={'learning-'+puzzle.id} state={state} dispatch={dispatch} onTutorial={tutorial} active={audio.active} onPlay={audio.play}/> : <FreeComparison document={state.editor.document} active={audio.active} onPlay={audio.play}/>}
        {freeMessage && <p className="feedback card" role="status">{freeMessage}</p>}
        <PerformancePanel state={state} audio={audio}/>
      </>}
      </fieldset>
      <HelpSettings storage={storage}/>
    </main><footer className="site-footer shell"><span>한 마디 조립실 · 소리와 쉼, 그 사이의 발견</span><span>이 브라우저에 저장해요 · 중요한 작품은 JSON 백업으로 보관해 주세요.</span></footer>
  </div>;
}
