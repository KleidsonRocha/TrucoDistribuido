import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,appendFileSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {DurableStore,emptyCheckpoint,digest,reconcile,GENESIS} from '../server/storage.ts';
import {emptyState} from '../server/state.ts';
const dir=()=>{mkdirSync(resolve('.test-data'),{recursive:true});return mkdtempSync(resolve('.test-data','wal-'));};
const epoch={counter:1,leaderId:3};
function operation(){const body={index:1,epoch,previousHash:GENESIS,commandId:'test-command',commandName:'PRESENCE',state:emptyState(),result:null,participants:[1,2,3]};return {...body,hash:digest(body)};}
test('WAL persists decisions and Lamport, truncates incomplete tail, rejects bad certificates and old epochs',()=>{
  const directory=dir();let store=new DurableStore(directory);store.promise(epoch);store.install({...emptyCheckpoint(),installedEpoch:epoch,members:[1,2,3]});assert.equal(store.tick(9),10);const op=operation();store.prepare(op);
  assert.throws(()=>store.decide({index:1,epoch,hash:op.hash,preparedBy:[1,3]}));assert.equal(store.version,0);
  store.decide({index:1,epoch,hash:op.hash,preparedBy:[1,2,3]});store.close();appendFileSync(join(directory,'journal.ndjson'),'{"partial":');
  store=new DurableStore(directory);assert.equal(store.version,1);assert.equal(store.hash,op.hash);assert.equal(store.tick(),11);assert.throws(()=>store.promise({counter:0,leaderId:0}));store.close();
  assert.equal(readFileSync(join(directory,'journal.ndjson'),'utf8').endsWith('\n'),true);
});
test('reconciliation discards only prepared operations and stale orphan decisions from superseded epochs',()=>{
  const store=new DurableStore(dir());store.promise(epoch);store.install({...emptyCheckpoint(),installedEpoch:epoch,members:[1,2,3]});const before=structuredClone(store.checkpoint);const op=operation();store.prepare(op);assert.deepEqual(reconcile([store.checkpoint,before]),before);
  store.decide({index:1,epoch,hash:op.hash,preparedBy:[1,2,3]});const decided=structuredClone(store.checkpoint);assert.equal(reconcile([before,decided]).last.index,1);
  const newEpoch={...before,installedEpoch:{counter:2,leaderId:2},members:[1,2]};assert.equal(reconcile([decided,newEpoch]).last,null);store.close();
});
test('corrupt complete WAL record stops startup instead of silently resetting the match',()=>{
  const directory=dir(),store=new DurableStore(directory);store.tick();store.close();const file=join(directory,'journal.ndjson');writeFileSync(file,readFileSync(file,'utf8').replace('"lamport":1','"lamport":2'));assert.throws(()=>new DurableStore(directory),/checksum/);
});
