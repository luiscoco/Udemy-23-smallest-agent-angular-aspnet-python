import {Component,Input,OnChanges,signal} from '@angular/core';
import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import csharp from 'highlight.js/lib/languages/csharp';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import powershell from 'highlight.js/lib/languages/powershell';
import json from 'highlight.js/lib/languages/json';
import ini from 'highlight.js/lib/languages/ini';
import xml from 'highlight.js/lib/languages/xml';
import bash from 'highlight.js/lib/languages/bash';
import DOMPurify from 'dompurify';
import {Marked} from 'marked';
for(const [name,grammar]of Object.entries({python,csharp,typescript,javascript,powershell,json,ini,xml,bash}))hljs.registerLanguage(name,grammar);
function escape(text:string){return text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
export function highlight(code:string,language:string){return DOMPurify.sanitize(hljs.getLanguage(language)?hljs.highlight(code,{language,ignoreIllegals:true}).value:escape(code));}
export function renderMarkdown(text:string){
  const markdown=new Marked({renderer:{code:({text,lang})=>`<pre><code class="hljs">${highlight(text,(lang||'').split(/\s/)[0])}</code></pre>`,image:()=>''}});
  return DOMPurify.sanitize(markdown.parse(text,{async:false}),{FORBID_TAGS:['script','style','iframe','img','video','audio','form'],FORBID_ATTR:['style']});
}
@Component({selector:'app-code',template:`<div class="code-component"><div class="code-block"><div class="snippet-language">{{language.toUpperCase()}} <button (click)="copy()">Copy code</button><span role="status">{{notice()}}</span></div><pre tabindex="0"><code class="hljs" [innerHTML]="html"></code></pre></div></div>`})
export class CodeComponent implements OnChanges {
 @Input({required:true})code='';@Input()language='typescript';html='';notice=signal('');
 ngOnChanges(){this.html=highlight(this.code,this.language);this.notice.set('');}
 async copy(){try{await navigator.clipboard.writeText(this.code);this.notice.set('Copied');}catch{this.notice.set('Select the code to copy it.');}}
}
@Component({selector:'app-answer',template:'<div class="markdown" [innerHTML]="html"></div>'})
export class AnswerComponent implements OnChanges {@Input()text='';html='';ngOnChanges(){this.html=renderMarkdown(this.text);}}
