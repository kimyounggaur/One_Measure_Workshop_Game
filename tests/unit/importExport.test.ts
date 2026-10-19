import {it,expect} from 'vitest';
import {exportBackup,parseBackup,mergeImport,MAX_IMPORT_BYTES} from '../../src/persistence/importExport';
import {emptyData} from '../../src/persistence/schema';
import {migrateCurrent} from '../../src/persistence/migrations';
import {PUZZLES} from '../../src/content';
import {createDocument,eventsFromTokens} from '../../src/domain/rhythm';
import {fullSignature} from '../../src/domain/signatures';
import {gradePuzzle} from '../../src/domain/grading';
import {exampleSolution} from '../../src/content/learning';
const backup=()=>{const data=emptyData();data.compositions=[createDocument(eventsFromTokens(['N4','N2','N2']),'work')];data.drafts['measure-02']=createDocument(exampleSolution(PUZZLES[1]),'l2',72);return data;};
it('roundtrip copies IDs, preserves semantics and authoritative L2 locks',()=>{const original=backup(),restored=parseBackup(exportBackup(original));expect(restored.compositions[0].id).not.toBe(original.compositions[0].id);expect(fullSignature(restored.compositions[0].events)).toBe(fullSignature(original.compositions[0].events));expect(gradePuzzle(PUZZLES[1],restored.drafts['measure-02'].events).objectivePass).toBe(true);expect(restored.drafts['measure-02'].events.filter(e=>e.locked).map(e=>e.id)).toEqual(PUZZLES[1].initialEvents.filter(e=>e.locked).map(e=>e.id));});
it('tampered L2 locked region rejects',()=>{const raw=JSON.parse(exportBackup(backup()));raw.drafts['measure-02'].events[0].kind='rest';delete raw.drafts['measure-02'].events[0].pitch;expect(()=>parseBackup(JSON.stringify(raw))).toThrow();});
it('rejects dangerous or malformed imports without coercion',()=>{
  for(const modify of [(r:Record<string,unknown>)=>{r.schemaVersion=2;},(r:Record<string,unknown>)=>{r.schemaVersion=0;},(r:Record<string,unknown>)=>{r.documents=Array(21).fill(backup().compositions[0]);},(r:Record<string,unknown>)=>{r.url='https://example.com';}]){const raw=JSON.parse(exportBackup(backup()));modify(raw);expect(()=>parseBackup(JSON.stringify(raw))).toThrow();}
  for(const unsafe of ['__proto__','constructor','prototype'])expect(()=>parseBackup(exportBackup(backup()).replace('{',`{"${unsafe}":{},`))).toThrow();
  for(const size of [MAX_IMPORT_BYTES+1,2*MAX_IMPORT_BYTES])expect(()=>parseBackup(' '.repeat(size))).toThrow('1MiB');
  const raw=JSON.parse(exportBackup(backup()));raw.documents[0].events[0].sourceValue={num:1,den:999};expect(()=>parseBackup(JSON.stringify(raw))).toThrow();
  raw.documents[0]=backup().compositions[0];raw.documents[0].title='가'.repeat(41);expect(()=>parseBackup(JSON.stringify(raw))).toThrow();
  raw.documents[0]=backup().compositions[0];raw.documents[0].events=Array(9).fill(raw.documents[0].events[0]);expect(()=>parseBackup(JSON.stringify(raw))).toThrow();
  expect(()=>parseBackup('{"deep":'+Array(18).fill('[').join('')+'0'+Array(18).fill(']').join('')+'}')).toThrow();
});
it('title markup stays plain text, full slots need explicit replace, and migration is copied',()=>{
  const a=backup();a.compositions[0].title='<img src=x onerror=alert(1)>';const incoming=parseBackup(exportBackup(a));expect(incoming.compositions[0].title).toContain('<img');
  const full=emptyData();full.compositions=Array.from({length:20},(_,i)=>({...a.compositions[0],id:String(i)}));expect(()=>mergeImport(full,incoming)).toThrow('20개');expect(mergeImport(full,incoming,true).compositions).toHaveLength(1);
  const input={schemaVersion:1,nested:{v:1}};const output=migrateCurrent(input);output.nested.v=2;expect(input.nested.v).toBe(1);
});
