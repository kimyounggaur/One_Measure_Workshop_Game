import type {SessionState} from '../app/machine';
import {analyzeCoverage} from '../domain/rhythm';
import {fullSignature} from '../domain/signatures';
import type {useAudioSession} from './useAudioSession';
export function PerformancePanel({state,audio,tutorial=false}:{state:SessionState;audio:ReturnType<typeof useAudioSession>;tutorial?:boolean}){
  const puzzle=state.editor.puzzle,accepted=puzzle?state.progress[puzzle.id]?.bestTheorySnapshot:undefined;
  const eligible=tutorial||(!puzzle?analyzeCoverage(state.editor.document.events).fullCoverage:!!accepted&&fullSignature(accepted.events)===fullSignature(state.editor.document.events));
  const performing=audio.active&&state.run?.purpose!=='preview',result=audio.tapResult;
  return <section className="card performance" aria-label="시작 박자 연습"><h2>시작 박자 연습</h2><p>길게 누를 필요 없어요. 소리가 새로 시작할 때 한 번씩 눌러요.</p>
    {!eligible&&<p>조립을 완성하고 조건을 확인하면 이 리듬으로 연습할 수 있어요.</p>}
    <p className="muted">{audio.profile&&!audio.profileStale?'내 입력 맞춤 적용 가능':'입력 맞춤 없음 또는 다시 확인 필요'} · {audio.status.clockMode==='anchorFallback'?'출력 시계 대안: 연습용 모드':'출력 시계 사용'} · 이론 통과와 별도로 살펴봐요.</p>
    <div className="action-buttons"><button disabled={!eligible||audio.active} onClick={()=>audio.beginPractice()}>직접 치기 시작</button><button disabled={!performing} onClick={audio.stop}>연습 정지</button></div>
    <button ref={audio.pad} className="tap-pad" aria-label="리듬 탭 패드" aria-disabled={!performing} type="button">{performing?'여기를 톡 · Space / Enter':'연습을 시작하면 여기를 눌러요'}</button>
    {performing&&<p role="status">{state.phase==='COUNT_IN'?'준비 네 박 · 곧 시작해요':state.run?.barComplete?'마지막 입력을 기다리고 있어요':'소리 시작에 맞추어 눌러요'}</p>}
    {state.phase==='INTERRUPTED'&&<p role="status">이번 연습은 중단되어 기록을 계산하지 않았어요. 이론 결과는 그대로예요.</p>}
    {result&&<div role="status"><h3>{tutorial?'연습했어요! 조립을 계속해 볼까요?':result.confidence==='notApplicable'?'이번 마디에는 눌러야 할 소리가 없어요.':`시작 ${result.targets}개 중 ${result.matched}개, 추가 입력 ${result.extras}번`}</h3>{!tutorial&&result.confidence!=='notApplicable'&&<><p>{result.confidence==='normal'?'입력 맞춤을 사용한 연습 결과':result.confidence==='invalidated'?'이번 기록은 계산하지 않았어요.':'기기와 입력의 영향을 포함하는 연습용 결과예요.'} · 쉬는 구간의 추가 입력 {result.extraInRest}번</p><details><summary>시작 시각 오차 자세히 보기</summary><ul>{audio.tapDetail?.pairs.map((p,i)=><li key={p.targetIndex}>{p.targetIndex+1}번째 시작: {audio.tapDetail?.categories[i]==='center'?'가까워요':p.errorMs<0?'조금 빨라요':'조금 늦어요'} ({p.errorMs.toFixed(1)}ms)</li>)}</ul><p>누르고 있던 길이를 평가한 결과가 아니에요.</p></details></>}<button onClick={audio.closeResult}>연습 결과 닫기</button></div>}
    {!tutorial&&<details><summary>내 입력 맞춤</summary><p>4분음표 80 BPM으로 네 번 준비한 뒤 열두 번 눌러요. 기기 지연만 따로 재는 기능은 아니에요.</p><label>사용하는 소리 출력 <select disabled={audio.active} value={audio.outputLabel} onChange={e=>{audio.setOutputLabel(e.target.value as typeof audio.outputLabel);audio.setProfileStale(true);}}><option value="speaker">내장 스피커</option><option value="wired">유선</option><option value="wireless">무선</option><option value="other">기타</option></select></label><div className="action-buttons"><button disabled={audio.active} onClick={()=>audio.beginPractice(true)}>내 입력 맞춤 시작</button><button disabled={audio.active} onClick={()=>audio.setProfileStale(true)}>출력 장치를 바꿨어요</button></div><p role="status">{audio.calibrationMessage}</p>{state.phase==='CALIBRATION_RESULT'&&<button onClick={audio.closeResult}>맞춤 결과 닫기</button>}</details>}
  </section>;
}
