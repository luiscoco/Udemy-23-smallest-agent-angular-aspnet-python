import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const lesson = JSON.parse(readFileSync('frontend/src/app/lesson.json', 'utf8'));
assert.equal(lesson.length, 16);
for (const step of lesson) {
  const lines = readFileSync(step.source, 'utf8').split(/\r?\n/);
  assert.equal(lines[step.line - 1].trim(), step.code.split('\n')[0].trim(), step.source);
}
const base=process.env.VERIFY_BASE_URL||'http://127.0.0.1:9800';
assert.deepEqual(await(await fetch(base+'/api/health')).json(),{status:'ok',api_key_configured:false},'Verification requires a placeholder model key.');
const post=(body,headers={})=>fetch(base+'/api/agent/query',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
for(const body of [{},{prompt:''},{prompt:' '},{prompt:42},{prompt:'x'.repeat(4001)}])assert.equal((await post(body)).status,422);
assert.equal((await post({prompt:'x'.repeat(40000)})).status,413);assert.equal((await post({prompt:'hi'},{Origin:'https://foreign.invalid'})).status,403);assert.equal((await post({prompt:'hi'})).status,503);
const spoof=await post({prompt:'hi'},{'X-Agent-Service-Token':'browser-spoof'});assert.equal(spoof.status,503);assert.match(await spoof.text(),/ANTHROPIC_API_KEY/);
assert.equal((await fetch('http://127.0.0.1:9801/api/health')).status,401);
const stream=await fetch(base+'/api/agent/stream',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:'{"prompt":"hi"}'});assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/);const events=await stream.text();assert.match(events,/event: error/);assert.doesNotMatch(events,/event: done/);
assert.equal((await fetch(base+'/api/docs')).status,200);assert.ok((await(await fetch(base+'/api/openapi.json')).json()).paths['/api/agent/stream']);
for(const path of ['/.env','/api/unknown','/missing.js'])assert.equal((await fetch(base+path)).status,404);
const html=await(await fetch(base+'/')).text();assert.match(html,/<app-root/);const asset=html.match(/src="([^"]+\.js)"/);assert.ok(asset);assert.equal((await fetch(new URL(asset[1],base+'/'))).status,200);assert.match(await(await fetch(base+'/workflow.svg')).text(),/ASP.NET Core gateway/);
console.log('Compiled Angular, gateway API/validation/origin, private authentication, missing-key query/SSE and docs passed without inference.');
