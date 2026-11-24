import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {DemoControl,createDemoHandler} from '../server/demo-control.ts';

const password='neuro-demo-test-password';
function fixture(){
  const calls=[],audit=[];
  const containers=[1,2,3].map(id=>({Id:String(id).repeat(64),Config:{Labels:{'com.docker.compose.project':'neuro','com.docker.compose.service':`game-${id}`,'com.docker.compose.oneoff':'False'}},State:{Running:true,Paused:false,Restarting:false}}));
  const samples=[1,2,3].map(nodeId=>({nodeId,role:nodeId===3?'LEADER':'FOLLOWER',ready:true,eligible:true,leaderId:3,epoch:{counter:4,leaderId:3},lamport:100,version:8,visibleVersion:8,hash:'same-state',members:[1,2,3],uptimeMs:1000,peers:[],events:[]}));
  let beforeAction=async()=>{};
  const docker=async(method,path)=>{
    calls.push({method,path});
    if(method==='GET'&&path.startsWith('/containers/json?'))return containers.map(container=>({Id:container.Id,Labels:container.Config.Labels}));
    const match=path.match(/^\/containers\/([a-f0-9]{64})\/(json|start|stop)(?:\?t=2)?$/);
    assert.ok(match,`Unexpected Docker API call ${path}`);
    const container=containers.find(container=>container.Id===match[1]);assert.ok(container);
    if(method==='GET')return structuredClone(container);
    await beforeAction();container.State.Running=match[2]==='start';return null;
  };
  const control=new DemoControl({docker,project:'neuro',status:async id=>samples[id-1],audit:event=>audit.push(event)});
  return {control,containers,samples,calls,audit,setBeforeAction:value=>{beforeAction=value;}};
}
async function httpFixture(t,options={}){
  const fake=fixture();let time=1000;
  const handler=createDemoHandler({password,control:fake.control,now:()=>time});
  const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,method='GET',body,headers={})=>{
    const response=await fetch(base+path,{method,headers:{...(method!=='GET'?{origin:base}:{}),...headers},body:body!==undefined?JSON.stringify(body):undefined});
    return {response,status:response.status,body:await response.json()};
  };
  const login=async()=>{
    const result=await call('/api/demo/session','POST',{password});assert.equal(result.status,200);
    return {cookie:result.response.headers.get('set-cookie').split(';')[0],'x-demo-csrf':result.body.csrfToken};
  };
  return {...fake,base,call,login,advance:ms=>{time+=ms;}};
}

test('demo requires a server password, expiring cookie and CSRF; logout revokes the session',async t=>{
  assert.throws(()=>createDemoHandler({password:'short',control:fixture().control}));
  const fake=await httpFixture(t);
  const locked=await fake.call('/api/demo/session');assert.equal(locked.body.authenticated,false);assert.equal(locked.body.csrfToken,null);
  assert.equal((await fake.call('/api/demo/state')).status,401);
  assert.equal((await fake.call('/api/demo/nodes/3/stop','POST',{})).status,401);
  assert.equal((await fake.call('/api/demo/session','POST',{password:'wrong'})).status,401);
  assert.equal(fake.calls.length,0);
  const headers=await fake.login();
  assert.equal((await fake.call('/api/demo/nodes/3/stop','POST',{}, {cookie:headers.cookie})).status,403);
  assert.equal((await fake.call('/api/demo/nodes/3/stop','POST',{}, {...headers,origin:'https://evil.example'})).status,403);
  assert.equal((await fake.call('/api/demo/state','GET',undefined,headers)).body.nodes.length,3);
  assert.equal((await fake.call('/api/demo/session','DELETE',undefined,headers)).status,200);
  assert.equal((await fake.call('/api/demo/state','GET',undefined,headers)).status,401);
  const next=await fake.login();fake.advance(20*60_000+1);
  assert.equal((await fake.call('/api/demo/nodes/3/stop','POST',{},next)).status,401);
  assert.equal(fake.calls.some(call=>call.method==='POST'),false);
});

test('demo login uses secure HttpOnly cookies behind HTTPS and limits password attempts',async t=>{
  const fake=await httpFixture(t);
  const result=await fake.call('/api/demo/session','POST',{password},{'x-forwarded-proto':'https',origin:fake.base.replace('http:','https:')});
  assert.equal(result.status,200);assert.match(result.response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Path=\/api\/demo; Max-Age=1200; Secure/);
  for(let i=0;i<7;i++)assert.equal((await fake.call('/api/demo/session','POST',{password:'wrong'})).status,401);
  assert.equal((await fake.call('/api/demo/session','POST',{password})).status,429);
  fake.advance(60_001);assert.equal((await fake.call('/api/demo/session','POST',{password})).status,200);
});

