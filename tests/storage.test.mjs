import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,appendFileSync,readFileSync,writeFileSync,readdirSync,statSync,unlinkSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {DurableStore,emptyCheckpoint,digest,reconcile,GENESIS} from '../server/storage.ts';
import {emptyState} from '../server/state.ts';
const dir=()=>{mkdirSync(resolve('.test-data'),{recursive:true});return mkdtempSync(resolve('.test-data','wal-'));};
const epoch={counter:1,leaderId:3};
function operation(index=1,previousHash=GENESIS,state=emptyState()){const body={index,epoch,previousHash,commandId:'test-command',commandName:'PRESENCE',state,result:null,participants:[1,2,3]};return {...body,hash:digest(body)};}
function event(i,type='COMMAND_ACK'){return {id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,at:new Date().toISOString(),nodeId:3,lamport:i,type,detail:`Evento relevante ${i}`,epoch,index:1,commandId:null};}
function journals(directory){return readdirSync(directory).filter(name=>/^journal(?:\.\d+)?\.ndjson$/.test(name));}
test('WAL persists decisions and Lamport, truncates incomplete tail, rejects bad certificates and old epochs',()=>{
  const directory=dir();let store=new DurableStore(directory);store.promise(epoch);store.install({...emptyCheckpoint(),installedEpoch:epoch,members:[1,2,3]});assert.equal(store.tick(9),10);const op=operation();store.prepare(op);
  assert.throws(()=>store.decide({index:1,epoch,hash:op.hash,preparedBy:[1,3]}));assert.equal(store.version,0);
  store.decide({index:1,epoch,hash:op.hash,preparedBy:[1,2,3]});store.close();appendFileSync(join(directory,'journal.ndjson'),'{"partial":');
  store=new DurableStore(directory);assert.equal(store.version,1);assert.equal(store.hash,op.hash);assert.ok(store.tick()>10);assert.throws(()=>store.promise({counter:0,leaderId:0}));store.close();
  assert.equal(readFileSync(join(directory,'journal.ndjson'),'utf8').endsWith('\n'),true);
});
test('reconciliation discards only prepared operations and stale orphan decisions from superseded epochs',()=>{
  const store=new DurableStore(dir());store.promise(epoch);store.install({...emptyCheckpoint(),installedEpoch:epoch,members:[1,2,3]});const before=structuredClone(store.checkpoint);const op=operation();store.prepare(op);assert.deepEqual(reconcile([store.checkpoint,before]),before);
  store.decide({index:1,epoch,hash:op.hash,preparedBy:[1,2,3]});const decided=structuredClone(store.checkpoint);assert.equal(reconcile([before,decided]).last.index,1);
  const newEpoch={...before,installedEpoch:{counter:2,leaderId:2},members:[1,2]};assert.equal(reconcile([decided,newEpoch]).last,null);store.close();
});
test('corrupt complete WAL record stops startup instead of silently resetting the match',()=>{
  const directory=dir(),store=new DurableStore(directory);store.tick();store.promise(epoch);store.close();const file=join(directory,'journal.ndjson');writeFileSync(file,readFileSync(file,'utf8').replace('"lamport":1','"lamport":2'));assert.throws(()=>new DurableStore(directory),/checksum/);
});

test('idle Lamport ticks do not append CLOCK records or rewrite recovery within the reserved block',()=>{
  const directory=dir();let store=new DurableStore(directory);store.tick();
  const journal=readFileSync(join(directory,'journal.ndjson'),'utf8'),recovery=readFileSync(join(directory,'recovery.json'),'utf8');
  for(let i=0;i<1000;i++)store.tick();
  assert.equal(readFileSync(join(directory,'journal.ndjson'),'utf8'),journal);assert.equal(readFileSync(join(directory,'recovery.json'),'utf8'),recovery);
  const sent=store.lamport;store.close();store=new DurableStore(directory);assert.ok(store.tick()>sent);store.close();
});

