import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {mkdir,writeFile} from 'node:fs/promises';
for(const width of [320,390])for(const theme of ['light','dark','high-contrast'])for(const scale of [1,2])test(`${width}px ${theme} text${scale*100}% editor, feedback, storage and focus remain accessible`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('/');await page.getByText('도움말 · 화면 설정 · 출처',{exact:true}).click();await page.getByRole('combobox',{name:'화면 테마'}).selectOption(theme);await page.getByRole('checkbox',{name:'움직임 줄이기'}).check();await page.evaluate(factor=>document.documentElement.style.fontSize=`${factor*100}%`,scale);
  await page.getByRole('button',{name:/주문 06/}).click();await page.getByRole('button',{name:'모델 기호 보기'}).click();await page.getByRole('button',{name:'조건 확인하기'}).click();await page.getByText('작품 보관함 · 백업과 가져오기',{exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await expect(page.getByRole('button',{name:'JSON 백업 내보내기',exact:true})).toBeEnabled();
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();expect(results.violations).toEqual([]);
  const contrast=await page.evaluate(()=>{const style=getComputedStyle(document.documentElement);const value=(name:string)=>style.getPropertyValue(name).trim();return {body:value('--ink'),background:value('--bg'),muted:value('--muted'),note:value('--note'),noteInk:value('--note-ink'),rest:value('--rest'),restInk:value('--rest-ink'),accent:value('--accent'),error:value('--error')};});
  const luminance=(hex:string)=>{let digits=hex.replace('#','');if(digits.length===3)digits=[...digits].map(c=>c+c).join('');const rgb=digits.match(/../g)!.map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  const ratio=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const ratios={body:ratio(contrast.body,contrast.background),muted:ratio(contrast.muted,contrast.background),note:ratio(contrast.noteInk,contrast.note),rest:ratio(contrast.restInk,contrast.rest),accent:ratio(contrast.accent,contrast.background),error:ratio(contrast.error,contrast.background)};
  for(const n of Object.values(ratios))expect(n).toBeGreaterThanOrEqual(4.5);
  await mkdir('output/playwright',{recursive:true});await writeFile(`output/playwright/s13-${width}-${theme}-${scale}.json`,JSON.stringify({width,theme,scale,violations:results.violations,ratios},null,2));
  if(scale===2)await page.screenshot({path:`output/playwright/s13-${width}-${theme}.png`,fullPage:true});
  if(width===390&&scale===1){await page.getByRole('region',{name:'한 마디 조립판',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`output/playwright/s13-editor-${theme}.png`});}
});
test('forced colors and reduced motion retain noncolor meaning and hide animated cursor',async({page})=>{
  await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});await page.goto('/');await page.getByRole('button',{name:/주문 03/}).click();await page.getByRole('button',{name:'해답 보기',exact:true}).click();await expect(page.getByRole('region',{name:'한 마디 조립판',exact:true})).toContainText('쉼');await page.getByRole('button',{name:'내 리듬 듣기',exact:true}).click();await expect(page.locator('.playback-cursor')).toBeHidden();await page.getByRole('button',{name:'정지',exact:true}).click();
});
