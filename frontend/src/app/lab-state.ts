import {Injectable,signal,OnDestroy} from '@angular/core';
import {createApi} from './api';
import {isAgentResult,type AgentResult,type TimelineMessage} from './types';
import {authorizedFetch,type PublicConfig} from './auth';

@Injectable({providedIn:'root'})
export class LabState implements OnDestroy {
  prompt=signal('Hello world!');mode=signal<'stream'|'simple'>('stream');
  status=signal('idle');error=signal('');notice=signal('');elapsed=signal(0);
  partial=signal('');result=signal<AgentResult|null>(null);messages=signal<TimelineMessage[]>([]);
  health=signal('Checking backend…');dark=signal(false);apiUrl=signal('');
  private locked=false;private active:AbortController|null=null;
  readonly ready=this.configure();
  constructor(){try{this.applyTheme(localStorage.getItem('agent23-theme')==='dark');}catch{}}
  private async configure(){
    try {
      const response=await fetch('/config.json');if(!response.ok)throw Error();
      const config=await response.json() as PublicConfig;
      if(typeof config.apiUrl!=='string')throw Error();
      if(config.apiUrl){const url=new URL(config.apiUrl);if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw Error();}
      this.apiUrl.set(config.apiUrl.replace(/\/$/,''));
      await this.checkHealth();
    }catch{this.health.set('API unavailable · check config.json and setup');}
  }
  async checkHealth(){try{const h=await createApi(this.apiUrl(),authorizedFetch).health(AbortSignal.timeout(15000));this.health.set(h.api_key_configured?'Backend connected · key configured':'Backend connected · API key not configured');}catch{this.health.set('Backend offline · check setup and service tokens');}}
  private applyTheme(dark:boolean){this.dark.set(dark);document.documentElement.classList.toggle('dark',dark);}
  toggleTheme(){this.applyTheme(!this.dark());try{localStorage.setItem('agent23-theme',this.dark()?'dark':'light');}catch{}}
  async run(){
    const trimmed=this.prompt().trim();
    if(this.locked||!trimmed||trimmed.length>4000)return;
    this.locked=true;this.status.set('running');this.error.set('');this.result.set(null);this.partial.set('');this.messages.set([]);this.notice.set('');
    const controller=new AbortController();this.active=controller;const started=performance.now();this.elapsed.set(0);
    const ticker=setInterval(()=>this.elapsed.set(Math.round(performance.now()-started)),100);
    const timeout=setTimeout(()=>controller.abort(),195000);
    let final:AgentResult|null=null;
    try {
      await this.ready;controller.signal.throwIfAborted();
      const api=createApi(this.apiUrl(),authorizedFetch);
      if(this.mode()==='simple')final=await api.query(trimmed,controller.signal);
      else await api.stream(trimmed,message=>{
        if(message.type==='AssistantMessage'&&'text' in message.data&&typeof message.data.text==='string')this.partial.set(message.data.text);
        if(this.messages().length<500)this.messages.update(rows=>[...rows,{...message,elapsed:Math.round(performance.now()-started)}]);
        if(message.type==='ResultMessage'&&isAgentResult(message.data)){final=message.data;this.result.set(final);}
      },controller.signal);
      if(!final)throw Error('The agent finished without a final result.');
      this.result.set(final);this.status.set(final.is_error?'error':'success');
      if(final.is_error)this.error.set('The agent could not complete this prompt. Check the server configuration.');
    }catch(error){const detail=controller.signal.aborted?'Request cancelled or timed out.':error instanceof Error?error.message:'The request failed.';this.error.set(detail);this.notice.set(detail);this.status.set('error');}
    finally{clearInterval(ticker);clearTimeout(timeout);this.active=null;this.locked=false;this.elapsed.set(Math.round(performance.now()-started));}
  }
  cancel(){this.active?.abort();}
  ngOnDestroy(){this.cancel();}
}
