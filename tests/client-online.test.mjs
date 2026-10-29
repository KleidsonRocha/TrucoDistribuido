import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
import {randomUUID,randomBytes} from 'node:crypto';
import {applyCommand,emptyState,projectState} from '../server/state.ts';
import {secretHash} from '../server/storage.ts';

test('React online client reconnects and resends pending UUID unchanged; stale ACK requires explicit retry',async()=>{
  const window=new Window({url:'https://neuro.clayforgestudio.com.br'});
  const sockets=[],sent=[];let acknowledge=false;let response;
  const cluster={nodeId:3,leaderId:3,epoch:{counter:1,leaderId:3},lamport:20,ready:true};
  const identity={clientId:randomUUID(),resumeSecret:randomBytes(32).toString('hex')};
  window.sessionStorage.setItem('neuro.session.v2',JSON.stringify(identity));
  class Socket{
    static OPEN=1;readyState=0;
    constructor(url){this.url=String(url);sockets.push(this);setTimeout(()=>{this.readyState=1;this.onopen?.();},0);}
    send(raw){const m=JSON.parse(raw);if(m.type==='HELLO'){setTimeout(()=>this.onmessage?.({data:JSON.stringify({type:'WELCOME',protocolVersion:1,state:{version:0,identity:null,room:null,rooms:[]},cluster})}),0);return;}sent.push(m);if(acknowledge)setTimeout(()=>this.onmessage?.({data:JSON.stringify(response(m))}),0);}
    close(code=1000){if(this.readyState===3)return;this.readyState=3;setTimeout(()=>this.onclose?.({code}),0);}
  }
  const globals={window,document:window.document,navigator:window.navigator,location:window.location,sessionStorage:window.sessionStorage,WebSocket:Socket,fetch:async()=>({ok:true,json:async()=>({phase:2,nodes:[1,2,3].map(id=>({id,path:`/nodes/${id}`}))})}),IS_REACT_ACT_ENVIRONMENT:true};
  const originals=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});let root,client;
  async function wait(predicate){for(let i=0;i<100;i++){if(predicate())return;await act(async()=>{await new Promise(r=>setTimeout(r,30));});}throw new Error('Client state timeout');}
  try{
    const {createRoot}=await import('react-dom/client');const {useOnlineGame}=await server.ssrLoadModule('/src/network/useOnlineGame.ts');
    function Harness(){client=useOnlineGame('Ana');return React.createElement('span',null,client.connection);}
    root=createRoot(document.createElement('div'));await act(async()=>root.render(React.createElement(Harness)));await wait(()=>client.connection==='online');
    let pending;await act(async()=>{pending=client.command('CREATE_ROOM');});await wait(()=>sent.length===1);assert.equal(client.busy,true);
    assert.ok(window.sessionStorage.getItem('neuro.pending.v2'));
    const created=applyCommand(emptyState(),{key:secretHash(identity.resumeSecret),clientId:identity.clientId,nickname:'Ana'},sent[0],1,1000);
    response=m=>({type:'ACK',protocolVersion:1,commandId:m.commandId,result:created.result,state:projectState(created.state,secretHash(identity.resumeSecret),1),cluster});
    acknowledge=true;await act(async()=>sockets[0].close(1013));await wait(()=>sent.length===2&&!client.busy);
    assert.deepEqual(sent[1],sent[0]);assert.equal((await pending).ok,true);assert.equal(client.state.version,1);assert.equal(window.sessionStorage.getItem('neuro.pending.v2'),null);assert.equal(sockets[1].url,'wss://neuro.clayforgestudio.com.br/nodes/2/ws');
    response=m=>({type:'ACK',protocolVersion:1,commandId:m.commandId,result:{ok:false,version:2,code:'STALE_VERSION',message:'Confira a mesa e tente novamente.'},state:{...client.state,version:2},cluster});
    let rejected;await act(async()=>{rejected=client.command('READY').catch(e=>e);});await wait(()=>!client.busy);assert.equal((await rejected).code,'STALE_VERSION');assert.equal(sent.length,3);assert.equal(client.state.version,2);
  }finally{if(root)await act(async()=>root.unmount());await server.close();await window.happyDOM.close();for(const [key,value] of originals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
});
