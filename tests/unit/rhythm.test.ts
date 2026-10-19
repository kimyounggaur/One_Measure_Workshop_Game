import { describe, expect, it } from 'vitest';
import { analyzeCoverage, canonicalize, createDocument, eventFromPalette, eventsFromTokens, inventory } from '../../src/domain/rhythm';
import { fullSignature, onsetSignature, silenceSignature } from '../../src/domain/signatures';
import { validateDocument, validateEvents } from '../../src/domain/validation';
import type { PaletteId } from '../../src/domain/types';

describe('S03 semantics, source notation and runtime validation', () => {
  it('U01/U02 preserves each sounding onset', () => {
    const quarters = eventsFromTokens(['N2', 'N2', 'N2', 'N2']);
    expect(analyzeCoverage(quarters)).toMatchObject({ soundingTicks: 1920, restTicks: 0, unknownTicks: 0, fullCoverage: true });
    expect(onsetSignature(quarters)).toEqual([0, 480, 960, 1440]);
    expect(onsetSignature(eventsFromTokens(['N4', 'N2', 'N2']))).toEqual([0, 960, 1440]);
  });
  it('U03/U04/B01 distinguishes explicit silence from unknown gaps', () => {
    const original = eventsFromTokens(['N2', 'N2', 'R2', 'N2']);
    expect(silenceSignature(original)).toEqual([{ startTick: 960, endTick: 1440 }]);
    expect(onsetSignature(original)).toHaveLength(3);
    const gap = original.filter(event => event.kind === 'note');
    const before = structuredClone(gap);
    expect(analyzeCoverage(gap)).toMatchObject({ soundingTicks: 1440, restTicks: 0, unknownTicks: 480, gaps: [{ startTick: 960, endTick: 1440 }] });
    expect(validateEvents(gap).ok).toBe(true);
    expect(validateEvents(gap, { requireFullCoverage: true }).diagnostics[0].code).toBe('E_GAP');
    expect(gap).toEqual(before);
    expect(analyzeCoverage(eventsFromTokens(['N2', 'N2', 'N2'])).gaps).toEqual([{ startTick: 1440, endTick: 1920 }]);
  });
  it('U05–U07 uses half-open spans with bounds before overlap', () => {
    expect(validateEvents(eventsFromTokens(['N2', 'N2'])).ok).toBe(true);
    expect(validateEvents([eventFromPalette('N2', 0, 'a'), eventFromPalette('N2', 240, 'b')]).diagnostics.map(d => d.code)).toEqual(['E_OVERLAP']);
    expect(validateEvents([eventFromPalette('N2', 1680, 'a')]).diagnostics.map(d => d.code)).toEqual(['E_OVERFLOW']);
    expect(validateEvents([eventFromPalette('N2', 1680, 'a'), eventFromPalette('N1', 1680, 'b')]).diagnostics.map(d => d.code)).toEqual(['E_OVERFLOW', 'E_OVERLAP']);
  });
  it('U08/U09/U17/B17/B18 rejects malformed source and unsupported features as content errors', () => {
    const note = eventFromPalette('N2', 0, 'a');
    const invalid = [
      [{ ...note, durationTick: 0 }], [{ ...note, durationTick: -240 }], [{ ...note, durationTick: NaN }],
      [{ ...note, startTick: .5 }], [{ ...note, startTick: -240 }], [note, note],
      [{ ...note, sourceValue: { num: 1, den: 8 } }], [{ ...note, sourceValue: { num: 2, den: 8 } }],
      [{ ...note, tieNextId: 'b' }], [{ ...note, kind: 'rest' }], [{ ...note, pitch: undefined }],
      Array.from({ length: 9 }, (_, i) => eventFromPalette('N1', i * 240, `e${i}`)),
    ];
    for (const events of invalid) {
      const result = validateEvents(events);
      expect(result.ok).toBe(false);
      expect(result.contentError).toBe(true);
      expect(result.diagnostics[0].code).toBe('E_SCHEMA');
    }
  });
  it('U10/B14/F07 canonical rest merge is independent of source inventory', () => {
    const split = eventsFromTokens(['R1', 'R1']);
    const whole = eventsFromTokens(['R2']);
    expect(fullSignature(split)).toBe(fullSignature(whole));
    expect(inventory(split)).not.toEqual(inventory(whole));
    expect(split).toHaveLength(2);
    expect(canonicalize(eventsFromTokens(['R1', 'R2']))).toEqual([{ kind: 'rest', startTick: 0, durationTick: 720 }]);
  });
  it('U11/U12/B15/B16 maintains rearticulation and sustain independently', () => {
    const long = eventsFromTokens(['N2']);
    const split = eventsFromTokens(['N1', 'N1']);
    const short = eventsFromTokens(['N1', 'R1']);
    expect(fullSignature(split)).not.toBe(fullSignature(long));
    expect(onsetSignature(short)).toEqual(onsetSignature(long));
    expect(fullSignature(short)).not.toBe(fullSignature(long));
  });
  it('U15/B11 prevents the L6 onset-only false positive', () => {
    const correct = eventsFromTokens(['R1', 'N1', 'N2', 'N1', 'R1', 'N2']);
    const incorrect = eventsFromTokens(['R1', 'N1', 'N2', 'N2', 'N2']);
    expect(onsetSignature(correct)).toEqual(onsetSignature(incorrect));
    expect(fullSignature(correct)).not.toBe(fullSignature(incorrect));
  });
  it('property: array order, ids, and canonicalization count do not change meaning', () => {
    const tokens: PaletteId[] = ['N1', 'R1', 'N2', 'R2'];
    for (const a of tokens) for (const b of tokens) for (const c of tokens) {
      const events = eventsFromTokens([a, b, c]);
      const before = structuredClone(events);
      const reversed = [...events].reverse().map((event, i) => ({ ...event, id: `changed-${i}` }));
      expect(fullSignature(reversed)).toBe(fullSignature(events));
      expect(canonicalize(canonicalize(events))).toEqual(canonicalize(events));
      const coverage = analyzeCoverage(events);
      expect(coverage.soundingTicks + coverage.restTicks + coverage.unknownTicks).toBe(1920);
      expect(events).toEqual(before);
    }
  });
  it('document storage rejects future meter, excessive title, and invalid timestamp; serialize roundtrip preserves semantics', () => {
    const doc = createDocument(eventsFromTokens(['R8']));
    expect(validateDocument(doc).ok).toBe(true);
    expect(fullSignature(validateDocument(JSON.parse(JSON.stringify(doc))).value!.events)).toBe(fullSignature(doc.events));
    expect(validateDocument({ ...doc, meter: { numerator: 3, denominator: 4, groupUnits: [1, 1, 1] } }).contentError).toBe(true);
    expect(validateDocument({ ...doc, title: 'a'.repeat(41) }).contentError).toBe(true);
    expect(validateDocument({ ...doc, createdAt: 'invalid' }).contentError).toBe(true);
  });
});
