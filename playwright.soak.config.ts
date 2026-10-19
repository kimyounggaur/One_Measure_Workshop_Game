import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testDir:'./tests/soak',timeout:1300000,expect:{timeout:10000}});
