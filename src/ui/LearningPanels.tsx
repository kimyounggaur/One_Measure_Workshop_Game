import { useEffect, useRef, useState, type Dispatch } from 'react';
import { exampleSolution } from '../content/learning';
import { analyzeCoverage, PALETTE, paletteId } from '../domain/rhythm';
import { fullSignature, onsetSignature, silenceSignature } from '../domain/signatures';
import type { RhythmEvent, RhythmDocument } from '../domain/types';
import type { SessionState } from '../app/machine';
import type { SessionIntent } from '../app/sessionReducer';
import { RhythmStrip, positionName } from './Editor';

export function RhythmDescription({ events }: {events:RhythmEvent[]}) {
  const coverage=analyzeCoverage(events);
  return <><p>소리 시작 {onsetSignature(events).length}번 · 소리 {coverage.soundingTicks/480}박 · 쉼 {coverage.restTicks/480}박 · 미입력 {coverage.unknownTicks/480}박</p><ol className="rhythm-description">{[...events].sort((a,b)=>a.startTick-b.startTick).map(event=><li key={event.id}>{positionName(event.startTick)}: {PALETTE[paletteId(event)].name}, {event.durationTick/480}박 지속</li>)}</ol></>;
}
export function ComparePanel({ a,b,active,onPlay,initiallyHidden=false,onReveal }: { a:RhythmEvent[];b:RhythmEvent[];active:boolean;onPlay:(events:RhythmEvent[],count?:1)=>void;initiallyHidden?:boolean;onReveal?:()=>void }) {
  const [visible,setVisible]=useState(!initiallyHidden);
  return <section className="card compare-panel" aria-label="리듬 비교"><h2>{initiallyHidden ? '모델과 내 조립' : 'A와 B 비교하기'}</h2><p>같은 빠르기와 음색으로 하나씩 들어 보세요. 듣기 횟수에는 제한이 없어요.</p><div className="action-buttons"><button disabled={active} onClick={()=>onPlay(a,1)}>{initiallyHidden ? '모델 듣기' : 'A 원래 리듬 듣기'}</button><button disabled={active} onClick={()=>onPlay(b,1)}>B 내 조립 듣기</button></div>
    {!visible && <button onClick={()=>{setVisible(true);onReveal?.();}}>모델 기호 보기</button>}
    {visible && <><div className="comparison-columns"><div><h3>{initiallyHidden ? '모델 · 시각 대안' : 'A · 보관한 리듬'}</h3><div className="timeline"><RhythmStrip events={a}/></div><RhythmDescription events={a}/></div><div><h3>B · 현재 조립</h3><div className="timeline"><RhythmStrip events={b}/></div><RhythmDescription events={b}/></div></div><p>소리 시작 횟수: {onsetSignature(a).length === onsetSignature(b).length ? '같아요' : '달라요'} · 쉼 위치: {JSON.stringify(silenceSignature(a)) === JSON.stringify(silenceSignature(b)) ? '같아요' : '달라요'} · 시작·지속·쉼 전체: {fullSignature(a) === fullSignature(b) ? '같아요' : '달라요'}</p></>}
  </section>;
}
export function LearningPanel({state,dispatch,onTutorial,active,onPlay}:{state:SessionState;dispatch:Dispatch<SessionIntent>;onTutorial:()=>void;active:boolean;onPlay:(events:RhythmEvent[],count?:1)=>void}) {
  const puzzle=state.editor.puzzle!;
  const [level,setLevel]=useState(0);
  const [explanation,setExplanation]=useState<string>();
  const [showAnswer,setShowAnswer]=useState(false);
  const [failures,setFailures]=useState(0);
  const previousError=useRef<string | undefined>(undefined);
  useEffect(()=>{
    const code=state.feedback?.representativeError?.code;
    if (state.feedback && !state.feedback.objectivePass && code) {
      const repeated=previousError.current===code;
      setFailures(count=>repeated ? count+1 : 1); previousError.current=code;
    }
  },[state.feedback]);
  const passed=state.progress[puzzle.id]?.objectivePass;
  const focus=puzzle.hints[Math.max(0,level-1)]?.focus;
  return <section className="card learning-panel" aria-label="도움과 설명"><h2>생각을 돕는 작은 힌트</h2><p>힌트를 보아도 다음 주문으로 갈 수 있어요.</p><div className="action-buttons"><button disabled={level===3} onClick={()=>{setLevel(value=>Math.min(3,value+1));dispatch({type:'SET_ASSISTANCE',assistance:'hinted'});}}>힌트 하나 더 보기</button><button disabled={active} onClick={()=>{
    dispatch({type:'EDIT_COMMAND',command:{type:'replaceEvents',events:exampleSolution(puzzle)},updatedAt:new Date().toISOString()});dispatch({type:'SET_ASSISTANCE',assistance:'solutionViewed'});setShowAnswer(true);
  }}>해답 보기</button></div>
    {puzzle.hints.slice(0,level).map(hint=><p key={hint.level}><strong>힌트 {hint.level}.</strong> {hint.text}</p>)}
    {focus && level>=2 && <p className="hint-focus">살펴볼 구간: {positionName(focus.startTick)}부터 {focus.endTick/480}박 끝까지</p>}
    {focus && level>0 && <><button disabled={active} onClick={()=>onPlay(exampleSolution(puzzle).filter(event=>event.startTick>=focus.startTick && event.startTick<focus.endTick),1)}>힌트 구간 듣기</button><p className="muted">같은 박 위치에서 해당 구간만 들려요. 조립판의 빠르기를 낮추면 천천히 들을 수 있어요.</p></>}
    {level===3 && <details><summary>이 구간 한 단계 시연 보기</summary><p>이 조각들로 해당 구간을 만들 수 있어요. 내 조립은 그대로 유지돼요.</p><RhythmDescription events={exampleSolution(puzzle).filter(event=>!focus || event.startTick>=focus.startTick && event.startTick<focus.endTick)}/></details>}
    {showAnswer && <p role="status">예시 해답을 적용했어요. {puzzle.expectedConcept} 기록에는 ‘해답 확인’으로 남겨요. 되돌리기로 이전 조립을 복구할 수 있어요.</p>}
    {failures>=3 && <button onClick={onTutorial}>처음 개념 시연 다시 보기</button>}
    {passed && <section className="explanation-panel" aria-label="개념 설명"><h3>{puzzle.explanation.prompt}</h3><div className="action-buttons">{puzzle.explanation.options.map(option=><button key={option.id} aria-pressed={explanation===option.id} onClick={()=>{setExplanation(option.id);if(option.id===puzzle.explanation.correctId)dispatch({type:'ACCEPT_EXPLANATION'});}}>{option.text}</button>)}</div>{explanation && <p role="status">{explanation===puzzle.explanation.correctId ? '맞아요. ' : '이론 통과는 그대로예요. 설명을 함께 살펴봐요. '}{puzzle.expectedConcept}</p>}<details onToggle={event=>{if(event.currentTarget.open)dispatch({type:'ACCEPT_EXPLANATION'});}}><summary>설명과 올바른 답 확인하기</summary><p>{puzzle.explanation.options.find(option=>option.id===puzzle.explanation.correctId)?.text}</p><p>{puzzle.expectedConcept}</p></details><p>설명 확인: {state.progress[puzzle.id]?.explanationReviewed ? '완료' : '아직 확인하지 않았어요'} · 이론: 통과</p></section>}
  </section>;
}
export function FreeComparison({document,active,onPlay}:{document:RhythmDocument;active:boolean;onPlay:(events:RhythmEvent[],count?:1)=>void}) {
  const [a,setA]=useState<RhythmEvent[]>();
  return <section className="free-comparison"><button disabled={active} onClick={()=>setA(structuredClone(document.events))}>현재 조립을 A로 보관하기</button>{a && <ComparePanel a={a} b={document.events} active={active} onPlay={onPlay}/>}</section>;
}
