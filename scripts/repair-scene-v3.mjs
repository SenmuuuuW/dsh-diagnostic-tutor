/** Repair v3 scene artifacts using Schema + Visual errors; no human edits. */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync, copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { validateSceneSpec, formatValidationErrors } from '../research/dynamic-lesson-engine/scene-spec.mjs'
import { visualLintScene } from '../src/scene/visual-lint.js'

const args = Object.fromEntries(process.argv.slice(2).reduce((all,value,index,list)=>{if(value.startsWith('--'))all.push([value.slice(2),list[index+1]]);return all},[]))
const token=args.token; const ids=args.ids.split(','); const folder=args.folder??'blind'
const rawDir=`/tmp/udt-scene-v3/${folder}`; const outRoot=join(process.cwd(),'research/dynamic-lesson-engine/v3/generated',folder); mkdirSync(outRoot,{recursive:true})
let report=''
for(const id of ids){
 const path=join(rawDir,`${id}.scene.json`); const spec=JSON.parse(readFileSync(path,'utf8'))
 const schema=validateSceneSpec(spec)
 let errors=[]
 if(!schema.ok) errors=formatValidationErrors(schema.errors).split('\n')
 else { const visual=visualLintScene(spec); errors=visual.diagnostics.filter((d)=>d.severity==='error').map((d)=>`${d.code} ${d.primitiveId??''}: ${d.message}`) }
 if(errors.length) report+=`\n### ${id}\n${errors.join('\n')}\n`
}
if(report===''){console.log('all valid; nothing to repair');process.exit(0)}
const prompt=`Existing SceneSpec files in /tmp/udt-scene-v3/${folder}/ failed Schema or Visual Quality validation. Repair only those files in place with the write tool. Preserve the teaching idea; fix named fields rather than randomly rewriting. Every primitive must explicitly style fill and stroke; text must use fields x,y,text,fontSize,fill,anchor (NOT textAnchor); properties is a required array (use [] when none). Do not add code, HTML, URLs or event handlers. Errors:\n${report}\nWrite complete corrected JSON files and reply "repaired".`
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--remote-debugging-port=9594','--user-data-dir=/tmp/udt-v09-repair-browser','--no-first-run','--no-default-browser-check','--disable-gpu','--window-size=1440,1100','about:blank'],{stdio:'ignore'})
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let target
for(let i=0;i<120;i++){try{const list=await(await fetch('http://127.0.0.1:9594/json/list')).json();target=list.find(e=>e.type==='page'&&e.webSocketDebuggerUrl);if(target)break}catch{}await sleep(100)}
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});let seq=0;const pending=new Map();const errors=[]
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails?.exception?.description??m.params.exceptionDetails?.text);const p=pending.get(m.id);if(p){pending.delete(m.id);p(m.result)}})
const send=(method,params={})=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}))});const evaluate=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result?.value
await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:`http://127.0.0.1:8513/?${token}`});await sleep(2500)
await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue');b&&b.click()})()`);await sleep(500);await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().startsWith('New Session'));b&&b.click()})()`);await sleep(1800);await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Continue');b&&b.click()})()`);await sleep(400);await evaluate(`(()=>{const e=document.querySelector('[contenteditable=true]');e&&e.focus();return !!e})()`)
await send('Input.insertText',{text:prompt});await sleep(600);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13})
const before=Object.fromEntries(ids.map(id=>[id,existsSync(join(rawDir,`${id}.scene.json`))?statSync(join(rawDir,`${id}.scene.json`)).mtimeMs:0]))
for(let i=0;i<300;i++){await sleep(1000);const changed=ids.filter(id=>existsSync(join(rawDir,`${id}.scene.json`))&&statSync(join(rawDir,`${id}.scene.json`)).mtimeMs>before[id]);if(i%20===0)console.log('wait',i,changed.length,'/',ids.length);if(changed.length===ids.length)break}
for(const id of ids)if(existsSync(join(rawDir,`${id}.scene.json`)))copyFileSync(join(rawDir,`${id}.scene.json`),join(outRoot,`${id}.scene.json`))
console.log(JSON.stringify({errors,body:String(await evaluate('document.body.innerText')).slice(-1000)},null,2));ws.close();chrome.kill('SIGTERM')
