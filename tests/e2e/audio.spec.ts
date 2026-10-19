import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
import type * as AudioHarness from '../fixtures/audio-browser';

declare global {
  interface Window { AudioHarness: typeof AudioHarness }
}

let harnessCode: string;
test.beforeAll(async () => {
  const bundled = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: resolve('tests/fixtures/audio-browser.ts'), name: 'AudioHarness', formats: ['iife'] },
    },
  });
  if ('on' in bundled) throw new Error('Expected a one-time in-memory harness bundle.');
  const outputs = Array.isArray(bundled) ? bundled.flatMap(output => output.output) : bundled.output;
  const chunk = outputs.find(output => output.type === 'chunk');
  if (!chunk || chunk.type !== 'chunk') throw new Error('Audio harness bundle is missing.');
  harnessCode = chunk.code;
});

async function setup(page: Page) {
  await page.goto('/');
  await page.addScriptTag({ content: harnessCode });
}
async function evidence(info: TestInfo, name: string, result: unknown) {
  const body = JSON.stringify({ evidence: 'Chrome OfflineAudioContext rendering; no human listening or physical-device test', ...result as Record<string, unknown> }, null, 2);
  await mkdir(resolve('output/playwright'), { recursive: true });
  await writeFile(resolve(`output/playwright/s07-${name}.json`), body, 'utf8');
  await info.attach(name, { body, contentType: 'application/json' });
}
type PatternResult = Awaited<ReturnType<typeof AudioHarness.renderPattern>>;
function expectHealthy(result: PatternResult) {
  expect(result.whole.finite).toBe(true);
  expect(result.whole.peak).toBeLessThan(1);
  expect(result.activeSourcesAfterRendering).toBe(0);
  expect(result.disposedBeforeRendering + result.naturallyDisposed).toBe(result.sourcesCreated);
  expect(result.excludedBoundarySamples).toBe(2);
  for (const probe of result.probes) {
    expect(probe.sampleCount).toBeGreaterThan(0);
    expect(probe.finite).toBe(true);
  }
}

