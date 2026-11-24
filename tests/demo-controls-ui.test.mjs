import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
import React,{act} from 'react';

test('bathroom demo controls unlock, stop the leader, prevent another stop and restore the node',async()=>{
  const window=new Window({url:'http://localhost:5173'});const calls=[];
  const nodes=[1,2,3].map(id=>({id,running:true,paused:false}));let authenticated=false;
  const globals={window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,Event:window.Event,MouseEvent:window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true,
    fetch:async(path,options={})=>{
      calls.push({path,...options});let result;
      if(path==='/api/demo/session'){
        if(options.method==='POST'){assert.equal(JSON.parse(options.body).password,'test-password');authenticated=true;}
        if(options.method==='DELETE')authenticated=false;
        result={enabled:true,authenticated,csrfToken:authenticated?'test-csrf':null};
      }else if(path==='/api/demo/state')result={busy:false,nodes:structuredClone(nodes)};
      else {assert.equal(options.headers['x-demo-csrf'],'test-csrf');const match=path.match(/nodes\/([1-3])\/(stop|start)/);assert.ok(match);nodes[Number(match[1])-1].running=match[2]==='start';result={message:'Operação concluída.'};}
      return {ok:true,status:200,json:async()=>result};
    }};
  const originals=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  const vite=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});let root;
  try{
    const {createRoot}=await import('react-dom/client');const {DemoControls}=await vite.ssrLoadModule('/src/DemoControls.tsx');
    const host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);
    await act(async()=>{root.render(React.createElement(DemoControls,{leaderId:3,clusterReady:true}));});
    const button=text=>[...host.querySelectorAll('button')].find(element=>element.textContent.includes(text));
    assert.equal(button('Parar líder atual'),undefined);
    const input=host.querySelector('input[type="password"]');assert.ok(input);
    await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'test-password');input.dispatchEvent(new window.Event('input',{bubbles:true}));});
    await act(async()=>{host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});
    assert.equal(host.querySelector('input[type="password"]'),null);assert.equal(button('Parar líder atual').disabled,false);
    await act(async()=>{button('Parar líder atual').click();});
    assert.equal(nodes[2].running,false);assert.equal(button('Parar líder atual').disabled,true);
    assert.ok([...host.querySelectorAll('button')].filter(element=>element.textContent==='Parar container').every(element=>element.disabled));
    await act(async()=>{button('Religar container').click();});assert.equal(nodes[2].running,true);
    await act(async()=>{root.render(React.createElement(DemoControls,{leaderId:3,clusterReady:false}));});assert.equal(button('Parar líder atual').disabled,true);
    await act(async()=>{button('Bloquear controles').click();});assert.equal(button('Parar líder atual'),undefined);assert.ok(host.querySelector('input[type="password"]'));
    assert.equal(calls.filter(call=>call.path.endsWith('/stop')).length,1);assert.equal(calls.filter(call=>call.path.endsWith('/start')).length,1);
  }finally{
    if(root)await act(async()=>root.unmount());await vite.close();await window.happyDOM.close();
    for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
