import {it,expect} from 'vitest';
import fixture from '../fixtures/timing.json';
import {calibrate,estimateCalibration} from '../../src/audio/Calibration';
it('twelve-target calibration fixture bypasses eight-onset performance guard',()=>{
  const targets=Array.from({length:12},(_,i)=>3000+i*750);
  expect(calibrate(targets,targets.map((v,i)=>v+fixture.calibration.validErrorsMs[i]))).toMatchObject({ok:true,offsetMs:100,keptCount:12});
});
it('rejects outliers then recomputes median/MAD, keeping previous profile outside this pure function',()=>{expect(estimateCalibration([100,100,99,101,98,102,100,100,300,-200])).toMatchObject({ok:true,offsetMs:100,keptCount:8});});
it('count, MAD, offset and inclusion boundaries',()=>{
  expect(estimateCalibration(Array(7).fill(100))).toMatchObject({ok:false,reason:'tooFew'});
  expect(estimateCalibration([0,0,0,0,120,120,120,120])).toMatchObject({ok:false,reason:'inconsistent'});
  expect(estimateCalibration([0,0,0,0,90,90,90,90])).toMatchObject({ok:true,madMs:45});
  for(const offset of [-250,250])expect(estimateCalibration(Array(8).fill(offset))).toMatchObject({ok:true,offsetMs:offset});
  expect(estimateCalibration(Array(8).fill(251))).toMatchObject({ok:false,reason:'outOfRange'});
  expect(estimateCalibration([0,0,0,0,0,0,0,60])).toMatchObject({ok:true,keptCount:8});
  expect(estimateCalibration([0,0,0,0,0,0,0,61])).toMatchObject({ok:false,reason:'tooFew'});
});
