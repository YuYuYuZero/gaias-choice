const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor(tag) { this.tagName=tag; this.children=[];this.attrs={};this.events={};this.style={setProperty(){}};this.classList={add(){},remove(){},toggle(){}};this.dataset={}; }
  pause(){this.paused=true} play(){this.paused=false;return Promise.resolve()} load(){} removeAttribute(k){delete this.attrs[k];if(k==='src')this._src=''}
  append(...x){this.children.push(...x)} appendChild(x){this.children.push(x)}
  setAttribute(k,v){this.attrs[k]=v} addEventListener(k,f){this.events[k]=f}
  set src(v){this._src=v;const load=this.onload;queueMicrotask(()=>load?.())} get src(){return this._src}
}
function setup() {
  let id=0;const timers=new Map();
  const window={matchMedia:()=>({matches:false})};
  const document={hidden:false,createElement:tag=>new Element(tag),addEventListener(){}};
  vm.runInNewContext(fs.readFileSync('storyboard.js','utf8'),{window,document,Image:Element,setTimeout:f=>{timers.set(++id,f);return id},clearTimeout:i=>timers.delete(i)});
  const stage=new Element(),captions=[],states=[];
  const player=window.GaiaStoryboard.create({stage,onCaption:t=>captions.push(t),onState:s=>states.push(s.finished)});
  return {api:window.GaiaStoryboard,player,root:stage.children[0],timers,captions,states};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('all 15 finite sequences have complete shots and existing local image assets',()=>{
  const {api}=setup();assert.equal(Object.keys(api.scenes).length,15);
  for(const key of ['opening',...Array.from({length:5},(_,i)=>[`${i+1}A`,`${i+1}B`]).flat(),'keep','refuse','rewrite','reunion']) {
    assert.ok(api.scenes[key].length >= 3);
    for(const shot of api.scenes[key]) { assert.ok(fs.existsSync(api.images[shot[0]]),api.images[shot[0]]); if(shot[6]?.video) assert.ok(fs.existsSync(shot[6].video)); }
  }
});
test('each branch finishes exactly once after all shots, retaining final caption',async()=>{
  const {api,player,root,captions,timers}=setup();const next=root.children[3].children[2];
  for(const [key,shots] of Object.entries(api.scenes)) {
    let complete=0;player.play(key);player.after(()=>complete++);await flush();
    for(let i=0;i<shots.length;i++){next.events.click();await flush();}
    assert.equal(complete,1,key);assert.equal(captions.at(-1),shots.at(-1)[1]);assert.equal(timers.size,0);
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
  next.events.click();await flush();assert.equal(states.at(-1),false);
  next.events.click();assert.equal(states.at(-1),true);
  pause.events.click();assert.equal(states.at(-1),false);await flush();
  player.stop();assert.equal(states.at(-1),true);
});


test('next swaps both image and caption, ignores clicks during load, and reloads the first frame of a new branch',async()=>{
  const {api,player,root,captions}=setup();
  player.play('opening');await flush();
  const oldCaption=captions.at(-1), oldImage=root.dataset.shot;
  player.next();player.next(); // second click is ignored until the image is ready
  assert.equal(captions.at(-1),oldCaption);
  await flush();assert.equal(root.dataset.index,'1');assert.notEqual(root.dataset.shot,oldImage);
  assert.equal(captions.at(-1),api.scenes.opening[1][1]);
  player.play('1B');await flush();assert.equal(root.dataset.index,'0');
  assert.equal(root.dataset.shot,api.scenes['1B'][0][0]);
});

test('video is preferred when ready, resets on next, and errors fall back to the matching still',async()=>{
  const {player,root,captions}=setup();const video=root.children[4];
  player.play('opening');await flush();assert.ok(video.src.endsWith('opening.mp4'));
  video.onloadeddata();assert.equal(video.hidden,false);assert.equal(video.currentTime,0);
  const late=video.onloadeddata;
  player.next();await flush();assert.equal(video.hidden,true);assert.equal(video.src,'');
  late();assert.equal(video.hidden,true);
  player.play('opening');await flush();const caption=captions.at(-1);
  video.onerror();assert.equal(video.hidden,true);assert.equal(root.dataset.shot,'opening');assert.equal(captions.at(-1),caption);
});

test('adjacent captions have distinct illustrations and every selected branch refreshes its first image',()=>{
  const {api}=setup();
  for(const [key,shots] of Object.entries(api.scenes))for(let i=1;i<shots.length;i++)assert.notEqual(shots[i][0],shots[i-1][0],key+':'+i);
  for(let d=1;d<=5;d++){
    const parents=d===1?['opening']:[(d-1)+'A',(d-1)+'B'];
    for(const parent of parents)for(const side of ['A','B'])assert.notEqual(api.scenes[parent].at(-1)[0],api.scenes[d+side][0][0],parent+' → '+d+side);
  }
});
