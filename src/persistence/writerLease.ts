export {LEASE_DURATION_MS,LEASE_RENEWAL_MS,type Lease} from './db';
/** BroadcastChannel is notification only. The IDB transaction checks every fence. */
export function notifyOtherTabs(onChange:()=>void){
  const channel=typeof BroadcastChannel==='undefined'?undefined:new BroadcastChannel('one-measure-workshop-writer');
  if(channel)channel.onmessage=onChange;
  return {notify:()=>channel?.postMessage('check-lease'),close:()=>channel?.close()};
}
