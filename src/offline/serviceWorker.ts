declare const __BUILD_ID__:string;
export const BUILD_ID=typeof __BUILD_ID__==='undefined'?'development':__BUILD_ID__;
export type WorkerStatus={ready:boolean;buildId:string;contentVersion:string;schemaVersion:number;files:number;bytes:number};
export function workerStatus(worker:ServiceWorker):Promise<WorkerStatus>{return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timeout=setTimeout(()=>{channel.port1.close();reject(new Error('오프라인 상태를 확인하지 못했어요.'));},5000);channel.port1.onmessage=e=>{clearTimeout(timeout);channel.port1.close();resolve(e.data as WorkerStatus);};worker.postMessage({type:'STATUS'},[channel.port2]);});}
export async function applyWaiting(registration:ServiceWorkerRegistration,save:()=>Promise<boolean>,stop:()=>void):Promise<void>{
  const worker=registration.waiting;if(!worker)throw new Error('대기 중인 업데이트가 없어요.');const status=await workerStatus(worker);
  if(!status.ready||status.contentVersion!=='1'||status.schemaVersion!==1)throw new Error('새 버전의 파일이나 저장 버전을 확인하지 못했어요. 현재 버전을 유지해요.');
  if(!await save())throw new Error('저장을 확인하지 못해 업데이트를 멈췄어요. 먼저 JSON 백업을 보관해 주세요.');
  stop();worker.postMessage({type:'APPLY',buildId:status.buildId});
}
