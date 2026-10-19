import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const meta=JSON.parse(await readFile('dist/build-meta.json','utf8'));
const files=[];let bytes=0;
for(const path of (await readdir('dist',{recursive:true})).map(path=>path.replaceAll('\\','/')).sort()){
  if(!/\.(html|js|css|svg|png|webp|jpg|json|txt)$/.test(path)||path==='sw.js'||path==='offline-manifest.json')continue;
  const content=await readFile('dist/'+path);bytes+=content.length;files.push({url:'/'+path.replaceAll('\\','/'),sha256:createHash('sha256').update(content).digest('hex'),bytes:content.length});
}
const manifest={...meta,files,bytes};
if(bytes>2*1024*1024)throw new Error('Required offline package exceeds 2MiB');
await writeFile('dist/offline-manifest.json',JSON.stringify(manifest,null,2));
const template=await readFile('scripts/service-worker.js','utf8');
await writeFile('dist/sw.js',template.replace('__OFFLINE_MANIFEST__',JSON.stringify(manifest)));
console.log(`Offline manifest: ${files.length} verified files, ${bytes} bytes, build ${meta.buildId}`);
