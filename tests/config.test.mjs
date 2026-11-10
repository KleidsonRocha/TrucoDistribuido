import test from 'node:test';
import assert from 'node:assert/strict';
import {config,Peers} from '../server/config.ts';
const peers=[1,2,3].map(id=>({id,url:`http://game-${id}:3000`}));
const environment={NODE_ID:'1',PEERS_JSON:JSON.stringify(peers),CLUSTER_TOKEN:'test-configuration-token-32-bytes'};
test('external discovery configuration requires three distinct IDs and HTTP origins',()=>{
  assert.equal(config(environment).peers.length,3);
  for(const url of ['https://game-1:3000','http://user:pass@game-1:3000','http://game-1:3000/path','http://game-1:3000/?token=secret'])assert.equal(Peers.safeParse([{id:1,url},...peers.slice(1)]).success,false);
  assert.equal(Peers.safeParse([peers[0],peers[0],peers[2]]).success,false);
  assert.equal(Peers.safeParse([peers[0],{id:2,url:peers[0].url+'/'},peers[2]]).success,false);
});
test('configuration rejects missing/short cluster tokens and overly aggressive failure timeout',()=>{
  assert.throws(()=>config({...environment,CLUSTER_TOKEN:undefined}));assert.throws(()=>config({...environment,CLUSTER_TOKEN:'short'}));
  assert.throws(()=>config({...environment,HEARTBEAT_INTERVAL_MS:'1000',FAILURE_TIMEOUT_MS:'2000'}));
  assert.throws(()=>config({...environment,NODE_ID:'4'}));
});
test('demonstration journal defaults and configurable retention reject unsafe limits',()=>{
  assert.equal(config(environment).journalMaxBytes,65536);assert.equal(config(environment).journalKeepFiles,3);
  assert.equal(config({...environment,JOURNAL_MAX_BYTES:'4096',JOURNAL_KEEP_FILES:'1'}).journalMaxBytes,4096);
  for(const value of ['0','4095','invalid'])assert.throws(()=>config({...environment,JOURNAL_MAX_BYTES:value}));
  for(const value of ['0','11','1.5'])assert.throws(()=>config({...environment,JOURNAL_KEEP_FILES:value}));
});
