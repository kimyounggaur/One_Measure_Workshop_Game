import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createEditor, executeCommand, type EditorCommand } from '../domain/commands';
import { createDocument, eventFromPalette, eventsFromTokens } from '../domain/rhythm';
import type { RhythmEvent } from '../domain/types';
import { RhythmStrip } from './Editor';

const titles = ['소리와 화면 켜기','한 박을 놓기','나누어 듣기','쉬는 시간','소리가 시작할 때'];
export function TutorialFlow({ onDone,onPlay,onStop,onEnableSound,active,message,practice }: {
  onDone:()=>void;onPlay:(events:RhythmEvent[])=>void;onStop:()=>void;onEnableSound:()=>Promise<boolean>;active:boolean;message:string;practice?:ReactNode;
}) {
  const [step,setStep] = useState(0);
  const [editor,setEditor] = useState(() => createEditor(createDocument([],'tutorial',80)));
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); },[step]);
  const edit = (command:EditorCommand) => setEditor(current => executeCommand(current,command).state);
  const advance = (next:number) => {
    onStop(); setStep(next);
    setEditor(createEditor(createDocument(next === 4 ? eventsFromTokens(['N2','N2','R2','N2'],'tutorial') : next === 2 || next === 3 ? eventsFromTokens(['N2'],'tutorial') : [],'tutorial',80)));
  };
  return <section className="card tutorial" aria-label="처음 배우기"><p className="eyebrow">처음 배우기 · {step+1} / 5</p><h1 ref={heading} tabIndex={-1}>{titles[step]}</h1>
    {step === 0 ? <><p>한 마디를 함께 만들어 볼까요? 소리를 사용하지 않아도 모든 조립 문제를 풀 수 있어요.</p><div className="action-buttons"><button className="primary" onClick={() => { advance(1); void onEnableSound(); }}>소리 켜고 시작</button><button onClick={() => advance(1)}>소리 없이 시작</button></div></> : <>
      <div className="bar-labels">{[1,2,3,4].map(beat=><span key={beat}>{beat}박</span>)}</div><div className="timeline"><RhythmStrip events={editor.document.events} /></div>
      {step === 1 && <><p>4분음표 하나는 <strong>1박 · 두 칸</strong>을 차지해요. 첫 박에 놓아 보세요.</p><button disabled={editor.document.events.length > 0} onClick={() => edit({type:'place',event:eventFromPalette('N2',0,'tutorial-note')})}>첫 박에 4분음표 놓기</button>{editor.document.events.length > 0 && <p role="status">음표 한 개가 두 칸을 차지해요.</p>}</>}
      {step === 2 && <><p>같은 한 박을 둘로 나누면 소리가 시작하는 횟수는 한 번에서 두 번으로 늘어요.</p><button disabled={editor.document.events.length !== 1 || active} onClick={() => edit({type:'splitAndRearticulate',id:editor.document.events[0].id})}>둘로 나누어 다시 치기</button><p role="status">총 길이 1박 · 소리 시작 {editor.document.events.length}번</p><button disabled={active} onClick={() => onPlay(eventsFromTokens(['N2'],'before'))}>나누기 전 듣기</button></>}
      {step === 3 && <><p>쉼표는 정해진 시간 동안 쉬는 조각이에요. 빈칸은 아직 무엇을 할지 정하지 않은 시간이에요.</p><div className="action-buttons"><button disabled={active || editor.document.events.length === 0 || editor.document.events[0].kind === 'rest'} onClick={() => edit({type:'replaceKind',id:editor.document.events[0].id,kind:'rest'})}>첫 박을 쉼표로 바꾸기</button><button disabled={active || editor.document.events.length === 0} onClick={() => edit({type:'clear'})}>지워서 빈칸과 비교하기</button><button disabled={active} onClick={() => setEditor(createEditor(createDocument(eventsFromTokens(['N2'],'tutorial'),'tutorial',80)))}>다시 비교하기</button></div><p role="status">{editor.document.events.length === 0 ? '첫 박은 미입력: 아직 정하지 않았어요.' : editor.document.events[0].kind === 'rest' ? '첫 박은 의도한 쉼: 길이는 그대로 한 박이에요.' : '첫 박은 소리 한 박이에요.'}</p></>}
      {step === 4 && <><p><strong>시작 박자 연습: 길게 누를 필요 없어요.</strong> 1박, 2박, 4박에서 소리가 새로 시작해요. 세 번째 박은 쉬어요.</p><p>직접 치기는 선택 사항이에요. 조립의 이론 결과와 따로 살펴봐요.</p>{practice}</>}
      <div className="action-buttons"><button disabled={active} onClick={() => onPlay(editor.document.events)}>이 예제 듣기</button><button disabled={!active} onClick={onStop}>예제 정지</button></div><p className="muted" role="status">{message}</p>
      {step < 4 ? <button className="primary" onClick={() => advance(step+1)}>다음 시연</button> : <button className="primary" onClick={onDone}>조립 시작하기</button>}
    </>}
    <div className="action-buttons"><button onClick={onDone}>{step === 4 ? '건너뛰고 조립 계속' : '나중에 보기'}</button>{step > 0 && <button onClick={() => advance(0)}>처음부터 다시 보기</button>}</div>
  </section>;
}
