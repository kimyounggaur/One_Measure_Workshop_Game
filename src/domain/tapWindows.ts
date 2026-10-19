import { onsetSignature } from './signatures';
import type { RhythmDocument } from './types';
export const GRADING_VERSION = '1.0.0';
export const deriveTapTargets = (snapshot: RhythmDocument): number[] => onsetSignature(snapshot.events);
export function assertTargets(targets: readonly number[], maximum = 8): void {
  if (targets.length > maximum || targets.some((v,i)=>!Number.isFinite(v)||(i>0&&v<=targets[i-1]))) throw new Error('Invalid target sequence');
}
export function computeTapWindows(targets: readonly number[], barDurationMs: number) {
  assertTargets(targets);
  if (!Number.isFinite(barDurationMs)||barDurationMs<=0) throw new Error('Invalid bar duration');
  if (!targets.length) return {applicable:false as const};
  const minIOIMs=targets.length===1?barDurationMs:Math.min(...targets.slice(1).map((v,i)=>v-targets[i]));
  const WMs=Math.min(160,.45*minIOIMs);
  return {applicable:true as const,minIOIMs,WMs,GMs:Math.min(55,.5*WMs)};
}
export function computeInputBounds(barStartMs:number,barEndMs:number,WMs:number,offsetMs:number) {
  if (![barStartMs,barEndMs,WMs,offsetMs].every(Number.isFinite)||barEndMs<=barStartMs||WMs<0||Math.abs(offsetMs)>250) throw new Error('Invalid input window');
  const correctedOpenMs=barStartMs-WMs,correctedCloseMs=barEndMs+WMs;
  return {correctedOpenMs,correctedCloseMs,rawOpenMs:correctedOpenMs+offsetMs,rawCloseMs:correctedCloseMs+offsetMs,finalizeMs:Math.max(barEndMs,correctedCloseMs+offsetMs)};
}
