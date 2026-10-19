import {LocalDatabase} from '../../src/persistence/db';
import {emptyData} from '../../src/persistence/schema';
import {gradePuzzle} from '../../src/domain/grading';
import {createDocument,eventsFromTokens} from '../../src/domain/rhythm';
import {PUZZLES} from '../../src/content';
export function domainTimes(){const events=eventsFromTokens(Array(8).fill('N1'));const times:number[]=[];for(let i=0;i<1000;i++){const start=performance.now();gradePuzzle(PUZZLES[0],events);times.push(performance.now()-start);}return times;}
export async function saveTimes(){const db=new LocalDatabase(crypto.randomUUID(),indexedDB,()=>Date.now(),'one-measure-benchmark-'+crypto.randomUUID());await db.open();await db.acquire();const data=emptyData(),times:number[]=[];try{for(let i=0;i<30;i++){data.drafts.free={...createDocument(eventsFromTokens(['N2','N1','R1','N2','N2'])),revision:i};const start=performance.now();await db.commit(data,i);times.push(performance.now()-start);}}finally{await db.close();}return times;}
