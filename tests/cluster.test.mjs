import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createServer} from 'node:net';

import {Client,sleep,until} from './support/client.mjs';
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('three real processes: private game, full match, failover, sync and uncertain-command recovery',{timeout:240000},async t=>{
  await mkdir(resolve('.test-data'),{recursive:true});
  const directory=await mkdtemp(resolve('.test-data','cluster-'));
  const token='neuro-integration-test-private-token';
  const nodes=await Promise.all([1,2,3].map(async id=>({id,url:`http://127.0.0.1:${await freePort()}`})));
  const processes=new Map(),logs=[];const clients=[];const timings=[];
  function start(id){const node=nodes[id-1];const child=spawn(process.execPath,['--experimental-strip-types','server/index.ts'],{cwd:resolve('.'),env:{...process.env,NODE_ID:String(id),PORT:new URL(node.url).port,PEERS_JSON:JSON.stringify(nodes),CLUSTER_TOKEN:token,DATA_DIR:resolve(directory,String(id)),HEARTBEAT_INTERVAL_MS:'300',FAILURE_TIMEOUT_MS:'1200',RPC_TIMEOUT_MS:'700',COORDINATOR_TIMEOUT_MS:'2500',PLAYER_GRACE_MS:'60000',ENABLE_TEST_FAULTS:'1'},stdio:['ignore','pipe','pipe']});processes.set(id,child);child.stdout.on('data',data=>logs.push(`${id}: ${data}`));child.stderr.on('data',data=>logs.push(`${id}: ${data}`));}
  async function stop(id){const p=processes.get(id);if(p&&p.exitCode===null&&p.signalCode===null){p.kill('SIGKILL');await new Promise(r=>p.once('exit',r));}}
  async function statuses(){return Promise.all(nodes.map(n=>fetch(n.url+'/status',{signal:AbortSignal.timeout(600)}).then(r=>r.json()).catch(()=>null)));}
  async function stable(count=3){try{return await until(async()=>{const all=(await statuses()).filter(Boolean);const leader=all.find(s=>s.role==='LEADER'&&s.ready);return all.length===count&&leader&&leader.members.length===count&&all.every(s=>s.ready&&s.leaderId===leader.nodeId&&s.epoch.counter===leader.epoch.counter&&s.hash===leader.hash)?leader:false;},`stable ${count}`);}catch(error){await writeFile(resolve(directory,'unstable.json'),JSON.stringify({statuses:await statuses(),logs},null,2));throw error;}}
  async function connectAll(){clients.forEach(c=>c.close());await Promise.all(clients.map(c=>c.connect()));await sleep(800);}
  async function arm(id,stage){const response=await fetch(nodes[id-1].url+'/internal/rpc',{method:'POST',headers:{'content-type':'application/json','x-cluster-token':token},body:JSON.stringify({protocolVersion:1,requestId:randomUUID(),from:id===1?2:1,to:id,lamport:1,epoch:{counter:0,leaderId:0},type:'FAULT',payload:stage})}).then(r=>r.json());assert.equal(response.type,'REPLY');}
  async function scenario(name,work){let failure;const started=performance.now();await t.test(name,async()=>{try{await work();timings.push({name,ms:Math.round(performance.now()-started)});}catch(error){failure=error;await writeFile(resolve(directory,'scenario-failure.json'),JSON.stringify({name,error:error.stack,statuses:await statuses(),logs},null,2));throw error;}});if(failure)throw failure;}
  try{
    await scenario('staggered startup: node 3 synchronizes before competing',async()=>{
      start(1);start(2);assert.equal((await stable(2)).nodeId,2);start(3);assert.equal((await stable()).nodeId,3);
      const events=(await statuses())[2].events;const synced=events.findIndex(e=>e.type==='SYNC_READY');const election=events.findIndex(e=>e.type==='ELECTION_STARTED');assert.ok(synced>=0&&election>synced);
    });
    const a=new Client(nodes,'Ana'),b=new Client([...nodes].reverse(),'Beto');clients.push(a,b);await connectAll();
    const created=await a.command('CREATE_ROOM');await b.command('JOIN_ROOM',{kind:'JOIN',code:created.state.room.code});
    await a.command('READY');await b.command('READY');await until(()=>a.state.room?.phase==='PLAYING','dealt');
    assert.equal(a.state.room.you.cards.length,3);assert.equal(b.state.room.you.cards.length,3);
    assert.equal(a.state.room.opponent.cards,undefined);assert.equal(a.state.room.deck,undefined);
    const invalid=await b.send(b.make('PLAY_CARD',{kind:'CARD',cardId:b.state.room.you.cards[0]}));assert.equal(invalid.result.code,'NOT_YOUR_TURN');
    const card=a.state.room.you.cards[0],command=a.make('PLAY_CARD',{kind:'CARD',cardId:card});const ack=await a.send(command);assert.equal(ack.result.ok,true);
    const version=ack.result.version;const duplicate=await a.send(command);assert.deepEqual(duplicate.result,ack.result);assert.equal(a.state.room.you.cards.includes(card),false);
    const confirmed=await stable();assert.ok(confirmed.version>=version);
    await scenario('protocol rejects malformed JSON, repeated HELLO, tokenless RPC and old epoch; Lamport respects receive',async()=>{
      const probe=new Client(nodes,'Protocolo');await probe.connect();probe.stopped=true;
      probe.socket.send('{');await until(()=>probe.messages.some(m=>m.type==='ERROR'&&m.code==='INVALID_MESSAGE'),'JSON rejection');
      const closed=once(probe.socket,'close');probe.socket.send(JSON.stringify(probe.identity));assert.equal((await closed)[0],1008);probe.close();
      assert.equal((await fetch(nodes[0].url+'/internal/rpc',{method:'POST',body:'{}'})).status,403);
      const rpc=async(to,from,type,epoch,lamport=0)=>fetch(nodes[to-1].url+'/internal/rpc',{method:'POST',headers:{'content-type':'application/json','x-cluster-token':token},body:JSON.stringify({protocolVersion:1,requestId:randomUUID(),from,to,lamport,epoch,type,payload:{}})}).then(r=>r.json());
      const rejected=await rpc(1,3,'PREPARE',{counter:0,leaderId:0});assert.equal(rejected.type,'FAIL');assert.equal(rejected.payload.code,'STALE_EPOCH');
      const before=(await statuses())[2];const remote=before.lamport+100;const reply=await rpc(3,1,'HEARTBEAT',before.epoch,remote);assert.ok(reply.lamport>remote);
      const receive=(await statuses())[2].events.find(e=>e.type==='RECEIVE_HEARTBEAT'&&e.lamport===remote+1);assert.ok(receive);
      const count=a.messages.length;a.socket.send(JSON.stringify({...command,payload:{kind:'CARD',cardId:command.payload.cardId==='copas_04'?'espadas_01':'copas_04'}}));await until(()=>a.messages.slice(count).some(m=>m.type==='ERROR'&&m.code==='COMMAND_ID_REUSED'),'UUID-content rejection');
    });
    await scenario('follower crash, majority continuation, returning node sync',async()=>{
      await stop(1);await stable(2);await connectAll();
      await b.command('PLAY_CARD',{kind:'CARD',cardId:b.state.room.you.cards[0]});
      const before=structuredClone(b.state.room);start(1);await stable();await connectAll();
      assert.deepEqual(b.state.room.score,before.score);assert.deepEqual(b.state.room.played,before.played);
    });
    await scenario('leader crash preserves acknowledged room and cards',async()=>{
      const before=structuredClone(a.state.room);await stop(3);assert.equal((await stable(2)).nodeId,2);await connectAll();
      assert.deepEqual(a.state.room.you.cards,before.you.cards);assert.deepEqual(a.state.room.score,before.score);assert.deepEqual(a.state.room.played,before.played);
      assert.deepEqual((await a.send(command)).result,ack.result);
      start(3);assert.equal((await stable()).nodeId,3);await connectAll();
    });
    await scenario('cold restart preserves mid-hand cards, score, played cards and turn',async()=>{
      const before=structuredClone(a.state.room);clients.forEach(c=>c.close());await Promise.all(nodes.map(n=>stop(n.id)));nodes.forEach(n=>start(n.id));await stable();await connectAll();
      assert.deepEqual(a.state.room.you.cards,before.you.cards);assert.deepEqual(a.state.room.played,before.played);assert.deepEqual(a.state.room.score,before.score);assert.equal(a.state.room.turnSeat,before.turnSeat);
    });
    await scenario('play until five wins and unanimous rematch',async()=>{
      for(let guard=0;guard<220;guard++){
        const room=a.state.room;if(room.phase==='MATCH_FINISHED')break;
        if(room.phase==='PLAYING'){const c=room.turnSeat===room.you.seat?a:b;await c.command('PLAY_CARD',{kind:'CARD',cardId:c.state.room.you.cards[0]});}
        else {const name=room.phase==='TRICK'?'NEXT_TRICK':'NEXT_HAND';await a.command(name);await b.command(name);}
        await until(()=>a.state.version===b.state.version,'both views');
      }
      assert.equal(a.state.room.phase,'MATCH_FINISHED');assert.equal(Math.max(...a.state.room.score),5);
      const matchId=a.state.room.matchId;await a.command('REMATCH');await b.command('REMATCH');await until(()=>a.state.room.phase==='PLAYING','rematch');assert.notEqual(a.state.room.matchId,matchId);assert.deepEqual(a.state.room.score,[0,0]);
      await a.command('LEAVE_ROOM');await b.command('LEAVE_ROOM');
    });
    await scenario('follower dies after durable PREPARE: ACK waits for a recovered configuration',async()=>{
      const before=await stable();const c=new Client([...nodes].reverse(),'Preparo-seguidor');clients.push(c);await c.connect();const pending=c.make('CREATE_ROOM');await arm(1,'follower_after_prepare');const reply=await c.send(pending);assert.equal(reply.result.ok,true);
      const leader=await stable(2);assert.ok(leader.epoch.counter>before.epoch.counter);assert.deepEqual(leader.members,[2,3]);assert.equal(c.state.rooms.filter(r=>r.nicknames.includes(c.name)).length,1);
      start(1);await stable();await c.command('LEAVE_ROOM');c.close();clients.splice(clients.indexOf(c),1);
    });
    for(const stage of ['before_prepare','after_one_prepare','after_prepare','after_local_decide','after_one_decide','after_applied','before_ack']){
      await scenario(`leader exits ${stage}: same command resolves once`,async()=>{
        const leader=await stable();const c=new Client(nodes,`Teste-${stage.slice(0,8)}`);clients.push(c);await c.connect();
        const pending=c.make('CREATE_ROOM');await arm(leader.nodeId,stage);
        const response=await c.send(pending);assert.equal(response.result.ok,true);
        assert.equal(c.state.rooms.filter(r=>r.nicknames.includes(c.name)).length,1);
        const roomId=c.state.room.id;assert.deepEqual((await c.send(pending)).result,response.result);
        start(leader.nodeId);await stable();await connectAll();assert.equal(c.state.room.id,roomId);
        await c.command('LEAVE_ROOM');c.close();clients.splice(clients.indexOf(c),1);
      });
    }
    await scenario('two unavailable nodes pause writes; restoration resolves the pending UUID once',async()=>{
      const c=new Client([...nodes].reverse(),'Sem-quorum');clients.push(c);await c.connect();const pending=c.make('CREATE_ROOM');const oldVersion=c.state.version;const offset=c.messages.length;
      await Promise.all([stop(1),stop(2)]);if(c.socket.readyState===1)c.socket.send(JSON.stringify(pending));
      await until(async()=>!(await statuses())[2]?.ready,'no writable leader');await sleep(1600);
      assert.equal(c.messages.slice(offset).some(m=>m.type==='ACK'&&m.commandId===pending.commandId),false);assert.equal((await statuses())[2].visibleVersion,oldVersion);
      start(1);start(2);await stable();assert.equal((await c.send(pending)).result.ok,true);assert.equal(c.state.rooms.filter(r=>r.nicknames.includes(c.name)).length,1);await c.command('LEAVE_ROOM');c.close();clients.splice(clients.indexOf(c),1);
    });
    const all=await statuses();assert.ok(all.every(s=>s.lamport>0));
    await writeFile(resolve(directory,'result.json'),JSON.stringify({passed:true,timings,nodes:all.map(({nodeId,role,version,hash,lamport,epoch})=>({nodeId,role,version,hash,lamport,epoch})),logs},null,2));
  }catch(error){await writeFile(resolve(directory,'failure.json'),JSON.stringify({error:error.stack,statuses:await statuses(),logs},null,2));throw error;}
  finally{clients.forEach(c=>c.close());await Promise.all(nodes.map(n=>stop(n.id)));}
});
