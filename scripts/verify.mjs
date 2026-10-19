import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
if(!process.env.npm_execpath)throw new Error('Run via npm run verify');
mkdirSync('output/qa',{recursive:true});const logfile='output/qa/verification.log';writeFileSync(logfile,`Verification started ${new Date().toISOString()}\n`);
for(const script of ['typecheck','lint','test:unit','test:content','test:integration','test:audio','build','test:e2e']){
  const start=Date.now(),result=spawnSync(process.execPath,[process.env.npm_execpath,'run',script],{encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
  appendFileSync(logfile,`\nCOMMAND npm run ${script}\n${result.stdout??''}${result.stderr??''}\nEXIT ${result.status} ELAPSED_MS ${Date.now()-start}\n`);
  console.log(`${script}: exit ${result.status}, ${Date.now()-start}ms`);
  if(result.status!==0){console.log(result.stdout,result.stderr);process.exit(result.status??1);}
}
console.log(`All automatic commands passed. Full log: ${logfile}`);
