import { Icon } from './Editor';

export type TransportPosition = { phase: 'idle' | 'countIn' | 'bar'; tick: number; countInBeat?: number; loopIndex: number };
export function AudioTransport({ active, preparing, loops, onLoops, metronome, onMetronome, onPlay, onStop, message, position, hasGaps }: {
  active: boolean; preparing: boolean; loops: 1 | 2 | 4; onLoops: (loops: 1 | 2 | 4) => void;
  metronome: boolean; onMetronome: (enabled: boolean) => void;
  onPlay: () => void; onStop: () => void; message: string; position: TransportPosition; hasGaps: boolean;
}) {
  return <section className="audio-transport" aria-label="리듬 듣기">
    <div className="action-buttons"><button onClick={onPlay} disabled={active}><Icon name="play" />{preparing ? '소리 준비 중' : '내 리듬 듣기'}</button><button onClick={onStop} disabled={!active}><Icon name="stop" />정지</button></div>
    <div className="audio-options"><label>미리 듣기 횟수 <select aria-label="미리 듣기 횟수" value={loops} disabled={active} onChange={e => onLoops(Number(e.target.value) as 1|2|4)}><option value="1">1회</option><option value="2">2회</option><option value="4">4회</option></select></label><label className="check-label"><input type="checkbox" checked={metronome} disabled={active} onChange={e => onMetronome(e.target.checked)} />재생 중 박자 소리</label></div>
    <p className="audio-state" role="status">{message}</p>
    {active && <p className="count-in-display" aria-hidden="true">{position.phase === 'countIn' ? `준비 ${position.countInBeat ?? '…'} / 4` : position.phase === 'bar' ? `${Math.min(4,Math.floor(position.tick/480)+1)}박 · ${position.loopIndex+1}번째 마디` : '소리를 준비하고 있어요'}</p>}
    {hasGaps && <p className="muted">빈칸은 아직 결정하지 않은 시간이에요. 미리 들을 때는 소리가 나지 않지만, 쉼표가 놓인 것은 아니에요.</p>}
  </section>;
}
