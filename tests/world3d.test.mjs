import test from 'node:test';
import assert from 'node:assert/strict';
import {Box3,CatmullRomCurve3,Matrix4,PerspectiveCamera,Vector3} from 'three';
import {BAR_SHELF,BATHROOM,BATHROOM_FRAME_WIDTH,BATHROOM_WAYPOINTS,RULES_BOARD,cameraPose,cameraFov,journeyView,TABLES} from '../src/scene/layout.ts';

function camera(view,width,height,room){
  const pose=cameraPose(view,room);
  const c=new PerspectiveCamera(cameraFov(view,width/height),width/height,.08,65);
  c.position.set(...pose.position);c.lookAt(...pose.lookAt);c.updateMatrixWorld();
  return c;
}

test('camera enquadra a porta 3D no desktop e celular, independentemente do formulario HTML',()=>{
  for(const [w,h] of [[1440,900],[390,844]]){
    const c=camera('entrada',w,h);
    for(const y of [.05,1.5,3.1]){
      const projected=new Vector3(0,y,2.15).project(c);
      assert.ok(Math.abs(projected.x)<.01);
      assert.ok(Math.abs(projected.y)<1&&projected.z<1&&projected.z>-1);
    }
  }
});

test('camera sentada olha para a mesa correta, acima do tampo e diante do adversario',()=>{
  for(const room of ['NEURO1','MESA02']){
    const [x,,z]=TABLES[room];
    const pose=cameraPose('mesa',room);
    assert.ok(pose.position[1]>.85);
    assert.ok(pose.position[2]>z+.68);
    for(const [w,h] of [[1440,900],[390,844]]){
      const c=camera('mesa',w,h,room);
      const center=new Vector3(x,.85,z).project(c);
      assert.ok(Math.abs(center.x)<.01&&Math.abs(center.y)<.2&&center.z<1);
      const opponent=new Vector3(x,1.24,z-1.05).project(c);
      assert.ok(Math.abs(opponent.x)<1&&Math.abs(opponent.y)<1&&opponent.z<1);
    }
  }
});

test('percursos terminam dentro do salao, junto a mesa e dentro do banheiro',()=>{
  const entry=cameraPose(journeyView('entry','entrada'));
  assert.ok(entry.position[2]<2&&entry.position[2]>-11);
  const wc=cameraPose(journeyView('bathroom','salao'));
  assert.ok(wc.position[0]>BATHROOM.entrance[0]&&wc.position[0]<BATHROOM.entrance[0]+BATHROOM.depth);
  assert.ok(Math.abs(wc.position[2]-BATHROOM.entrance[2])<BATHROOM.width/2);
  assert.ok(wc.lookAt[0]>wc.position[0]);
  assert.equal(BATHROOM_FRAME_WIDTH,BATHROOM.clearWidth+2*BATHROOM.jambWidth);
  assert.equal(journeyView('table','salao'),'mesa');
  assert.equal(journeyView(null,'painel'),'painel');
});

test('percurso do banheiro contorna os tampos e atravessa a abertura da porta',()=>{
  const start=cameraPose('salao').position;const end=cameraPose('painel').position;
  const route=new CatmullRomCurve3([start,...BATHROOM_WAYPOINTS,end].map(p=>new Vector3(...p)));
  const tables=[...Object.values(TABLES),[-3.7,0,-8.6],[2.3,0,-8.6]];
  let doorChecked=false;
  for(let i=0;i<=500;i++){
    const p=route.getPoint(i/500);
    assert.ok(p.y>1.2&&p.x>-6.3&&p.x<BATHROOM.entrance[0]+BATHROOM.depth);
    for(const [x,,z] of tables)assert.ok(Math.abs(p.x-x)>.98||Math.abs(p.z-z)>.76,'percurso atravessa um tampo');
    if(Math.abs(p.x-BATHROOM.entrance[0])<.08){assert.ok(Math.abs(p.z-BATHROOM.entrance[2])<BATHROOM.clearWidth/2-.1);doorChecked=true;}
  }
  assert.ok(doorChecked);
});

test('quadro nao cruza a prateleira e faces do banheiro ficam ocultas na espessura da parede',()=>{
  // Inclui a bandeja do giz, mais larga e espessa que a moldura do quadro.
  const board=new Box3(new Vector3(-1.05,-1.23,-.08),new Vector3(1.05,1.15,.21));
  board.applyMatrix4(new Matrix4().makeRotationY(Math.PI/2).setPosition(...RULES_BOARD.position));
  const shelf=new Box3().setFromCenterAndSize(new Vector3(...BAR_SHELF.position),new Vector3(...BAR_SHELF.size));
  assert.equal(board.intersectsBox(shelf),false);
  assert.ok(shelf.min.z-board.max.z>.3,'quadro e prateleira precisam de folga visivel');
  const internalFront=BATHROOM.entrance[0]+BATHROOM.shellRecess;
  const wallInside=BATHROOM.entrance[0];
  const wallOutside=wallInside+BATHROOM.wallThickness;
  assert.ok(internalFront>wallInside+.1,'faces do banheiro nao podem coincidir com a face visivel do salao');
  assert.ok(internalFront<wallOutside-.02,'o casco deve encontrar a parede sem deixar fresta externa');
});
