import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testMatch:['editor.spec.ts','audio-lifecycle.spec.ts','recovery.spec.ts','transfer.spec.ts','privacy.spec.ts'],projects:[{name:'edge',use:{browserName:'chromium',channel:'msedge'}}]});
