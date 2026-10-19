import { canonicalize } from './rhythm';
import type { SemanticEvent, Span } from './types';

export function fullSignature(events: readonly SemanticEvent[]): string {
  return JSON.stringify(canonicalize(events).map(event => [event.kind, event.startTick, event.durationTick, ...(event.kind === 'note' ? [event.pitch] : [])]));
}
export function onsetSignature(events: readonly SemanticEvent[]): number[] {
  return canonicalize(events).filter(event => event.kind === 'note').map(event => event.startTick);
}
export function silenceSignature(events: readonly SemanticEvent[]): Span[] {
  return canonicalize(events).filter(event => event.kind === 'rest').map(event => ({ startTick: event.startTick, endTick: event.startTick + event.durationTick }));
}
export function semanticallyEqual(a: readonly SemanticEvent[], b: readonly SemanticEvent[]): boolean {
  return fullSignature(a) === fullSignature(b);
}
