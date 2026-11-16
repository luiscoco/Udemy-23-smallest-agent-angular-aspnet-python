import {Component,HostListener,inject,signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {LabState} from './lab-state';
import {CodeComponent,AnswerComponent} from './code.component';
import steps from './lesson.json';
@Component({selector:'app-root',imports:[CommonModule,FormsModule,CodeComponent,AnswerComponent],templateUrl:'./app.html'})
export class App {
 readonly state=inject(LabState);readonly steps=steps;readonly walkthrough=[1,3,4,5,10,12].map(n=>steps[n-1]);
 readonly tabs=[['lab','Application lab'],['learn','What you will learn'],['setup','How to run'],['architecture','Architecture & workflow'],['walkthrough','Code walkthrough']];
 readonly section=signal('lab');readonly examples=['Hello world!','Explain an AI agent in one sentence.','Show a tiny Python example.'];
 readonly topics=[['Three runtimes, clear roles','Angular owns the interface and signal state. ASP.NET Core validates public HTTP and serves the compiled UI. Private Python owns the real Claude Agent SDK and its CLI subprocess.'],['Two credentials','Only Python receives the Anthropic key. The .NET gateway attaches a separate internal service token. Setup creates matching random tokens; neither credential enters Angular.'],['One browser-facing origin','Angular proxies /api to .NET during development. Production .NET serves Angular and API together. The browser never calls Python directly.'],['Real streaming and cancellation','POST SSE carries selected SDK messages, not guaranteed token deltas. The gateway flushes each received chunk. Browser cancellation closes the private HTTP request and cancels owned SDK execution.'],['Bounded execution','Public and private input checks enforce32KiB and a trimmed1–4000 UTF-16-unit prompt. Python has a180-second deadline and bounded turns, with tools/settings/skills/MCP/plugins/session persistence disabled.'],['Safe, readable results','Fresh temporary work/home/config directories isolate each run. Private fields are omitted, keys redacted, Markdown sanitized and snippets colored. Unknown cost remains unknown; failed SDK results never become success because done arrives.']];
 readonly setup=String.raw`cd .\23-smallest-agent-angular-aspnet-python
npm ci
npm run setup
notepad agent-service\.env`;
 readonly env=`ANTHROPIC_API_KEY=sk-ant-replace-with-your-key
CLAUDE_MODEL=
AGENT_SYSTEM_PROMPT=You are a concise teaching assistant.
AGENT_MAX_TURNS=1
AGENT_HOST=127.0.0.1
AGENT_PORT=9801
AGENT_SERVICE_TOKEN=YOUR_SETUP_GENERATED_TOKEN`;
 readonly gatewayEnv=`API_HOST=127.0.0.1
API_PORT=9800
AGENT_SERVICE_URL=http://127.0.0.1:9801
AGENT_SERVICE_TOKEN=THE_SAME_SETUP_GENERATED_TOKEN
TRUST_PROXY=0`;
 readonly checks='npm run typecheck\nnpm test\nnpm run build\nnpm start';
 constructor(){this.onHash();}
 @HostListener('window:hashchange')onHash(){const id=location.hash.slice(1);this.section.set(this.tabs.some(([key])=>key===id)?id:'lab');}
 @HostListener('document:keydown',['$event'])shortcut(event:KeyboardEvent){if(this.section()==='lab'&&event.ctrlKey&&event.key==='Enter'){event.preventDefault();void this.state.run();}}
 json(value:unknown){return JSON.stringify(value,null,2);}
 async copy(){try{await navigator.clipboard.writeText(this.state.result()?.result||'');this.state.notice.set('Answer copied.');}catch{this.state.notice.set('Select the answer to copy it.');}}
 download(){const url=URL.createObjectURL(new Blob([this.state.result()?.result||''],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='claude-answer.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);}
}
