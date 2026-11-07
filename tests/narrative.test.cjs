const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('game.js','utf8');
function section(a,b){return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)))}
function setup(){
 const c={nodes:[],stepCache:{},jobFor:()=>null};vm.createContext(c);
 vm.runInContext(section('  var DECISIONS','  var sdk')+section('  function classify','  function jobFor')+section('  function actionOf','  function endingOf')+section('  var DEMO_TEXT','  // Pre-rendered opening')+section('  function demoNode','  function clearPlayer'),c);
 return c;
}
test('all 16 converging routes reach the core choice with ordered days and correct query history',()=>{
 for(let mask=0;mask<16;mask++){
 const c=setup(); let n=c.demoNode(null,'',c.DEMO_TEXT.open,[c.DECISIONS[1].a,c.DECISIONS[1].b]);c.nodes.push(n);let last=1;
 for(let d=1;d<=4;d++){const side=(mask>>(d-1))&1?'b':'a';n=c.demoTurn(n,c.DECISIONS[d][side]);c.nodes.push(n);assert.equal(n.ending,'none');assert.equal(c.stepOf(n),d+1);assert.ok(c.storyDay(n)>=last);last=c.storyDay(n);}
 assert.equal(c.pressedQuestion(n),!(mask&1));
 const room=c.demoTurn(n,c.DECISIONS[5].a);c.nodes.push(room);assert.ok(c.isRoom(room));assert.equal(room.ending,'none');
 const stay=c.demoTurn(n,c.DECISIONS[5].b);assert.equal(stay.ending,'loss');
 for(const ending of ['keep','refuse','rewrite'])assert.equal(c.demoTurn(room,c.FINAL[ending]).ending,ending==='rewrite'?'win':'loss');
 }
});
