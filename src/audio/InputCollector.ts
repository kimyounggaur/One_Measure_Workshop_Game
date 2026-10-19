export const MAX_QUEUE_DELAY_MS=150;
export type InputTrust={timestampMs:number;lowConfidence:boolean;invalidReason?:string};
export function trustedInputTime(timestampMs:number,handlerMs:number):InputTrust{
  if(!Number.isFinite(handlerMs)||handlerMs<0)throw new Error('Invalid handler clock');
  if(!Number.isFinite(timestampMs)||timestampMs<0||timestampMs>handlerMs)return {timestampMs:handlerMs,lowConfidence:true};
  return {timestampMs,lowConfidence:false,...(handlerMs-timestampMs>MAX_QUEUE_DELAY_MS?{invalidReason:'inputQueueDelay'}:{})};
}
export type CollectorOptions={pad:HTMLElement;getBounds:()=>{rawOpenMs:number;rawCloseMs:number}|undefined;onInput:(input:InputTrust)=>void;now?:()=>number};
/** No click listener; pointer and focused keyboard down are the only inputs. */
export class InputCollector{
  private pointers=new Set<number>();private removers:(()=>void)[]=[];private count=0;
  constructor(private options:CollectorOptions){
    const listen=(target:EventTarget,type:string,fn:EventListener)=>{target.addEventListener(type,fn);this.removers.push(()=>target.removeEventListener(type,fn));};
    const down=(e:PointerEvent)=>{if(this.pointers.has(e.pointerId))return;this.pointers.add(e.pointerId);e.preventDefault();options.pad.focus({preventScroll:true});this.accept(e.timeStamp);};
    const up=(e:PointerEvent)=>{this.pointers.delete(e.pointerId);};
    const key=(e:KeyboardEvent)=>{if(e.repeat||e.target!==options.pad||![' ','Enter'].includes(e.key))return;e.preventDefault();this.accept(e.timeStamp);};
    listen(options.pad,'pointerdown',down as EventListener);listen(options.pad.ownerDocument,'pointerup',up as EventListener);listen(options.pad.ownerDocument,'pointercancel',up as EventListener);listen(options.pad,'keydown',key as EventListener);
  }
  private accept(timestamp:number){
    const trust=trustedInputTime(timestamp,(this.options.now??(()=>performance.now()))());const bounds=this.options.getBounds();
    if(!bounds||trust.timestampMs<bounds.rawOpenMs||trust.timestampMs>bounds.rawCloseMs)return;
    this.count++;if(this.count>64)trust.invalidReason='tooManyInputs';this.options.onInput(trust);
  }
  dispose(){for(const remove of this.removers.splice(0))remove();this.pointers.clear();this.count=0;}
  getDiagnostics(){return {listeners:this.removers.length,heldPointers:this.pointers.size,inputs:this.count};}
}
