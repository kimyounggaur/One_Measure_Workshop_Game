import { useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react';
import { PALETTE, eventFromPalette, paletteId } from '../domain/rhythm';
import type { PaletteId, RhythmEvent } from '../domain/types';
import type { EditorCommand } from '../domain/commands';
import type { SessionState } from '../app/machine';
import type { SessionIntent } from '../app/sessionReducer';
import { selectCanEdit, selectCanRedo, selectCanUndo, selectCoverage, selectEventList } from '../app/selectors';

const glyphNames: Record<PaletteId, string> = { N1: 'note-eighth', N2: 'note-quarter', N4: 'note-half', N8: 'note-whole', R1: 'rest-eighth', R2: 'rest-quarter', R4: 'rest-half', R8: 'rest-whole' };
export const beats = (ticks: number) => ticks / 480;
export const positionName = (tick: number) => `${Math.floor(tick / 480) + 1}박 ${tick % 480 === 0 ? '앞' : '뒤 반 박'}`;
export function Glyph({ token }: { token: PaletteId }) { return <img className="glyph" src={`/assets/notation/${glyphNames[token]}.svg`} alt="" aria-hidden="true" draggable={false} />; }
export function Icon({ name }: { name: string }) { return <img className="icon" src={`/assets/controls/control-${name}.svg`} alt="" aria-hidden="true" />; }
export function RhythmStrip({ events, selectedId, ghost = false }: { events: RhythmEvent[]; selectedId?: string; ghost?: boolean }) {
  return <div className={`rhythm-strip ${ghost ? 'ghost-strip' : ''}`} aria-hidden="true">
    {Array.from({ length: 8 }, (_, i) => <span key={i} className="empty-slot" style={{ left: `${i * 12.5}%`, width: '12.5%' }} />)}
    {events.map(event => <div key={event.id} data-event-id={event.id} className={`rhythm-piece ${event.kind} ${selectedId === event.id ? 'selected' : ''} ${event.locked ? 'locked' : ''}`} style={{ left: `${event.startTick / 19.2}%`, width: `${event.durationTick / 19.2}%` }}>
      <span className="onset-mark">{event.kind === 'note' ? '●' : '／'}</span><Glyph token={paletteId(event)} /><span className="piece-duration">{beats(event.durationTick)}박</span>{event.locked && <span className="lock-mark">🔒</span>}
    </div>)}
  </div>;
}
export function Editor({ state, dispatch, onSubmit, children, playbackTick }: { state: SessionState; dispatch: Dispatch<SessionIntent>; onSubmit: () => void; children?: ReactNode; playbackTick?: number }) {
  const { document: doc, puzzle } = state.editor;
  const allowed: PaletteId[] = puzzle?.palette ?? ['N1','N2','N4','N8','R1','R2','R4','R8'];
  const [tool, setTool] = useState<PaletteId>(allowed.includes('N2') ? 'N2' : allowed[0]);
  const [kind, setKind] = useState<'note' | 'rest'>(PALETTE[tool].kind);
  const [beat, setBeat] = useState(0);
  const [gridFocus, setGridFocus] = useState(0);
  const [moving, setMoving] = useState(false);
  const [confirmPlacement, setConfirmPlacement] = useState(false);
  const [notice, setNotice] = useState('');
  const gridButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const canEdit = selectCanEdit(state);
  const coverage = selectCoverage(state.editor);
  const previousRevision = useRef(doc.revision);
  useEffect(() => {
    if (doc.revision !== previousRevision.current) setNotice(`변경했어요. 채운 길이 ${beats(coverage.soundingTicks + coverage.restTicks)}박, 소리 시작 ${doc.events.filter(event => event.kind === 'note').length}번.`);
    previousRevision.current = doc.revision;
  }, [doc.revision, coverage.soundingTicks, coverage.restTicks, doc.events]);
  const selected = doc.events.find(event => event.id === state.selectedEventId);
  const locked = !!selected && !!puzzle?.initialEvents.some(event => event.id === selected.id && event.locked);
  const command = (value: EditorCommand, preview = false) => {
    dispatch(preview ? { type: 'PREVIEW_COMMAND', command: value } : { type: 'EDIT_COMMAND', command: value, updatedAt: new Date().toISOString() });
    setNotice(preview ? '적용할 배치를 미리 보여드려요.' : '');
  };
  const choosePosition = (index: number) => {
    if (!canEdit) return;
    const tick = index * 240;
    if (moving && selected) { command({ type: 'move', id: selected.id, startTick: tick }, confirmPlacement); setMoving(false); return; }
    const existing = doc.events.find(event => event.startTick <= tick && event.startTick + event.durationTick > tick);
    if (existing) { dispatch({ type: 'SELECT_EVENT', id: existing.id }); setNotice(`${PALETTE[paletteId(existing)].name} 선택. 지속 구간을 눌러도 새 소리가 생기지 않아요.`); return; }
    command({ type: 'place', event: eventFromPalette(tool, tick, crypto.randomUUID()) }, confirmPlacement);
  };
  const minBpm = puzzle?.tempo.minBpm ?? 40;
  const maxBpm = puzzle?.tempo.maxBpm ?? 140;
  const setTempo = (bpm: number) => { if (Number.isInteger(bpm) && bpm >= minBpm && bpm <= maxBpm) command({ type: 'setTempo', bpm }); };
  const nextRest = selected?.kind === 'rest' ? doc.events.find(event => event.kind === 'rest' && event.startTick === selected.startTick + selected.durationTick) : undefined;
  return <div className="editor-layout" onKeyDown={event => {
    if ((event.target as HTMLElement).closest('input,select,textarea,[contenteditable]')) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); command({ type: event.shiftKey ? 'redo' : 'undo' }); }
    if (event.key === 'Delete' && selected && !locked) { event.preventDefault(); command({ type: 'delete', id: selected.id }); }
    if (event.key === 'Escape') { dispatch({ type: 'CANCEL_GHOST' }); setMoving(false); }
  }}>
    <section className="card workbench" aria-label="한 마디 조립판">
      <div className="tempo-row"><span className="meter" aria-label="4분의 4박자">4/4</span><div><strong>한 마디, 네 박</strong><p className="muted">소리와 쉼으로 빈칸을 채워요</p></div>
        <div className="number-control"><label htmlFor="tempo">빠르기</label><button aria-label="빠르기 1 BPM 줄이기" disabled={!canEdit || doc.tempo.bpm <= minBpm} onClick={() => setTempo(doc.tempo.bpm-1)}>−</button><input id="tempo" aria-label="빠르기 BPM" type="number" min={minBpm} max={maxBpm} value={doc.tempo.bpm} disabled={!canEdit} onChange={e => setTempo(Number(e.target.value))} /><span>BPM</span><button aria-label="빠르기 1 BPM 늘리기" disabled={!canEdit || doc.tempo.bpm >= maxBpm} onClick={() => setTempo(doc.tempo.bpm+1)}>+</button></div>
      </div>
      <div className="bar-labels">{[1,2,3,4].map(n => <span key={n}>{n}박</span>)}</div>
      <div className="subdivision-labels" aria-label="반 박 세기">{['1','&','2','&','3','&','4','&'].map((text,i) => <span key={i}>{text}</span>)}</div>
      <div className="timeline" role="grid" aria-label="한 마디 위치 격자. 방향키로 이동하고 Enter로 선택" onPointerCancel={() => dispatch({ type: 'POINTER_CANCEL' })}>
        <RhythmStrip events={doc.events} selectedId={selected?.id} />{state.ghost && <RhythmStrip events={state.ghost.document.events} ghost />}
        {playbackTick !== undefined && <span className="playback-cursor" style={{ left: `${Math.min(1920,Math.max(0,playbackTick))/19.2}%` }} aria-hidden="true" />}
        <div className="timeline-hit-row" role="row">{Array.from({ length: 8 }, (_, i) => {
          const existing = doc.events.find(event => event.startTick <= i * 240 && event.startTick + event.durationTick > i * 240);
          const detail = !existing ? '미입력' : existing.kind === 'rest' ? '의도한 쉼' : existing.startTick === i * 240 ? '소리 시작' : '앞 음의 지속 구간';
          return <button key={i} ref={el => { gridButtons.current[i] = el; }} role="gridcell" className="timeline-hit" tabIndex={gridFocus === i ? 0 : -1} aria-label={`${positionName(i * 240)}, ${detail}`} disabled={!canEdit} style={{ left: `${i * 12.5}%`, width: '12.5%' }} onClick={() => choosePosition(i)} onFocus={() => setGridFocus(i)} onKeyDown={e => {
            let next = i;
            if (e.key === 'ArrowRight') next = Math.min(7,i+1); else if (e.key === 'ArrowLeft') next = Math.max(0,i-1); else if (e.key === 'Home') next = 0; else if (e.key === 'End') next = 7; else return;
            e.preventDefault(); gridButtons.current[next]?.focus();
          }} />;
        })}</div>
      </div>
      <p className="length-summary" data-testid="coverage">채운 길이 <strong>{beats(coverage.soundingTicks + coverage.restTicks)} / 4박</strong><span>소리 {beats(coverage.soundingTicks)}박 · 쉼 {beats(coverage.restTicks)}박 · 미입력 {beats(coverage.unknownTicks)}박 · 소리 시작 {doc.events.filter(event => event.kind === 'note').length}번</span></p>
      <div className="history-row"><button disabled={!canEdit || !selectCanUndo(state.editor)} onClick={() => command({ type: 'undo' })}><Icon name="undo" />되돌리기</button><button disabled={!canEdit || !selectCanRedo(state.editor)} onClick={() => command({ type: 'redo' })}><Icon name="redo" />다시 하기</button><button disabled={!canEdit || doc.events.length === 0} onClick={() => command({ type: 'clear' })}>비우기</button></div>
      <div className="position-picker"><h3>놓을 위치 고르기</h3><p className="muted">박을 고른 다음 앞이나 뒤 반 박을 누르세요.</p><div className="beat-buttons">{[0,1,2,3].map(i => <button key={i} aria-pressed={beat === i} onClick={() => setBeat(i)}>{i+1}박 선택</button>)}</div><div className="half-buttons"><button disabled={!canEdit} onClick={() => choosePosition(beat*2)}>앞 반 박 선택</button><button disabled={!canEdit} onClick={() => choosePosition(beat*2+1)}>뒤 반 박 선택</button></div></div>
      {selected && <section className="selection-panel" aria-label="선택한 조각"><h3>{positionName(selected.startTick)} · {PALETTE[paletteId(selected)].name}{locked ? ' · 잠김' : ''}</h3><p>{beats(selected.durationTick)}박 지속 · {selected.kind === 'note' ? '시작점에서 한 번 소리 남' : '이 길이만큼 의도적으로 쉼'}</p><div className="action-buttons">
        <button disabled={!canEdit || locked} aria-pressed={moving} onClick={() => { setMoving(!moving); setNotice('옮길 박과 반 박을 선택하세요.'); }}>위치 옮기기</button>
        <button disabled={!canEdit || locked} onClick={() => command({ type: 'delete', id: selected.id })}>조각 삭제</button>
        <button disabled={!canEdit || locked || selected.durationTick === 240 || !allowed.includes((`${selected.kind === 'note' ? 'N' : 'R'}${selected.durationTick/480}`) as PaletteId)} onClick={() => command({ type: 'splitAndRearticulate', id: selected.id })}>{selected.kind === 'note' ? '두 소리로 나누기' : '쉼 둘로 나누기'}</button>
        <button disabled={!canEdit || locked || !allowed.includes(`${selected.kind === 'note' ? 'R' : 'N'}${selected.durationTick/240}` as PaletteId)} onClick={() => command({ type: 'replaceKind', id: selected.id, kind: selected.kind === 'note' ? 'rest' : 'note' })}>{selected.kind === 'note' ? '쉼으로 바꾸기' : '소리로 바꾸기'}</button>
        {nextRest && <button disabled={!canEdit || locked} onClick={() => command({ type: 'mergeAdjacentRests', ids: [selected.id, nextRest.id] })}>옆 쉼과 합치기</button>}
      </div><details><summary>길이 바꾸기</summary><div className="action-buttons">{allowed.filter(id => PALETTE[id].kind === selected.kind).map(id => <button key={id} disabled={!canEdit || locked} onClick={() => command({ type: 'resize', id: selected.id, durationTick: PALETTE[id].durationTick })}>{PALETTE[id].name}</button>)}</div></details></section>}
      <details className="event-list"><summary>목록으로 조립하기</summary><p className="muted">모든 조각과 빈칸을 큰 버튼으로 고를 수 있어요.</p>{selectEventList(state.editor).map(({event,label,locked: itemLocked}) => <button key={event.id} disabled={!canEdit} aria-pressed={selected?.id === event.id} onClick={() => dispatch({ type:'SELECT_EVENT',id:event.id })}>{label}{itemLocked ? ' · 잠김' : ''}</button>)}{coverage.gaps.map(gap => <button key={gap.startTick} disabled={!canEdit} onClick={() => choosePosition(gap.startTick/240)}>{positionName(gap.startTick)} 빈칸에 {PALETTE[tool].name} 놓기</button>)}</details>
      <label className="check-label"><input type="checkbox" checked={confirmPlacement} onChange={e => setConfirmPlacement(e.target.checked)} />놓기 전에 미리 확인하기</label>
      {state.ghost && <div className="confirmation"><p>미리보기예요. 적용하면 한 번의 변경으로 기록돼요.</p><button className="primary" onClick={() => dispatch({ type:'COMMIT_GHOST',updatedAt:new Date().toISOString() })}>배치 적용</button><button onClick={() => dispatch({ type:'CANCEL_GHOST' })}>취소</button></div>}
      <p className={`live-message ${state.error ? 'error' : ''}`} role="status" aria-live="polite">{state.error?.message ?? notice}</p>
    </section>
    <aside className="card palette-panel" aria-label="음표와 쉼표 도구"><p className="eyebrow">리듬 재료</p><h2>어떤 조각을 놓을까요?</h2><div className="palette-tabs"><button aria-pressed={kind === 'note'} onClick={() => setKind('note')}>소리</button><button aria-pressed={kind === 'rest'} onClick={() => setKind('rest')}>쉼</button></div><div className="palette-grid">{allowed.filter(id => PALETTE[id].kind === kind).map(id => <button className={`palette-piece ${PALETTE[id].kind}`} data-testid={`tool-${id}`} key={id} aria-pressed={tool === id} disabled={!canEdit} onClick={() => { setTool(id); setNotice(PALETTE[id].name + ' 선택, ' + PALETTE[id].durationTick/480 + '박, ' + PALETTE[id].durationTick/240 + '칸. 놓을 위치를 골라 주세요.'); dispatch({ type:'SELECT_EVENT' }); setMoving(false); }}><Glyph token={id} /><strong>{PALETTE[id].name}</strong><span>{beats(PALETTE[id].durationTick)}박 · {PALETTE[id].durationTick/240}칸</span></button>)}</div>{allowed.filter(id => PALETTE[id].kind === kind).length === 0 && <p>이번 주문에는 이 종류의 조각이 없어요.</p>}<p className="selected-tool">선택한 조각: <strong>{PALETTE[tool].name}</strong></p>
      {!puzzle && <button className="full-width" disabled={!canEdit || coverage.unknownTicks === 0} onClick={() => command({ type:'fillGapsWithRests' },true)}>빈칸을 쉼으로 채우기</button>}
      <div className="theory-note"><strong>빈칸과 쉼은 달라요</strong><p>점선 빈칸은 아직 정하지 않은 시간이에요. 쉼표를 놓아야 의도한 쉼이 됩니다.</p><p>긴 음표는 길게 이어지는 한 소리예요. 격자를 지나도 새로 소리가 나지 않아요.</p></div>
    </aside>
    <div className="transport card">{children}<button className="primary" disabled={!canEdit} onClick={onSubmit}><Icon name="check" />{puzzle ? '조건 확인하기' : '한 마디 확인하기'}</button></div>
  </div>;
}
