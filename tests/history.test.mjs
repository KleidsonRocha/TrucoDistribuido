import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {Cluster} from '../server/cluster.ts';
import {config} from '../server/config.ts';

test('idle RPC traffic stays out of journals and does not evict durable election, game and failure events',async()=>{
  mkdirSync(resolve('.test-data'),{recursive:true});const directory=mkdtempSync(resolve('.test-data','history-'));
  const settings=config({NODE_ID:'3',PEERS_JSON:JSON.stringify([1,2,3].map(id=>({id,url:`http://game-${id}:3000`}))),CLUSTER_TOKEN:'history-test-token-at-least-24-chars',DATA_DIR:directory});
  let cluster=new Cluster(settings);cluster.event('ELECTION_STARTED','Líder ausente');
  const before=readFileSync(join(directory,'journal.ndjson'),'utf8');
  for(let i=0;i<1000;i++){
    const clock=cluster.store.tick();cluster.event('SEND_HEARTBEAT','Consulta de rotina',null,clock);cluster.event('RECEIVE_HEARTBEAT','Contato de rotina',null,clock);
    cluster.event('SEND_REPLY','Resposta de rotina',null,clock);cluster.event('RECEIVE_REPLY','Resposta de rotina',null,clock);
  }
  assert.equal(readFileSync(join(directory,'journal.ndjson'),'utf8'),before);
  assert.ok(cluster.status().events.some(e=>e.type==='ELECTION_STARTED'));assert.equal(cluster.status().events.filter(e=>e.type==='RECEIVE_HEARTBEAT').length,4);
  cluster.event('COMMAND_ACK','PLAY_CARD confirmado');cluster.event('FAULT_INJECTED','before_ack');await cluster.close();
  cluster=new Cluster(settings);assert.ok(cluster.status().events.some(e=>e.type==='ELECTION_STARTED'));assert.ok(cluster.status().events.some(e=>e.type==='COMMAND_ACK'));assert.ok(cluster.status().events.some(e=>e.type==='FAULT_INJECTED'));
  assert.equal(cluster.status().events.some(e=>e.type==='RECEIVE_HEARTBEAT'),false);await cluster.close();
});
