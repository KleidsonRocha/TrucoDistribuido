import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Canvas} from '@react-three/fiber';
import {createServer} from 'vite';

test('fallback do Canvas permanece dentro dele, sem portal ou aviso sobre a cena valida',async()=>{
  const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
  try {
    const {CanvasFallback,SceneBoundary}=await server.ssrLoadModule('/src/SceneBoundary.tsx');
    let mounted=0;
    function Fallback(){mounted++;return React.createElement(CanvasFallback,{onUse2D(){}});}
    const html=renderToStaticMarkup(React.createElement(Canvas,{fallback:React.createElement(Fallback)}));
    // O proprio Canvas monta o fallback em browsers normais. Ele nao pode gerar portal.
    assert.equal(mounted,1);
    const start=html.indexOf('<canvas');const end=html.indexOf('</canvas>');
    const message=html.indexOf('class="canvas-fallback"');
    assert.ok(start>=0&&message>start&&message<end,html);
    assert.ok(!html.includes('class="graphics-fallback"'));
    assert.ok(!html.includes('role="alert"'));
    const healthy=renderToStaticMarkup(React.createElement(SceneBoundary,{onUse2D(){}},React.createElement('span',null,'Cenario disponivel')));
    assert.equal(healthy,'<span>Cenario disponivel</span>');
    const state=SceneBoundary.getDerivedStateFromError(new Error('Falha real do renderizador'));
    assert.equal(state.error.message,'Falha real do renderizador');
  } finally {await server.close();}
});