test('authenticated stop targets only the selected Neuro container; second stop is blocked and start restores it',async t=>{
  const fake=await httpFixture(t);const headers=await fake.login();
  const stopped=await fake.call('/api/demo/nodes/3/stop','POST',{},headers);assert.equal(stopped.status,200);assert.equal(fake.containers[2].State.Running,false);
  assert.equal((await fake.call('/api/demo/nodes/2/stop','POST',{},headers)).status,409);
  assert.equal((await fake.call('/api/demo/nodes/3/start','POST',{},headers)).status,200);assert.equal(fake.containers[2].State.Running,true);
  assert.deepEqual(fake.calls.filter(call=>call.method==='POST'),[{method:'POST',path:`/containers/${'3'.repeat(64)}/stop?t=2`},{method:'POST',path:`/containers/${'3'.repeat(64)}/start`}]);
  assert.deepEqual(fake.audit.map(event=>[event.node,event.action]),[[3,'stop'],[3,'start']]);
});

test('demo rejects unrelated services, arbitrary Docker operations and unstable replication',async t=>{
  const fake=await httpFixture(t);const headers=await fake.login();
  for(const path of ['/api/demo/nodes/4/stop','/api/demo/nodes/frontend/stop','/api/demo/nodes/3/exec','/api/demo/containers/remove'])assert.equal((await fake.call(path,'POST',{},headers)).status,404);
  fake.samples[0].hash='not-synchronized';assert.equal((await fake.call('/api/demo/nodes/3/stop','POST',{},headers)).status,409);
  fake.samples[0].hash='same-state';fake.samples[0].ready=false;assert.equal((await fake.call('/api/demo/nodes/3/stop','POST',{},headers)).status,409);
  fake.samples[0].ready=true;fake.containers[2].Config.Labels['com.docker.compose.project']='another-project';
  assert.equal((await fake.call('/api/demo/nodes/3/start','POST',{},headers)).status,409);
  assert.equal(fake.calls.some(call=>call.method==='POST'),false);
});

test('only one container operation can run at a time',async()=>{
  const fake=fixture();let release;let entered;
  const started=new Promise(resolve=>{entered=resolve;});fake.setBeforeAction(()=>{entered();return new Promise(resolve=>{release=resolve;});});
  const first=fake.control.action(3,'stop');await started;
  await assert.rejects(fake.control.action(2,'stop'),error=>error.status===409);
  release();await first;assert.equal(fake.calls.filter(call=>call.method==='POST').length,1);
});

test('public gateway keeps demo off by default and forwards login, cookies and protected actions when enabled',async t=>{
  const fake=await httpFixture(t);
  async function gateway(enabled){
    const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    const child=spawn(process.execPath,['--experimental-strip-types','server/gateway.ts'],{cwd:resolve('.'),env:{...process.env,PORT:String(port),GATEWAY_NODES_JSON:JSON.stringify([1,2,3].map(id=>({id,url:`http://game-${id}:3000`}))),DEMO_CONTROLLER_URL:enabled?fake.base:''},stdio:['ignore','pipe','pipe']});
    let logs='';child.stdout.on('data',data=>{logs+=data;});child.stderr.on('data',data=>{logs+=data;});
    t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill();await once(child,'exit');}});
    const base=`http://127.0.0.1:${port}`;
    for(let i=0;i<100;i++){
      if(child.exitCode!==null)throw new Error(logs);
      try{if((await fetch(base+'/health')).ok)return base;}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    throw new Error(`Gateway did not start: ${logs}`);
  }
  const disabled=await gateway(false);
  assert.deepEqual(await fetch(disabled+'/api/demo/session').then(response=>response.json()),{enabled:false,authenticated:false,csrfToken:null});
  assert.equal((await fetch(disabled+'/api/demo/nodes/3/stop',{method:'POST',body:'{}'})).status,404);
  const enabled=await gateway(true);
  const login=await fetch(enabled+'/api/demo/session',{method:'POST',headers:{origin:enabled.replace('http:','https:'),'x-forwarded-proto':'https'},body:JSON.stringify({password})});
  assert.equal(login.status,200);const session=await login.json();const cookie=login.headers.get('set-cookie');assert.match(cookie,/; Secure/);
  const headers={cookie:cookie.split(';')[0],origin:enabled,'x-demo-csrf':session.csrfToken};
  assert.equal((await fetch(enabled+'/api/demo/session',{headers}).then(response=>response.json())).authenticated,true);
  const stopped=await fetch(enabled+'/api/demo/nodes/3/stop',{method:'POST',headers,body:'{}'});assert.equal(stopped.status,200,await stopped.text());assert.equal(fake.containers[2].State.Running,false);
  assert.equal((await fetch(enabled+'/api/demo/nodes/3/start',{method:'POST',headers,body:'x'.repeat(2049)})).status,413);
  assert.equal(fake.containers[2].State.Running,false);
});
