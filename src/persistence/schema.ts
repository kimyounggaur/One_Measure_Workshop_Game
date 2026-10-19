import {PUZZLES} from '../content';
import type {PuzzleProgress} from '../app/machine';
import type {RhythmDocument} from '../domain/types';
import {isRecord,assertOnlyKeys,parseDocument} from '../domain/validation';
import {validatePuzzleEdit} from '../domain/constraints';
import {gradePuzzle} from '../domain/grading';
import type {CalibrationProfile} from '../audio/Calibration';
import {parseAssessments,type AssessmentRecord} from '../content/transfer';
export const APP_VERSION='1.0.0';
export type Settings={theme:'light'|'dark'|'high-contrast';reducedMotion:boolean;profile?:CalibrationProfile;profileStale:boolean;metronome:boolean;assessments?:AssessmentRecord[]};
export type AppData={drafts:Record<string,RhythmDocument>;progress:Record<string,PuzzleProgress>;compositions:RhythmDocument[];settings:Settings};
export const emptyData=():AppData=>({drafts:{},progress:{},compositions:[],settings:{theme:'light',reducedMotion:false,profileStale:false,metronome:false}});
export function safeTree(value:unknown,depth=0):void{
  if(depth>16)throw new Error('JSON nesting exceeds 16');
  if(typeof value==='string'&&value.length>4096)throw new Error('String too long');
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Nonfinite number');
  if(typeof value==='object'&&value!==null)for(const [key,nested]of Object.entries(value)){if(['__proto__','prototype','constructor'].includes(key))throw new Error('Unsafe key');safeTree(nested,depth+1);}
}
export function parseSettings(value:unknown):Settings{
  if(!isRecord(value))throw new Error('Invalid settings');assertOnlyKeys(value,['theme','reducedMotion','profile','profileStale','metronome','assessments']);
  if(value.assessments!==undefined)parseAssessments(value.assessments);
  if(!['light','dark','high-contrast'].includes(String(value.theme))||typeof value.reducedMotion!=='boolean'||typeof value.profileStale!=='boolean'||typeof value.metronome!=='boolean')throw new Error('Invalid settings fields');
  if(value.profile!==undefined){const p=value.profile;if(!isRecord(p))throw new Error('Invalid profile');assertOnlyKeys(p,['id','version','offsetMs','clockMode','sampleRate','calibratedAt','outputLabel']);if(typeof p.id!=='string'||!p.id||p.id.length>128||p.version!==1||typeof p.offsetMs!=='number'||!Number.isFinite(p.offsetMs)||Math.abs(p.offsetMs)>250||!['outputTimestamp','anchorFallback'].includes(String(p.clockMode))||typeof p.sampleRate!=='number'||!Number.isFinite(p.sampleRate)||p.sampleRate<8000||p.sampleRate>384000||typeof p.calibratedAt!=='string'||!Number.isFinite(Date.parse(p.calibratedAt))||!['speaker','wired','wireless','other'].includes(String(p.outputLabel)))throw new Error('Invalid calibration profile');}
  return structuredClone(value) as Settings;
}
export function parseAppData(value:unknown):AppData{
  safeTree(value);if(!isRecord(value))throw new Error('Invalid app data');assertOnlyKeys(value,['drafts','progress','compositions','settings']);
  if(!isRecord(value.drafts)||!isRecord(value.progress)||!Array.isArray(value.compositions)||value.compositions.length>20)throw new Error('Invalid collections/slot limit');
  const drafts:AppData['drafts']={},progress:AppData['progress']={};
  for(const [key,raw]of Object.entries(value.drafts)){const puzzle=PUZZLES.find(p=>p.id===key);if(!puzzle&&key!=='free')throw new Error('Unknown draft');const doc=parseDocument(raw);if(puzzle&&(validatePuzzleEdit(puzzle,doc.events).length||doc.tempo.bpm<puzzle.tempo.minBpm||doc.tempo.bpm>puzzle.tempo.maxBpm))throw new Error('Invalid puzzle draft');drafts[key]=doc;}
  for(const [key,raw]of Object.entries(value.progress)){
    const puzzle=PUZZLES.find(p=>p.id===key);if(!puzzle||!isRecord(raw))throw new Error('Invalid progress');assertOnlyKeys(raw,['puzzleId','puzzleVersion','objectivePass','explanationReviewed','completedBy','mode','attempts','bestTheorySnapshot','discoveredSignatures']);
    if(raw.puzzleId!==key||raw.puzzleVersion!==puzzle.version||typeof raw.objectivePass!=='boolean'||typeof raw.explanationReviewed!=='boolean'||!['independent','hinted','solutionViewed','notCompleted'].includes(String(raw.completedBy))||!['audio','visualAlternative'].includes(String(raw.mode))||!Number.isSafeInteger(raw.attempts)||Number(raw.attempts)<0||!Array.isArray(raw.discoveredSignatures)||raw.discoveredSignatures.length>puzzle.expectedAnswerCount||raw.discoveredSignatures.some(s=>typeof s!=='string'||s.length>1024))throw new Error('Invalid progress fields');
    if(raw.objectivePass){const doc=parseDocument(raw.bestTheorySnapshot);if(!gradePuzzle(puzzle,doc.events).objectivePass)throw new Error('Invalid claimed theory pass');}
    else if(raw.bestTheorySnapshot!==undefined)parseDocument(raw.bestTheorySnapshot);
    progress[key]=structuredClone(raw) as PuzzleProgress;
  }
  const compositions=value.compositions.map(parseDocument);if(new Set(compositions.map(d=>d.id)).size!==compositions.length)throw new Error('Duplicate composition IDs');
  return {drafts,progress,compositions,settings:parseSettings(value.settings)};
}
