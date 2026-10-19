import {useEffect,useState} from 'react';
import {BUILD_ID,workerStatus,applyWaiting} from '../offline/serviceWorker';
export function OfflineStatus({home,save,stop}:{home:boolean;save:()=>Promise<boolean>;stop:()=>void}){
  const [ready,setReady]=useState(false),[online,setOnline]=useState(navigator.onLine),[waiting,setWaiting]=useState(false),[registration,setRegistration]=useState<ServiceWorkerRegistration|undefined>(undefined),[message,setMessage]=useState(''),[applying,setApplying]=useState(false);
  useEffect(()=>{
    let alive=true;let reg:ServiceWorkerRegistration|undefined;let removeInstalling:()=>void=()=>undefined;let removeUpdate:()=>void=()=>undefined;
    const inspect=async()=>{const worker=navigator.serviceWorker.controller??reg?.active;if(!worker)return;try{const status=await workerStatus(worker);if(alive){setReady(status.ready&&status.contentVersion==='1'&&status.buildId===BUILD_ID);if(status.buildId===BUILD_ID)worker.postMessage({type:'APP_READY',buildId:BUILD_ID,contentVersion:'1'});}}catch{if(alive)setReady(false);}};
    const connection=()=>setOnline(navigator.onLine);const changed=()=>{void inspect();};
    window.addEventListener('online',connection);window.addEventListener('offline',connection);
    if('serviceWorker'in navigator&&import.meta.env.PROD){
      navigator.serviceWorker.addEventListener('controllerchange',changed);
      void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(value=>{reg=value;if(!alive)return;setRegistration(value);setWaiting(!!value.waiting);
        const update=()=>{const worker=value.installing;if(!worker)return;const state=()=>{if(alive){setWaiting(!!value.waiting);if(worker.state==='redundant')setMessage('오프라인 파일 준비를 완료하지 못했어요. 현재 저장본은 유지해요.');void inspect();}};worker.addEventListener('statechange',state);removeInstalling=()=>worker.removeEventListener('statechange',state);};
        value.addEventListener('updatefound',update);removeUpdate=()=>value.removeEventListener('updatefound',update);update();void navigator.serviceWorker.ready.then(inspect);void inspect();
      }).catch(()=>{if(alive)setMessage('이 브라우저에서 오프라인 준비를 완료하지 못했어요.');});
    }
    return()=>{alive=false;removeInstalling();removeUpdate();window.removeEventListener('online',connection);window.removeEventListener('offline',connection);navigator.serviceWorker?.removeEventListener('controllerchange',changed);};
  },[]);
  useEffect(()=>{if(!applying)return;const reload=()=>location.reload();navigator.serviceWorker.addEventListener('controllerchange',reload);return()=>navigator.serviceWorker.removeEventListener('controllerchange',reload);},[applying]);
  return <div className="offline-status"><p role="status" data-testid="offline-status">{ready?'오프라인 준비 완료':'오프라인 준비 전'} · {online?'온라인':'현재 오프라인'}{!ready&&!online?' · 처음 받지 않은 파일은 열리지 않을 수 있어요.':''}</p>{message&&<p role="status">{message}</p>}{waiting&&<p>새 버전이 준비됐어요. {home?<button disabled={applying} onClick={()=>{if(!registration)return;setApplying(true);void applyWaiting(registration,save,stop).catch(error=>{setApplying(false);setMessage(error instanceof Error?error.message:'업데이트를 완료하지 못했어요.');});}}>새 버전 적용</button>:'주문 목록에서 저장을 확인한 뒤 적용할 수 있어요.'}</p>}{home&&<details><summary>오프라인 보관 설정</summary><p>브라우저가 저장 공간을 비울 수 있어요. 중요한 작품의 JSON 백업도 보관해 주세요.</p><button onClick={()=>{void navigator.storage?.persist?.().then(granted=>setMessage(granted?'브라우저가 지속 저장 요청을 허용했어요. 그래도 JSON 백업을 권해요.':'지속 저장이 허용되지 않았어요. 학습은 계속할 수 있어요.')).catch(()=>setMessage('지속 저장 요청을 완료하지 못했어요.'));}}>이 기기에 계속 보관 요청</button></details>}</div>;
}
