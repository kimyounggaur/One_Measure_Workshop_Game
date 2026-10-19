import {defineConfig} from '@playwright/test';
const baseURL=process.env.DEPLOYMENT_URL;
if(!baseURL||!/^https:\/\/[^/]+\.vercel\.app\/?$/.test(baseURL))throw new Error('Set DEPLOYMENT_URL to the verified Vercel production alias');
if(!process.env.EXPECTED_BUILD_ID)throw new Error('Set EXPECTED_BUILD_ID from the local verified build metadata');
export default defineConfig({testDir:'./tests/production',workers:1,timeout:90000,use:{baseURL,headless:true,viewport:{width:390,height:844},screenshot:'only-on-failure'},projects:[{name:'production-chrome',use:{browserName:'chromium',channel:'chrome'}}]});
