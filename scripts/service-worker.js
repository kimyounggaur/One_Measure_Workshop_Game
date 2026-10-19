/* global self,caches,crypto,fetch,Response,URL */
// Build replaces this marker with a complete digest manifest. No DB operations.
const MANIFEST=__OFFLINE_MANIFEST__;
const PREFIX='one-measure-cache-',CACHE=PREFIX+MANIFEST.buildId;
const marker='/__one-measure-offline-ready__';
async function ready(){const cache=await caches.open(CACHE);if(!await cache.match(marker))return false;for(const file of MANIFEST.files)if(!await cache.match(file.url))return false;return true;}
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  try{
    if(MANIFEST.contentVersion!=='1'||MANIFEST.schemaVersion!==1)throw new Error('Content/schema mismatch');
    for(const file of MANIFEST.files){const response=await fetch(file.url,{cache:'reload'});if(!response.ok||await digest(await response.clone().arrayBuffer())!==file.sha256)throw new Error('Required asset verification failed: '+file.url);await cache.put(file.url,response);}
    for(const file of MANIFEST.files)if(!await cache.match(file.url))throw new Error('Incomplete cache');
    await cache.put(marker,new Response(JSON.stringify({buildId:MANIFEST.buildId,contentVersion:MANIFEST.contentVersion})));
  }catch(error){await caches.delete(CACHE);throw error;}
  // Waiting is deliberate; no automatic skipWaiting on an existing version.
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(url.origin!==self.location.origin||event.request.method!=='GET')return;
  if(url.pathname==='/sw.js'||url.pathname.startsWith('/sw-fixture'))return;
  event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(event.request.mode==='navigate'?'/index.html':url.pathname);return cached??fetch(event.request);})());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='STATUS')event.waitUntil((async()=>{event.ports[0]?.postMessage({ready:await ready(),buildId:MANIFEST.buildId,contentVersion:MANIFEST.contentVersion,schemaVersion:MANIFEST.schemaVersion,files:MANIFEST.files.length,bytes:MANIFEST.bytes});})());
  if(event.data?.type==='APPLY'&&event.data.buildId===MANIFEST.buildId)event.waitUntil((async()=>{if(await ready())await self.skipWaiting();})());
  if(event.data?.type==='APP_READY'&&event.data.buildId===MANIFEST.buildId&&event.data.contentVersion===MANIFEST.contentVersion)event.waitUntil((async()=>{
    if(!await ready())return;
    if(self.registration.installing||self.registration.waiting)return;
    // Keep old caches while another controlled tab still runs the old shell.
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});if(clients.length>1)return;
    if(self.registration.installing||self.registration.waiting)return;
    for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
  })());
});
