import {it,expect} from 'vitest';
import {InputCollector,trustedInputTime,type InputTrust} from '../../src/audio/InputCollector';
it('timestamp origins: queue 150 included, 151 invalid, epoch/future fallback is low confidence',()=>{
  expect(trustedInputTime(850,1000)).toEqual({timestampMs:850,lowConfidence:false});
  expect(trustedInputTime(849,1000).invalidReason).toBe('inputQueueDelay');
  for(const time of [NaN,-1,1001,1770000000000])expect(trustedInputTime(time,1000)).toEqual({timestampMs:1000,lowConfidence:true});
});
class Pad extends EventTarget{ownerDocument=new EventTarget();focus(){} }
function fire(target:EventTarget,type:string,properties:Record<string,unknown>){const event=new Event(type,{cancelable:true});for(const [k,v]of Object.entries(properties))Object.defineProperty(event,k,{value:v});target.dispatchEvent(event);}
it('one pointer down until up, separate fingers count, clicks/repeat/unfocused keys do not',()=>{
  const pad=new Pad(),inputs:InputTrust[]=[];
  const collector=new InputCollector({pad:pad as unknown as HTMLElement,getBounds:()=>({rawOpenMs:590,rawCloseMs:3910}),onInput:i=>inputs.push(i),now:()=>1000});
  fire(pad,'pointerdown',{pointerId:1,timeStamp:900});fire(pad,'pointerdown',{pointerId:1,timeStamp:910});fire(pad,'pointerdown',{pointerId:2,timeStamp:920});fire(pad,'click',{timeStamp:930});
  fire(pad.ownerDocument,'pointerup',{pointerId:1});fire(pad,'pointerdown',{pointerId:1,timeStamp:940});
  fire(pad,'keydown',{key:' ',repeat:true,timeStamp:950});fire(pad,'keydown',{key:'Enter',repeat:false,timeStamp:960});
  fire(pad,'keydown',{key:' ',target:{},timeStamp:970});
  expect(inputs.map(i=>i.timestampMs)).toEqual([900,920,940,960]);collector.dispose();expect(collector.getDiagnostics()).toEqual({listeners:0,heldPointers:0,inputs:0});fire(pad,'pointerdown',{pointerId:3,timeStamp:990});expect(inputs).toHaveLength(4);
});
it('COUNT_IN early window, late grace, and eligible 65th input are retained or invalidated correctly',()=>{
  const pad=new Pad(),inputs:InputTrust[]=[];let now=750;
  const collector=new InputCollector({pad:pad as unknown as HTMLElement,getBounds:()=>({rawOpenMs:590,rawCloseMs:4410}),onInput:i=>inputs.push(i),now:()=>now});
  fire(pad,'pointerdown',{pointerId:1,timeStamp:750});now=4300;fire(pad,'pointerdown',{pointerId:2,timeStamp:4300});
  for(let i=0;i<63;i++)fire(pad,'pointerdown',{pointerId:3+i,timeStamp:4300});
  expect(inputs[0].timestampMs).toBe(750);expect(inputs[1].timestampMs).toBe(4300);expect(inputs[64].invalidReason).toBe('tooManyInputs');collector.dispose();
});
