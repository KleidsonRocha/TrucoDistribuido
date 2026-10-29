import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {Client,until,sleep} from '../tests/support/client.mjs';
const run=promisify(execFile);
const base=process.env.NEURO_TEST_URL??'http://127.0.0.1:8080';
const nodes=[1,2,3].map(id=>({id,url:`${base}/nodes/${id}`}));
const stopped=new Set(),evidence=[];
const a=new Client(nodes,'Verifica-A'),b=new Client([...nodes].reverse(),'Verifica-B');
async function statuses(){return Promise.all(nodes.map(n=>fetch(n.url+'/status',{signal:AbortSignal.timeout(3000)}).then(r=>{if(!r.ok)throw new Error();return r.json();}).catch(()=>null)));}
async function stable(count){const result=await until(async()=>{const all=(await statuses()).filter(Boolean),leader=all.find(s=>s.role==='LEADER'&&s.ready);return all.length===count&&leader?.members.length===count&&all.every(s=>s.ready&&s.leaderId===leader.nodeId&&s.epoch.counter===leader.epoch.counter&&s.hash===leader.hash&&s.visibleVersion===s.version)?all:false;},`Docker stable ${count}`,60000);evidence.push({at:new Date().toISOString(),nodes:result.map(({nodeId,role,version,hash,lamport,epoch,members})=>({nodeId,role,version,hash,lamport,epoch,members}))});return result;}
async function connect(){a.close();b.close();await Promise.all([a.connect(),b.connect()]);if(a.state.room&&b.state.room)await until(()=>!a.state.room.paused&&!b.state.room.paused,'players online',15000);await sleep(100);}
async function stop(id){stopped.add(id);await run('docker',['compose','stop','-t','1',`game-${id}`]);console.log(`Stopped game-${id}`);}
async function start(id){await run('docker',['compose','start',`game-${id}`]);stopped.delete(id);console.log(`Started game-${id}`);}
try{
  await stable(3);assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/cards/espadas_01.png')).status,200);
  assert.equal((await fetch(base+'/nodes/1/internal/rpc',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/internal/rpc')).status,404);
  await connect();await a.command('CREATE_ROOM');await b.command('JOIN_ROOM',{kind:'JOIN',code:a.state.room.code});await a.command('READY');await b.command('READY');await until(()=>a.state.room?.phase==='PLAYING','dealt');
  assert.equal(a.state.room.opponent.cards,undefined);assert.equal(a.state.room.you.cards.length,3);
  const command=a.make('PLAY_CARD',{kind:'CARD',cardId:a.state.room.you.cards[0]});const acknowledged=await a.send(command);assert.equal(acknowledged.result.ok,true);await until(()=>b.state.version===a.state.version,'views');await stable(3);
  await stop(1);await stable(2);await connect();await b.command('PLAY_CARD',{kind:'CARD',cardId:b.state.room.you.cards[0]});await until(()=>b.state.version===a.state.version,'views');
  const before=structuredClone(a.state.room);await start(1);await stable(3);await connect();assert.deepEqual(a.state.room.played,before.played);assert.deepEqual(a.state.room.score,before.score);
  const leader=(await statuses()).find(s=>s?.role==='LEADER'&&s.ready).nodeId;
  await stop(leader);await stable(2);await connect();assert.deepEqual(a.state.room.you.cards,before.you.cards);assert.deepEqual(a.state.room.played,before.played);assert.deepEqual(a.state.room.score,before.score);assert.deepEqual((await a.send(command)).result,acknowledged.result);
  await start(leader);await stable(3);await connect();await a.command('LEAVE_ROOM');await b.command('LEAVE_ROOM');await stable(3);
  await mkdir('.qa',{recursive:true});await writeFile('.qa/phase2-docker.json',JSON.stringify({passed:true,at:new Date().toISOString(),checks:['static frontend','original cards','internal routes blocked','two private WebSocket views','ACK deduplication','follower stop/continue/start','leader stop/reconnect/state preservation/start'],evidence},null,2));
  console.log('PASS: Docker, two WebSocket sessions, follower failure, leader failure, recovery and deduplication. Evidence: .qa/phase2-docker.json');
}catch(error){await mkdir('.qa',{recursive:true});await writeFile('.qa/docker-failure.json',JSON.stringify({error:error.stack,statuses:await statuses(),evidence},null,2));throw error;}finally{a.close();b.close();for(const id of stopped)await start(id);}
