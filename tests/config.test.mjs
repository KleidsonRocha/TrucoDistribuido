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
