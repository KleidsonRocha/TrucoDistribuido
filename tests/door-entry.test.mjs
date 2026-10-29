import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
import React,{act} from 'react';

test('entrada permite foco, digitacao, validacao e clique em DOM normal, sem Canvas',async()=>{
  const window=new Window({url:'http://localhost:5173'});
  const globals={window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,HTMLInputElement:window.HTMLInputElement,Event:window.Event,MouseEvent:window.MouseEvent,IS_REACT_ACT_ENVIRONMENT:true};
  const originals=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
  let root;
  try {
    const {createRoot}=await import('react-dom/client');
    const {DoorEntryForm}=await server.ssrLoadModule('/src/DoorEntryForm.tsx');
    let entries=0;
    const fieldRef=React.createRef();
    function Harness(){
      const [nickname,setNickname]=React.useState('');
      const [error,setError]=React.useState('');
      const [walking,setWalking]=React.useState(false);
      return React.createElement('main',{style:{pointerEvents:'none'}},React.createElement(DoorEntryForm,{
        nickname,error,walking,inputRef:fieldRef,onNickname:setNickname,
        onEnter:event=>{event.preventDefault();if(nickname.trim().length<2){setError('Use um apelido com 2 a 20 caracteres.');return;}setError('');setWalking(true);entries++;},
      }));
    }
    const css=await readFile(new URL('../src/world3d.css',import.meta.url),'utf8');
    const sheet=document.createElement('style');sheet.textContent=css;document.head.appendChild(sheet);
    const host=document.createElement('div');host.className='three-mode';document.body.appendChild(host);root=createRoot(host);
    await act(async()=>{root.render(React.createElement(Harness));});
    const input=host.querySelector('input[name="nickname"]');const button=host.querySelector('button[type="submit"]');
    assert.ok(input&&button);
    assert.equal(host.querySelector('canvas'),null);
    assert.equal(window.getComputedStyle(host.querySelector('.three-entry-form')).pointerEvents,'auto');
    assert.equal(window.getComputedStyle(host.querySelector('.three-entry-form')).position,'fixed');
    assert.equal(window.getComputedStyle(input).pointerEvents,'auto');
    assert.equal(window.getComputedStyle(button).pointerEvents,'auto');
    await act(async()=>{button.click();});
    assert.equal(entries,0);assert.equal(input.getAttribute('aria-invalid'),'true');
    fieldRef.current.focus();assert.equal(document.activeElement,input);
    await act(async()=>{
      // Usa o setter nativo para representar uma edicao do usuario em input controlado.
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'Argilafilho');
      input.dispatchEvent(new window.Event('input',{bubbles:true}));
    });
    assert.equal(input.value,'Argilafilho');
    await act(async()=>{button.click();});
    assert.equal(entries,1);assert.equal(input.disabled,true);assert.equal(button.disabled,true);
    await act(async()=>{button.click();});assert.equal(entries,1);
    assert.match(css,/\.three-entry-form\{[^}]*pointer-events:auto/);
    const app=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');
    const world=await readFile(new URL('../src/World3D.tsx',import.meta.url),'utf8');
    assert.match(app,/<DoorEntryForm/);assert.ok(!world.includes('props.entryForm'));
  } finally {
    if(root)await act(async()=>{root.unmount();});
    await server.close();await window.happyDOM.close();
    for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
  }
});