test('bounded journals retain recent events while large pending state, decisions and dedup survive rotation',()=>{
  const directory=dir(),options={maxBytes:4096,keepFiles:3};let store=new DurableStore(directory,options);
  store.promise(epoch);store.install({...emptyCheckpoint(),installedEpoch:epoch,members:[1,2,3]});
  const state=emptyState();for(let i=0;i<80;i++)state.dedup[`session:${i}`]={digest:digest(i),result:{ok:true,version:i,roomId:null}};
  const op=operation(1,GENESIS,state);store.prepare(op);
  for(let i=0;i<200;i++)store.recordEvent(event(i,['ELECTION_STARTED','COMMAND_ACK','FAULT_INJECTED'][i%3]));
  assert.equal(store.history.length,100);assert.equal(journals(directory).length,3);
  assert.ok(journals(directory).every(name=>statSync(join(directory,name)).size<=4096));assert.ok(statSync(join(directory,'recovery.json')).size>4096);
  store.close();store=new DurableStore(directory,options);assert.equal(store.pending.hash,op.hash);assert.equal(store.version,0);assert.equal(store.history.at(-1).id,event(199).id);
  assert.ok(store.history.some(e=>e.type==='FAULT_INJECTED'));assert.ok(store.history.some(e=>e.type==='COMMAND_ACK'));
  store.decide({index:1,epoch,hash:op.hash,preparedBy:[1,2,3]});store.promise({counter:2,leaderId:2});
  for(let i=200;i<250;i++)store.recordEvent(event(i));store.close();
  store=new DurableStore(directory,options);assert.equal(store.hash,op.hash);assert.deepEqual(store.state,state);assert.deepEqual(store.promised,{counter:2,leaderId:2});assert.equal(store.pending,null);store.close();
});

test('legacy CLOCK-heavy WAL migrates to a durable checkpoint and bounded summaries without losing a decision',()=>{
  const directory=dir(),op=operation();let legacy='';
  const record=(kind,payload,lamport)=>{const body={kind,payload,lamport};legacy+=JSON.stringify({...body,checksum:digest(body)})+'\n';};
  record('PROMISE',epoch,0);record('INSTALL',{...emptyCheckpoint(),installedEpoch:epoch,members:[1,2,3]},0);
  for(let i=1;i<=4000;i++)record('CLOCK',null,i);
  record('PREPARE',op,4001);record('DECIDE',{index:1,epoch,hash:op.hash,preparedBy:[1,2,3]},4002);
  writeFileSync(join(directory,'journal.ndjson'),legacy);assert.ok(Buffer.byteLength(legacy)>65536);
  let store=new DurableStore(directory,{maxBytes:4096,keepFiles:3});assert.equal(store.hash,op.hash);assert.equal(store.version,1);assert.ok(store.tick()>4002);store.close();
  const history=journals(directory).map(name=>readFileSync(join(directory,name),'utf8')).join('');
  assert.doesNotMatch(history,/"kind":"CLOCK"/);assert.doesNotMatch(history,/"state":/);assert.match(history,/"kind":"DECIDE"/);
  assert.ok(journals(directory).every(name=>statSync(join(directory,name)).size<=4096));
  store=new DurableStore(directory);assert.equal(store.hash,op.hash);assert.deepEqual(store.state,op.state);store.close();
});

test('a partial checkpoint replacement cannot damage the installed checkpoint; missing or corrupt recovery is rejected',()=>{
  const directory=dir();let store=new DurableStore(directory);store.promise(epoch);const op=operation();store.prepare(op);store.decide({index:1,epoch,hash:op.hash,preparedBy:[1,2,3]});store.close();
  const checkpoint=readFileSync(join(directory,'recovery.json'),'utf8');writeFileSync(join(directory,'recovery.json.next'),'{"partial":');
  store=new DurableStore(directory);assert.equal(store.hash,op.hash);store.close();
  unlinkSync(join(directory,'recovery.json'));assert.throws(()=>new DurableStore(directory),/Checkpoint de recuperação ausente/);
  writeFileSync(join(directory,'recovery.json'),checkpoint.replace('"formatVersion":1','"formatVersion":2'));assert.throws(()=>new DurableStore(directory),/checksum/);
});

test('reducing retention to one file prunes archives but preserves state and pending preparations from a fenced epoch',()=>{
  const directory=dir();let store=new DurableStore(directory,{maxBytes:4096,keepFiles:3});store.promise(epoch);const op=operation();store.prepare(op);store.promise({counter:2,leaderId:2});
  for(let i=0;i<100;i++)store.recordEvent(event(i));store.close();
  assert.equal(journals(directory).length,3);store=new DurableStore(directory,{maxBytes:4096,keepFiles:1});
  assert.deepEqual(journals(directory),['journal.ndjson']);assert.equal(store.pending.hash,op.hash);assert.deepEqual(store.promised,{counter:2,leaderId:2});
  assert.throws(()=>store.decide({index:1,epoch,hash:op.hash,preparedBy:[1,2,3]}),/época antiga/);store.close();
});
