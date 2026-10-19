import { defineConfig } from 'vite';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const hash=createHash('sha256');
for(const folder of ['src','public','scripts'])for(const path of readdirSync(folder,{recursive:true}).map(path=>String(path).replaceAll('\\','/')).sort()){try{const bytes=readFileSync(folder+'/'+path);hash.update(folder+'/'+path);hash.update(bytes);}catch{/* directories */}}
for(const path of ['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html','docs/ASSET_NOTICES.md']){hash.update(path);hash.update(readFileSync(path));}
const buildId=hash.digest('hex').slice(0,16);
export default defineConfig({define:{__BUILD_ID__:JSON.stringify(buildId)},build:{target:'es2022'},plugins:[{name:'build-metadata',generateBundle(){this.emitFile({type:'asset',fileName:'build-meta.json',source:JSON.stringify({buildId,appVersion:'1.0.0',contentVersion:'1',schemaVersion:1})});}}]});
