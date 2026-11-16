import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {LabState} from '../src/app/lab-state';
import {createApi,readEvents} from '../src/app/api';
import {highlight,renderMarkdown} from '../src/app/code.component';
const result={result:'**Hello!**',num_turns:1,duration_ms:10,total_cost_usd:null,is_error:false};
let states:LabState[]=[];
function state(){const value=new LabState();states.push(value);return value;}
beforeEach(()=>{
 localStorage.clear();
 vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
  if(String(input).endsWith('config.json'))return Response.json({apiUrl:'',});
  if(String(input).endsWith('/api/health'))return Response.json({status:'ok',api_key_configured:false});
  if(String(input).endsWith('/query'))return Response.json(result);
  return new Response(`event: message\ndata: ${JSON.stringify({type:'ResultMessage',summary:'Done',data:result})}\n\nevent: done\ndata: {}\n\n`);
 });
});
afterEach(()=>{for(const value of states)value.ngOnDestroy();states=[];vi.restoreAllMocks();});
describe('Angular signal state and client',()=>{
 it('preserves assistant text while receiving the final result',async()=>{const value=state();await value.ready;vi.mocked(fetch).mockResolvedValueOnce(new Response(`event: message\ndata: ${JSON.stringify({type:'AssistantMessage',summary:'Working',data:{text:'Partial answer'}})}\n\nevent: message\ndata: ${JSON.stringify({type:'ResultMessage',summary:'Done',data:result})}\n\nevent: done\ndata: {}\n\n`));await value.run();expect(value.partial()).toBe('Partial answer');expect(value.result()).toEqual(result);});
 it('processes final results after the500-row display cap',async()=>{const value=state();await value.ready;const rows=Array.from({length:501},()=>`event: message\ndata: ${JSON.stringify({type:'SystemMessage',summary:'Lifecycle',data:{}})}\n\n`).join('');vi.mocked(fetch).mockResolvedValueOnce(new Response(rows+`event: message\ndata: ${JSON.stringify({type:'ResultMessage',summary:'Done',data:result})}\n\nevent: done\ndata: {}\n\n`));await value.run();expect(value.messages()).toHaveLength(500);expect(value.result()).toEqual(result);expect(value.status()).toBe('success');});
 it('starts with Hello world and reports missing server key',async()=>{const value=state();await value.ready;expect(value.prompt()).toBe('Hello world!');expect(value.health()).toContain('API key not configured');});
 it('streams a real typed final result and prevents immediate duplicates',async()=>{const value=state();await value.ready;await Promise.all([value.run(),value.run()]);expect(value.status()).toBe('success');expect(value.messages()).toHaveLength(1);expect(value.result()).toEqual(result);expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).endsWith('/stream'))).toHaveLength(1);});
 it('trims prompts for simple mode and retains state independently of rendered tab',async()=>{const value=state();await value.ready;value.mode.set('simple');value.prompt.set('  Keep this question  ');await value.run();const call=vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/query'));expect(JSON.parse(String(call?.[1]?.body))).toEqual({prompt:'Keep this question'});expect(value.prompt()).toBe('  Keep this question  ');expect(value.result()?.result).toBe('**Hello!**');});
 it('cancels fetch and unlocks after abort',async()=>{const value=state();await value.ready;vi.mocked(fetch).mockImplementationOnce(async(_url,options)=>new Promise((_resolve,reject)=>options?.signal?.addEventListener('abort',()=>reject(new DOMException('Cancelled','AbortError')),{once:true})));const run=value.run();await Promise.resolve();value.cancel();await run;expect(value.status()).toBe('error');expect(value.error()).toContain('cancelled');});
 it('remembers dark theme',async()=>{const value=state();value.toggleTheme();expect(value.dark()).toBe(true);expect(localStorage.getItem('agent23-theme')).toBe('dark');});
 it('preserves safe API errors',async()=>{vi.mocked(fetch).mockResolvedValueOnce(Response.json({detail:'Configure the server key'},{status:503}));await expect(createApi('').query('hello')).rejects.toThrow('Configure the server key');});
 it('rejects stream completion without a final result',async()=>{vi.mocked(fetch).mockResolvedValueOnce(new Response('event: done\ndata: {}\n\n'));await expect(createApi('').stream('hello',()=>{})).rejects.toThrow('before the agent finished');});
 it('handles UTF-8, CRLF and one-byte chunks',async()=>{const bytes=new TextEncoder().encode('event: message\r\ndata: {"text":"héllo"}\r\n\r\n');const body=new ReadableStream<Uint8Array>({start(controller){for(const byte of bytes)controller.enqueue(new Uint8Array([byte]));controller.close();}});const events:unknown[]=[];await readEvents(body,(_name,data)=>events.push(data));expect(events).toEqual([{text:'héllo'}]);});
});
describe('Safe colored content',()=>{
 it('colors the C# gateway and Python SDK walkthroughs',()=>{expect(highlight('public class Gateway { }','csharp')).toContain('hljs-keyword');expect(highlight('async def run(): return "Hello"','python')).toContain('hljs-keyword');});
 it('colors TypeScript and keeps indentation',()=>{const html=highlight('const x = "hello";\n  // comment','typescript');expect(html).toContain('hljs-keyword');const node=document.createElement('div');node.innerHTML=html;expect(node.textContent).toBe('const x = "hello";\n  // comment');});
 it('escapes unknown code languages',()=>{expect(highlight('<script>alert(1)</script>','unknown')).not.toContain('<script>');});
 it('sanitizes Markdown and highlights fences',()=>{const html=renderMarkdown('**Hello**\n<script>alert(1)</script>\n```typescript\nconst x=1;\n```');expect(html).toContain('<strong>Hello</strong>');expect(html).toContain('hljs-keyword');expect(html).not.toContain('<script>');});
});