for (const sampleRate of [44100, 48000]) {
  test(`S07 actual note bus L3 silence, semantic release, all-rest, unknown at ${sampleRate} Hz`, async ({ page }, info) => {
    await setup(page);
    const results = await page.evaluate(async rate => {
      const harness = window.AudioHarness;
      return {
        l3: await harness.renderPattern({ tokens: ['N2', 'N2', 'R2', 'N2'], sampleRate: rate, windows: [
          { name: 'firstNote', startSec: 3.02, endSec: 3.7 },
          { name: 'rest', startSec: 4.5, endSec: 5.25 },
          { name: 'postBar', startSec: 6, endSec: 6.09 },
        ], points: [4.5, 6] }),
        allRest: await harness.renderPattern({ tokens: ['R8'], sampleRate: rate }),
        unknown: await harness.renderPattern({ tokens: ['N1'], sampleRate: rate, windows: [{ name: 'unknown', startSec: 3.375, endSec: 6 }] }),
      };
    }, sampleRate);
    for (const result of Object.values(results)) expectHealthy(result);
    expect(results.l3.schedule.notes.map(note => note.startSec)).toEqual([3, 3.75, 5.25]);
    expect(results.l3.schedule.notes.map(note => note.endSec)).toEqual([3.75, 4.5, 6]);
    expect(results.l3.probes[0].rms).toBeGreaterThan(.05);
    expect(results.l3.probes[1].peak).toBeLessThan(1e-5);
    expect(results.l3.probes[2].peak).toBeLessThan(1e-5);
    for (const point of results.l3.points) expect(point.absSample).toBeLessThan(1e-5);
    expect(results.allRest.sourcesCreated).toBe(0);
    expect(results.allRest.whole.peak).toBe(0);
    expect(results.allRest.schedule.unknownTicks).toBe(0);
    expect(results.unknown.schedule.unknownTicks).toBe(1680);
    expect(results.unknown.probes[0].peak).toBeLessThan(1e-5);
    await evidence(info, `note-boundaries-${sampleRate}`, { sampleRate, results });
  });

  test(`S07 equal span distinct onsets and note versus rest at ${sampleRate} Hz`, async ({ page }, info) => {
    await setup(page);
    const results = await page.evaluate(async rate => {
      const harness = window.AudioHarness;
      const seam = [{ name: 'seam', startSec: 3.75, endSec: 3.752 }];
      const secondHalf = [{ name: 'secondHalf', startSec: 3.375, endSec: 3.75 }];
      return {
        sustained: await harness.renderPattern({ tokens: ['N4'], sampleRate: rate, windows: seam }),
        restarted: await harness.renderPattern({ tokens: ['N2', 'N2'], sampleRate: rate, windows: seam }),
        quarter: await harness.renderPattern({ tokens: ['N2'], sampleRate: rate, windows: secondHalf }),
        eighthRest: await harness.renderPattern({ tokens: ['N1', 'R1'], sampleRate: rate, windows: secondHalf }),
      };
    }, sampleRate);
    for (const result of Object.values(results)) expectHealthy(result);
    expect(results.sustained.sourcesCreated).toBe(1);
    expect(results.restarted.sourcesCreated).toBe(2);
    expect(results.sustained.schedule.notes.at(-1)?.endSec).toBe(4.5);
    expect(results.restarted.schedule.notes.at(-1)?.endSec).toBe(4.5);
    expect(results.restarted.probes[0].rms).toBeLessThan(results.sustained.probes[0].rms * .5);
    expect(results.quarter.probes[0].rms).toBeGreaterThan(.05);
    expect(results.eighthRest.probes[0].peak).toBeLessThan(1e-5);
    await evidence(info, `articulation-${sampleRate}`, { sampleRate, results });
  });

  test(`S07 four absolute loops stay silent in rests and mixed buses avoid clipping at ${sampleRate} Hz`, async ({ page }, info) => {
    await setup(page);
    const results = await page.evaluate(async rate => {
      const harness = window.AudioHarness;
      return {
        isolated: await harness.renderPattern({ tokens: ['N2', 'N2', 'R2', 'N2'], loops: 4, sampleRate: rate, windows: [
          { name: 'rest0', startSec: 4.5, endSec: 5.25 },
          { name: 'rest1', startSec: 7.5, endSec: 8.25 },
          { name: 'rest2', startSec: 10.5, endSec: 11.25 },
          { name: 'rest3', startSec: 13.5, endSec: 14.25 },
        ] }),
        mixed: await harness.renderPattern({ tokens: ['N1', 'N1', 'N1', 'N1', 'N1', 'N1', 'N1', 'N1'], loops: 4, sampleRate: rate, includeClicks: true }),
      };
    }, sampleRate);
    expectHealthy(results.isolated);
    expectHealthy(results.mixed);
    expect(results.isolated.schedule.notes.filter(note => note.startTick === 0).map(note => note.startSec)).toEqual([3, 6, 9, 12]);
    expect(results.isolated.sourcesCreated).toBe(12);
    expect(results.isolated.schedule.barEndSec).toBe(15);
    for (const rest of results.isolated.probes) expect(rest.peak).toBeLessThan(1e-5);
    expect(results.mixed.sourcesCreated).toBe(52); // 32 notes + 4 count-in + 16 bar clicks.
    expect(results.mixed.whole.peak).toBeGreaterThan(.1);
    expect(results.mixed.whole.peak).toBeLessThan(.3);
    await evidence(info, `loops-mix-${sampleRate}`, { sampleRate, results });
  });

  test(`S07 future sources cancel and active fade stops all later sounds at ${sampleRate} Hz`, async ({ page }, info) => {
    await setup(page);
    const results = await page.evaluate(async rate => ({
      future: await window.AudioHarness.renderPattern({ tokens: ['N2', 'N2', 'R2', 'N2'], loops: 4, sampleRate: rate, stopAtSec: 2.5 }),
      active: await window.AudioHarness.renderPattern({ tokens: ['N2', 'N2', 'R2', 'N2'], loops: 4, sampleRate: rate, stopAtSec: 3.25, windows: [
        { name: 'beforeStop', startSec: 3.02, endSec: 3.24 },
        { name: 'fade', startSec: 3.25, endSec: 3.255 },
        { name: 'afterFade', startSec: 3.255, endSec: 15 },
      ] }),
    }), sampleRate);
    expectHealthy(results.future);
    expectHealthy(results.active);
    expect(results.future.whole.peak).toBe(0);
    expect(results.future.disposedBeforeRendering).toBe(12);
    expect(results.active.disposedBeforeRendering).toBe(11);
    expect(results.active.naturallyDisposed).toBe(1);
    expect(results.active.probes[0].rms).toBeGreaterThan(.05);
    expect(results.active.probes[1].rms).toBeGreaterThan(0);
    expect(results.active.probes[2].peak).toBeLessThan(1e-5);
    await evidence(info, `stop-${sampleRate}`, { sampleRate, results });
  });

  test(`S07 future stop preserves samples before attack, sustain, release and exact boundaries at ${sampleRate} Hz`, async ({ page }, info) => {
    await setup(page);
    const results = await page.evaluate(async rate => {
      const results = [];
      for (const stopSec of [.102, .105, .5, 1.085, 1.095, 1.098]) results.push(await window.AudioHarness.renderStopComparison({ sampleRate: rate, stopSec }));
      return results;
    }, sampleRate);
    for (const result of results) {
      expect(result.beforeStopMaxDelta, `waveform preceding stop=${result.stopSec}`).toBeLessThan(1e-5);
      expect(result.afterFade.peak, `silence after fade=${result.fadeEndSec}`).toBeLessThan(1e-5);
      expect(result.fade.rms).toBeGreaterThan(0);
      expect(result.afterFade.finite).toBe(true);
      expect(result.disposedOnEnded).toBe(true);
      expect(result.disposalCallbacks).toBe(1);
    }
    await evidence(info, `stop-envelope-${sampleRate}`, { sampleRate, results });
  });
}
