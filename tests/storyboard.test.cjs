const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor() { this.children=[];this.attrs={};this.events={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.dataset={}; }
  append(...x){this.children.push(...x)} appendChild(x){this.children.push(x)}
  setAttribute(k,v){this.attrs[k]=v} addEventListener(k,f){this.events[k]=f}
  set src(v){this._src=v;const load=this.onload;queueMicrotask(()=>load?.())} get src(){return this._src}
}
function setup() {
  let id=0;const timers=new Map();
  const window={matchMedia:()=>({matches:false})};
  const document={hidden:false,createElement:()=>new Element(),addEventListener(){}};
  vm.runInNewContext(fs.readFileSync('storyboard.js','utf8'),{window,document,Image:Element,setTimeout:f=>{timers.set(++id,f);return id},clearTimeout:i=>timers.delete(i)});
  const stage=new Element(),captions=[],states=[];
  const player=window.GaiaStoryboard.create({stage,onCaption:t=>captions.push(t),onState:s=>states.push(s.finished)});
  return {api:window.GaiaStoryboard,player,root:stage.children[0],timers,captions,states};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('all 14 finite branches have 3 shots and existing local image assets',()=>{
  const {api}=setup();assert.equal(Object.keys(api.scenes).length,14);
  for(const key of ['opening',...Array.from({length:5},(_,i)=>[`${i+1}A`,`${i+1}B`]).flat(),'keep','refuse','rewrite']) {
    assert.equal(api.scenes[key].length,3);
    for(const shot of api.scenes[key]) assert.ok(fs.existsSync(api.images[shot[0]]),api.images[shot[0]]);
  }
});
test('each branch finishes exactly once after three shots, retaining final caption',async()=>{
  const {api,player,root,captions,timers}=setup();const next=root.children[3].children[2];
  for(const [key,shots] of Object.entries(api.scenes)) {
    let complete=0;player.play(key);player.after(()=>complete++);await flush();
    next.events.click();await flush();next.events.click();await flush();next.events.click();
    assert.equal(complete,1,key);assert.equal(captions.at(-1),shots[2][1]);assert.equal(timers.size,0);
    next.events.click();assert.equal(complete,1);
  }
});
test('pause cancels timer; switching branches discards old completion; stop cancels late loads',async()=>{
  const {player,root,timers,captions}=setup();const pause=root.children[3].children[1];let stale=0;
  player.play('1B');player.after(()=>stale++);await flush();assert.equal(timers.size,1);
  pause.events.click();assert.equal(timers.size,0);pause.events.click();assert.equal(timers.size,1);
  player.play('rewrite');await flush();player.finish();assert.equal(stale,0);
  player.play('2B');const length=captions.length;player.stop();await flush();
  assert.equal(captions.length,length);assert.equal(timers.size,0);assert.ok(root.hidden);
});

test('choices stay gated through loading, pause and last shot; replay immediately gates again',async()=>{
  const {player,root,states}=setup();const [,pause,next]=root.children[3].children;
  player.play('opening');assert.equal(states.at(-1),false);await flush();
  pause.events.click();assert.equal(states.at(-1),false);
  next.events.click();await flush();next.events.click();await flush();assert.equal(states.at(-1),false);
  next.events.click();assert.equal(states.at(-1),true);
  pause.events.click();assert.equal(states.at(-1),false);await flush();
  player.stop();assert.equal(states.at(-1),true);
});
