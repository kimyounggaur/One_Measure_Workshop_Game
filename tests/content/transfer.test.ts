import {it,expect} from 'vitest';
import {TRANSFER,gradeCreation,recheckDue,WEEK_MS,clockElapsedIsTrusted,parseAssessments,type AssessmentRecord} from '../../src/content/transfer';
import {eventsFromTokens,analyzeCoverage} from '../../src/domain/rhythm';
import {onsetSignature,fullSignature} from '../../src/domain/signatures';
import type {PaletteId} from '../../src/domain/types';
it('T1–T8 have exact stable IDs, objectives and answer contracts',()=>{expect(TRANSFER.map(i=>i.id)).toEqual(['T1','T2','T3','T4','T5','T6','T7','T8']);expect(TRANSFER.map(i=>i.rubricMax)).toEqual([0,0,0,2,0,2,1,2]);expect(TRANSFER.filter(i=>i.id!=='T7').every(i=>i.correct>=0&&i.correct<i.options.length)).toBe(true);});
it('T5 totals exactly 1920 and T6 has equal onsets but different durations/silence',()=>{
  expect(analyzeCoverage(eventsFromTokens(TRANSFER[4].tokens)).fullCoverage).toBe(true);expect(TRANSFER[4].tokens.map(t=>Number(t.slice(1))*240).reduce((a,b)=>a+b)).toBe(1920);
  const a=eventsFromTokens(TRANSFER[5].tokens),b=eventsFromTokens(TRANSFER[5].other!);expect(onsetSignature(a)).toEqual([0,480,960,1440]);expect(onsetSignature(b)).toEqual(onsetSignature(a));expect(fullSignature(b)).not.toBe(fullSignature(a));
});
it('T7 accepts every legal inventory permutation, not only the example',()=>{
  const all=new Set<string>();const permute=(left:PaletteId[],prefix:PaletteId[])=>{if(!left.length){all.add(prefix.join(','));return;}left.forEach((item,i)=>permute(left.filter((_,j)=>i!==j),[...prefix,item]));};permute(['N2','N2','N1','N1','R2'],[]);
  let passed=0;for(const pattern of all){const tokens=pattern.split(',') as PaletteId[];const score=gradeCreation(tokens);expect(score.length&&score.materials).toBe(true);expect(score.firstSound).toBe(tokens[0]!=='R2');if(Object.values(score).every(Boolean))passed++;}expect(passed).toBe(24);expect(gradeCreation(['N2','N2','N2','R2']).materials).toBe(false);
});
it('optional seven-day revisit boundary is safe for backwards and changed session clocks',()=>{
  const record={phase:'post',completedAt:'2026-10-19T00:00:00Z'} as AssessmentRecord,then=Date.parse(record.completedAt);
  expect(recheckDue([],then+WEEK_MS)).toBe(false);expect(recheckDue([record],then+WEEK_MS-1)).toBe(false);expect(recheckDue([record],then+WEEK_MS)).toBe(true);expect(recheckDue([record],then-1)).toBe(false);
  expect(clockElapsedIsTrusted(then,1000,then+1000,2000)).toBe(true);expect(clockElapsedIsTrusted(then,1000,then+WEEK_MS,2000)).toBe(false);
});
it('response schema preserves manual/self review and assistance separately without invented scores',()=>{
  const record:AssessmentRecord={id:'r',phase:'pre',completedAt:new Date().toISOString(),responses:TRANSFER.slice(0,4).map(i=>({id:i.id,choice:0,explanation:'내 설명'})),path:[{assistance:'hinted',mode:'visualAlternative'}]};
  const saved=parseAssessments([record]);expect(saved[0].responses[3].selfScore).toBeUndefined();expect(saved[0].path).toEqual(record.path);expect(()=>parseAssessments([{...record,responses:[{...record.responses[0],selfScore:100},...record.responses.slice(1)]}])).toThrow();
});
