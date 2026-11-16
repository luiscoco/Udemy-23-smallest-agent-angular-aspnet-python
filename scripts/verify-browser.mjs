import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const base=process.env.VERIFY_BASE_URL||'http://127.0.0.1:6600';
assert.equal((await(await fetch(base+'/api/health')).json()).api_key_configured,false,'Use a placeholder key to avoid inference.');
mkdirSync('verification',{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});await page.getByText(/Backend connected.*API key not configured/).waitFor();
 await page.locator('#prompt').fill('Keep my Angular and Python prompt');
 for(const [id,title]of [['learn','Small enough to understand. Real enough to explore.'],['setup','Angular, .NET and Python. One launcher.'],['architecture','See how the pieces connect.'],['walkthrough','One request. Every layer explained.'],['lab','Start with a little curiosity.']]){await page.locator(`.lesson-nav a[href="#${id}"]`).click();await page.getByRole('heading',{name:title,exact:true}).waitFor();}
 assert.equal(await page.locator('#prompt').inputValue(),'Keep my Angular and Python prompt');await page.getByRole('button',{name:/Run agent/}).click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/ANTHROPIC_API_KEY/);
 const dismiss=page.getByRole('button',{name:'Dismiss',exact:true});if(await dismiss.isVisible())await dismiss.click();
 await page.locator('.lesson-nav a[href="#architecture"]').click();await page.locator('.workflow-code-step').last().waitFor();assert.equal(await page.locator('.workflow-code-step').count(),16);assert.ok(await page.locator('.workflow-code-step .hljs-keyword').count()>10);
 await page.waitForFunction(()=>{const img=document.querySelector('.uml-viewport img');return img?.complete&&img.naturalWidth===1680;});assert.ok(await page.locator('.uml-viewport').evaluate(el=>el.scrollWidth>el.clientWidth));await page.locator('.uml-card').scrollIntoViewIfNeeded();await page.screenshot({path:'verification/architecture.png'});
 await page.getByRole('button',{name:'Dark mode',exact:true}).click();await page.reload({waitUntil:'domcontentloaded'});assert.equal(await page.evaluate(()=>localStorage.getItem('agent23-theme')),'dark');await page.getByRole('button',{name:'Light mode',exact:true}).waitFor();
 await page.setViewportSize({width:390,height:844});for(const id of ['lab','learn','setup','walkthrough','architecture']){await page.locator(`.lesson-nav a[href="#${id}"]`).click();await page.waitForFunction(id=>document.querySelector('.lesson-nav [aria-current="page"]')?.getAttribute('href')===`#${id}`,id);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Mobile overflow in ${id}`);}
 await page.screenshot({path:'verification/mobile.png'});assert.deepEqual(errors,[]);console.log('Chrome passed five tabs, retained prompt, missing-key SSE,16 colored source cards, UML, persistent theme and mobile layout.');
}finally{await browser.close();}
