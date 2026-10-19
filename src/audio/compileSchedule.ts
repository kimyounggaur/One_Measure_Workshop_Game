import { DomainError } from '../domain/errors';
import { barLengthTicks } from '../domain/meter';
import { analyzeCoverage } from '../domain/rhythm';
import { PPQ, ticksToSeconds } from '../domain/time';
import { assertOnlyKeys, isRecord, parseDocument } from '../domain/validation';
import type { AudioRunRequest, AudioSchedule, AudioStartOptions, ScheduledClick, ScheduledNote } from './types';

/** MVP count-in uses four quarter notes, independently of UI timing. */
export const COUNT_IN_BEATS = 4 as const;

/** Pure absolute timeline; never mutates the supplied run snapshot. */
export function compileSchedule(request: AudioRunRequest, countInStartSec: number, options: AudioStartOptions = {}): AudioSchedule {
  if (!isRecord(request) || typeof request.runId !== 'string' || !request.runId.trim() || !Number.isSafeInteger(request.documentRevision) || request.documentRevision < 0) {
    throw new DomainError('E_SCHEMA', 'Audio run identity must contain a run id and nonnegative document revision.');
  }
  if (request.purpose !== 'preview' && request.purpose !== 'performance') {
    throw new DomainError('E_SCHEMA', 'Only preview and performance schedules are supported; calibration has a separate timeline.');
  }
  if (!Number.isFinite(countInStartSec) || countInStartSec < 0) throw new RangeError('Count-in start must be finite and nonnegative.');
  if (!isRecord(options)) throw new TypeError('Audio options must be an object.');
  assertOnlyKeys(options, ['loops', 'metronome']);
  if (options.loops !== undefined && options.loops !== 1 && options.loops !== 2 && options.loops !== 4) throw new RangeError('Preview loops must be 1, 2, or 4.');
  if (options.metronome !== undefined && typeof options.metronome !== 'boolean') throw new TypeError('Metronome must be a boolean.');
  const loops = options.loops ?? 1;
  if (request.purpose === 'performance' && loops !== 1) throw new RangeError('Performance must play exactly one bar.');

  const document = parseDocument(request.snapshot);
  if (request.documentRevision !== document.revision) throw new DomainError('E_SCHEMA', 'Audio run revision must match its snapshot.');
  const barTicks = barLengthTicks(document.meter);
  const quarterDurationSec = ticksToSeconds(PPQ, document.tempo);
  const countInDurationSec = COUNT_IN_BEATS * quarterDurationSec;
  const barDurationSec = ticksToSeconds(barTicks, document.tempo);
  const barStartSec = countInStartSec + countInDurationSec;
  const barEndSec = barStartSec + loops * barDurationSec;
  // Reject times whose magnitude cannot preserve even an eighth-note position.
  if (!Number.isFinite(barEndSec) || countInStartSec + quarterDurationSec / 2 === countInStartSec || barStartSec + quarterDurationSec / 2 === barStartSec) {
    throw new RangeError('Audio times cannot represent the schedule precisely.');
  }
  const notes: ScheduledNote[] = [];
  const clicks: ScheduledClick[] = Array.from({ length: COUNT_IN_BEATS }, (_, beatIndex) => ({
    startSec: countInStartSec + beatIndex * quarterDurationSec,
    accented: beatIndex === 0,
    countIn: true,
  }));
  const orderedEvents = [...document.events].sort((a, b) => a.startTick - b.startTick);
  for (let loopIndex = 0; loopIndex < loops; loopIndex++) {
    const loopStartSec = barStartSec + loopIndex * barDurationSec;
    for (const event of orderedEvents) {
      if (event.kind !== 'note') continue;
      notes.push({
        startSec: loopStartSec + ticksToSeconds(event.startTick, document.tempo),
        endSec: loopStartSec + ticksToSeconds(event.startTick + event.durationTick, document.tempo),
        startTick: event.startTick,
        durationTick: event.durationTick,
        loopIndex,
      });
    }
    if (options.metronome) {
      for (let beatIndex = 0; beatIndex < COUNT_IN_BEATS; beatIndex++) clicks.push({
        startSec: loopStartSec + beatIndex * quarterDurationSec,
        accented: beatIndex === 0,
        countIn: false,
      });
    }
  }
  return Object.freeze({
    countInStartSec, countInDurationSec, barStartSec, barEndSec, barDurationSec, quarterDurationSec, loops,
    notes: Object.freeze(notes.map(note => Object.freeze(note))),
    clicks: Object.freeze(clicks.map(click => Object.freeze(click))),
    // Unknown is a property of one document bar, not a multiplied rest duration.
    unknownTicks: analyzeCoverage(document.events, barTicks).unknownTicks,
  });
}
