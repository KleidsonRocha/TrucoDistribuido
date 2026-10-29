import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useTexture } from '@react-three/drei';
import { CatmullRomCurve3, Group, Mesh, Object3D, Vector3, Quaternion, Matrix4, MathUtils, type PerspectiveCamera, type Texture } from 'three';
import { CanvasFallback, GraphicsFallback } from './SceneBoundary';
import { BAR_SHELF, BATHROOM, BATHROOM_FRAME_WIDTH, BATHROOM_WAYPOINTS, RULES_BOARD, cameraFov, cameraPose, journeyView, JOURNEY_MS, TABLES, type WorldView, type Journey, type Point } from './scene/layout';
import { worldTextures, type WorldTextures } from './scene/textures';

export type World3DProps={
  view:WorldView;journey:Journey;room:string;stable:boolean;lowQuality:boolean;
  opponentPresent:boolean;onDoorClick:()=>void;
  onRules:()=>void;onBathroom:()=>void;onSit:(code?:string)=>void;onCode:()=>void;onUse2D:()=>void;
};

export default function World3D(props:World3DProps) {
  const [yaw,setYaw]=useState(0);
  const [contextLost,setContextLost]=useState(false);
  const [interactionReady,setInteractionReady]=useState(false);
  const onCameraSettled=useCallback(()=>setInteractionReady(true),[]);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const onContextLost=useCallback((event:Event)=>{event.preventDefault();setContextLost(true);},[]);
  const lightTarget=useMemo(()=>{const object=new Object3D();object.position.set(0,0,-5);return object;},[]);
  useEffect(()=>{setYaw(0);},[props.view,props.journey]);
  useEffect(()=>{setInteractionReady(false);},[props.view,props.journey]);
  useEffect(()=>()=>{canvasRef.current?.removeEventListener('webglcontextlost',onContextLost);},[onContextLost]);
  const [initialCamera]=useState(()=>({position:cameraPose(props.view,props.room).position,fov:58,near:.08,far:65}));
  return <div className="three-world" aria-label="Ambiente 3D do bar Neuro">
    {!contextLost&&<Canvas
      shadows={!props.lowQuality}
      dpr={props.lowQuality?1:[1,1.5]}
      frameloop="demand"
      camera={initialCamera}
      gl={{antialias:!props.lowQuality,powerPreference:'high-performance',alpha:false}}
      fallback={<CanvasFallback onUse2D={props.onUse2D}/>}
      onCreated={({gl})=>{canvasRef.current=gl.domElement;gl.domElement.addEventListener('webglcontextlost',onContextLost);gl.toneMappingExposure=1.15;}}
    >
      <color attach="background" args={['#182122']}/>
      <fog attach="fog" args={['#202a24',17,43]}/>
      <hemisphereLight args={['#ffedcf','#59654d',1.6]}/>
      <ambientLight intensity={.35} color="#ffe2ba"/>
      <directionalLight position={[-4,7,8]} intensity={1.2} color="#c4d6dd"/>
      <primitive object={lightTarget}/>
      <spotLight position={[0,4.15,-3]} target={lightTarget} angle={1.18} penumbra={.75} intensity={115} distance={19} color="#ffd08a" castShadow={!props.lowQuality} shadow-mapSize-width={1024} shadow-mapSize-height={1024} shadow-bias={-.0004}/>
      <Suspense fallback={null}><BarGeometry {...props} interactionReady={interactionReady}/></Suspense>
      <CameraRig view={props.view} journey={props.journey} room={props.room} stable={props.stable} yaw={yaw} onSettled={onCameraSettled}/>
      <FramePump moving={!!props.journey} ambient={!props.stable&&(props.view==='salao'||props.view==='mesa')}/>
    </Canvas>}
    {contextLost&&<GraphicsFallback onUse2D={props.onUse2D} reason="context-lost"/>}
    {props.view==='salao'&&!props.journey&&interactionReady&&<div className="look-controls" aria-label="Olhar ao redor"><button aria-label="Olhar para a esquerda" onClick={()=>setYaw(Math.min(.65,yaw+.22))}>↶</button><button onClick={()=>setYaw(0)}>Olhar ao redor</button><button aria-label="Olhar para a direita" onClick={()=>setYaw(Math.max(-.65,yaw-.22))}>↷</button></div>}
    {!!props.journey&&<div className="journey-caption" role="status">{props.journey==='entry'?'Com licença… entrando no Neuro.':props.journey==='bathroom'?'Um instante… indo aos bastidores.':'Opa… essa mesa aqui mesmo.'}</div>}
  </div>;
}

function FramePump({moving,ambient}:{moving:boolean;ambient:boolean}) {
  const invalidate=useThree(s=>s.invalidate);
  useEffect(()=>{
    if(!moving&&!ambient)return;
    const timer=setInterval(()=>{if(!document.hidden)invalidate();},moving?16:50);
    return ()=>clearInterval(timer);
  },[moving,ambient,invalidate]);
  return null;
}

function CameraRig({view,journey,room,stable,yaw,onSettled}:{view:WorldView;journey:Journey;room:string;stable:boolean;yaw:number;onSettled:()=>void}) {
  const {camera,size,invalidate}=useThree();
  const perspective=camera as PerspectiveCamera;
  const targetFov=cameraFov(view,size.width/size.height);
  const start=useRef({position:camera.position.clone(),rotation:camera.quaternion.clone(),fov:perspective.fov,time:0,returning:false});
  const curve=useRef<CatmullRomCurve3|null>(null);
  const settled=useRef(false);
  const target=useMemo(()=>cameraPose(journeyView(journey,view),room),[view,journey,room]);
  const goal=useMemo(()=>{
    const position=new Vector3(...target.position);
    const look=new Vector3(...target.lookAt);
    if(!journey&&view==='salao')look.sub(position).applyAxisAngle(new Vector3(0,1,0),yaw).add(position);
    const rotation=new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(position,look,new Vector3(0,1,0)));
    return {position,rotation};
  },[target,yaw,view,journey]);
  useEffect(()=>{
    const returning=view==='salao'&&!journey&&camera.position.x>BATHROOM.entrance[0];
    start.current={position:camera.position.clone(),rotation:camera.quaternion.clone(),fov:perspective.fov,time:performance.now(),returning};
    const points=journey==='bathroom'?BATHROOM_WAYPOINTS:returning?[...BATHROOM_WAYPOINTS].reverse():null;
    curve.current=points?new CatmullRomCurve3([camera.position.clone(),...points.map(point=>new Vector3(...point)),goal.position.clone()]):null;
    settled.current=false;invalidate();
  },[goal,camera,perspective,targetFov,invalidate]);
  useFrame(()=>{
    const elapsed=performance.now()-start.current.time;
    const duration=stable?0:journey?JOURNEY_MS[journey]:start.current.returning?JOURNEY_MS.bathroom:450;
    const t=duration===0?1:Math.min(1,elapsed/duration);
    const eased=t*t*(3-2*t);
    perspective.fov=MathUtils.lerp(start.current.fov,targetFov,eased);
    perspective.updateProjectionMatrix();
    if(curve.current)curve.current.getPoint(eased,camera.position);
    else camera.position.lerpVectors(start.current.position,goal.position,eased);
    camera.quaternion.slerpQuaternions(start.current.rotation,goal.rotation,eased);
    if(journey&&!stable&&t<1){
      const envelope=Math.sin(Math.PI*t);
      camera.position.x+=Math.sin(t*Math.PI*5)*.065*envelope;
      camera.position.y+=Math.sin(t*Math.PI*9)*.032*envelope;
      camera.rotateZ(Math.sin(t*Math.PI*5)*.018*envelope);
    }
    if(t<1&&!document.hidden)invalidate();
    if(t===1&&!settled.current){settled.current=true;onSettled();}
  });
  return null;
}

type BoxProps={at:Point;size:Point;color?:string;map?:Texture;rotation?:Point;cast?:boolean;metal?:boolean};
function Box({at,size,color='#735036',map,rotation=[0,0,0],cast=false,metal=false}:BoxProps) {
  return <mesh position={at} rotation={rotation} castShadow={cast} receiveShadow><boxGeometry args={size}/><meshStandardMaterial color={color} map={map} roughness={metal ? .48 : .9} metalness={metal ? .45 : 0}/></mesh>;
}
function Label({at,size,map,rotation=[0,0,0]}:{at:Point;size:[number,number];map:Texture;rotation?:Point}) {
  return <mesh position={at} rotation={rotation}><planeGeometry args={size}/><meshBasicMaterial map={map} toneMapped={false}/></mesh>;
}

function BarGeometry(props:World3DProps&{interactionReady:boolean}) {
  const maps=useMemo(worldTextures,[]);
  useEffect(()=>()=>{Object.values(maps).forEach(map=>map.dispose());},[maps]);
  const busy=props.view==='salao'&&!props.journey&&props.interactionReady;
  return <>
    <Box at={[0,-.12,-3]} size={[28,.2,34]} color="#3c433b"/>
    <mesh position={[0,.001,-5]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[13,16]}/><meshStandardMaterial map={maps.floor} roughness={1}/></mesh>
    <Box at={[-6.65,2,-4.5]} size={[.3,4,13.4]} color="#a78344"/>
    <RightWall/>
    <Box at={[-6.47,.48,-4.5]} size={[.07,.95,13.2]} color="#687153"/>
    <Box at={[0,2,-11.2]} size={[13.4,4,.25]} color="#bd934d"/>
    <Box at={[0,4.2,-4.5]} size={[13.6,.22,13.5]} color="#424736"/>
    {[-1,-5,-9].map(z=><Box key={z} at={[0,3.97,z]} size={[13.4,.22,.2]} color="#303e2d"/>)}
    {[-4,4].map(x=><Box key={x} at={[x,3.99,-4.5]} size={[.17,.22,13.2]} color="#303e2d"/>)}
    <Facade maps={maps} open={props.view!=='entrada'||props.journey==='entry'} stable={props.stable} onDoorClick={props.view==='entrada'&&!props.journey?props.onDoorClick:undefined}/>
    <Box at={[0,2.95,-11.02]} size={[3.8,1.53,.1]} color="#465638"/>
    <Label at={[0,2.95,-10.96]} size={[3.6,1.35]} map={maps.neuro}/>
    <Label at={[0,1.7,-11.02]} size={[2,.75]} map={maps.poster}/>
    <Window at={[-3.95,2.35,-11.02]}/>
    <Window at={[-6.46,2.25,-5.1]} rotation={[0,Math.PI/2,0]}/>
    <BarCounter maps={maps}/>
    <RulesBoard maps={maps} active={busy} onRules={props.onRules}/>
    <Bathroom maps={maps} active={busy} open={props.view==='painel'||props.journey==='bathroom'} stable={props.stable} onEnter={props.onBathroom}/>
    {[[-3.7,-8.6],[2.3,-8.6]].map(([x,z],i)=><group key={x} position={[x,0,z]}>
      <Table maps={maps}/><Chair at={[0,0,1.05]}/><Chair at={[0,0,-1.05]} rotation={Math.PI}/>
      <Patron at={[0,0,1.05]} rotation={Math.PI} shirt={i===0?'#637450':'#926547'} animated={!props.stable}/>
      <Patron at={[0,0,-1.05]} shirt={i===0?'#8e7359':'#647c78'} animated={!props.stable} offset={2}/>
      <Suspense fallback={null}><AmbientCards offset={i} stable={props.stable}/></Suspense>
      {busy&&<Html center position={[0,1.5,0]} distanceFactor={8} zIndexRange={[7,0]}><span className="three-busy-label">Mesa {i+3} · jogo ilustrativo</span></Html>}
    </group>)}
    {Object.entries(TABLES).map(([code,at],i)=><group key={code} position={at}>
      <Table maps={maps} onClick={busy?()=>props.onSit(code):undefined}/>
      <Chair at={[0,0,1.05]}/><Chair at={[0,0,-1.05]} rotation={Math.PI}/>
      {props.view==='mesa'&&props.room===code&&props.opponentPresent&&<Patron at={[0,0,-1.05]} shirt="#687c50" animated={!props.stable}/>}
      {busy&&<Html center position={[0,1.15,.25]} distanceFactor={5.2} zIndexRange={[8,0]}><button className="three-table-note" onClick={()=>props.onSit(code)}><span>MESA 0{i+1} · LIVRE</span><strong>{i===0?'Puxe uma cadeira.':'Essa também é sua.'}</strong><small>Criar mesa e sentar →</small></button></Html>}
    </group>)}
    {[[-3.7,-8.6],[2.3,-8.6],[0,-3.5]].map(([x,z],i)=><Pendant key={i} at={[x,3.5,z]} lit={i<2}/>)}
    <Plant at={[5.75,0,-9.8]}/><Plant at={[-5.8,0,-10.4]}/>
    {busy&&<Html center position={[0,1.25,-1.7]} zIndexRange={[8,0]}><button className="three-invite" onClick={props.onCode}>Já te chamaram? <b>Tenho um código ↗</b></button></Html>}
  </>;
}

function Facade({maps,open,stable,onDoorClick}:{maps:WorldTextures;open:boolean;stable:boolean;onDoorClick?:()=>void}) {
  const door=useRef<Group>(null);
  const invalidate=useThree(s=>s.invalidate);
  useEffect(()=>{invalidate();},[open,invalidate]);
  useFrame((_,delta)=>{
    if(!door.current)return;
    const goal=open?-Math.PI*.46:0;
    door.current.rotation.y=stable?goal:MathUtils.damp(door.current.rotation.y,goal,4,Math.min(delta,.1));
    if(Math.abs(door.current.rotation.y-goal)>.001)invalidate();
  });
  return <group>
    <Box at={[-4.05,2.2,2]} size={[5.1,4.4,.3]} color="#bd954e"/>
    <Box at={[4.05,2.2,2]} size={[5.1,4.4,.3]} color="#bd954e"/>
    <Box at={[0,3.78,2]} size={[3.05,1.24,.3]} color="#bd954e"/>
    {[-4.05,4.05].map(x=><group key={x}><Box at={[x,.43,2.2]} size={[5.1,.86,.12]} color="#767a4e"/><Window at={[x,2.05,2.17]}/></group>)}
    <Box at={[0,3.78,2.25]} size={[3.28,1.2,.15]} color="#2b3c2d"/>
    <Label at={[0,3.78,2.34]} size={[3.06,1.1475]} map={maps.neuro}/>
    <Box at={[-1.38,1.56,2.13]} size={[.15,3.2,.25]} color="#42513a"/>
    <Box at={[1.38,1.56,2.13]} size={[.15,3.2,.25]} color="#42513a"/>
    <Box at={[0,3.11,2.13]} size={[2.9,.14,.25]} color="#42513a"/>
    <group ref={door} position={[-1.27,0,2.15]} onClick={onDoorClick?event=>{event.stopPropagation();onDoorClick();}:undefined}>
      <Box at={[1.27,1.5,0]} size={[2.5,3,.11]} color="#4e6246"/>
      <Box at={[1.27,1.62,.075]} size={[2.15,2.52,.05]} color="#3b4e3d"/>
      <Box at={[2.32,1.35,.16]} size={[.055,.34,.07]} color="#ceb47c" metal/>
    </group>
    {[-1.85,1.85].map(x=><group key={x} position={[x,2.8,2.4]}><Box at={[0,0,0]} size={[.1,.35,.12]} color="#2c3c2b"/><mesh position={[0,-.15,.1]}><sphereGeometry args={[.08,8,6]}/><meshStandardMaterial color="#ffe4a8" emissive="#ffd08a" emissiveIntensity={2}/></mesh><pointLight color="#ffd08c" intensity={17} distance={4}/></group>)}
    <Box at={[0,-.01,4.8]} size={[14,.14,5.2]} color="#5c6050"/>
    {[-5,-3,-1,1,3,5].map(x=><Box key={x} at={[x,.063,4.8]} size={[.018,.005,5.2]} color="#868572"/>)}
    <Plant at={[-5.4,.1,3.3]}/><Plant at={[5.4,.1,3.3]}/>
  </group>;
}

function Window({at,rotation=[0,0,0]}:{at:Point;rotation?:Point}) {
  return <group position={at} rotation={rotation}>
    <Box at={[0,0,0]} size={[2.6,1.5,.08]} color="#353e2d"/>
    <Box at={[0,0,.06]} size={[2.38,1.28,.03]} color="#6a7755"/>
    <Box at={[0,0,.08]} size={[2.2,1.1,.015]} color="#344b42"/>
    <Box at={[0,0,.1]} size={[.06,1.25,.03]} color="#a79a6d"/>
    <Box at={[0,0,.12]} size={[2.35,.06,.03]} color="#a79a6d"/>
  </group>;
}

function Table({maps,onClick}:{maps:WorldTextures;onClick?:()=>void}) {
  return <group onClick={onClick?event=>{event.stopPropagation();onClick();}:undefined}>
    <Box at={[0,.79,0]} size={[1.8,.11,1.36]} map={maps.wood} color="#d4a46d" cast/>
    {[-.3,.3].map(x=><Box key={x} at={[x,.848,0]} size={[.009,.004,1.35]} color="#5e432b"/>)}
    {[-.71,.71].flatMap(x=>[-.49,.49].map(z=><Box key={`${x}/${z}`} at={[x,.38,z]} size={[.065,.76,.065]} color="#344733" metal/>))}
    <Bottle at={[-.55,.86,-.32]}/>
    <mesh position={[-.26,.93,-.32]}><cylinderGeometry args={[.045,.04,.14,10]}/><meshStandardMaterial color="#e9ce8d" transparent opacity={.55} roughness={.15}/></mesh>
  </group>;
}

function Chair({at,rotation=0}:{at:Point;rotation?:number}) {
  return <group position={at} rotation={[0,rotation,0]}>
    <Box at={[0,.44,0]} size={[.53,.055,.47]} color="#778259"/>
    {[-.22,.22].flatMap(x=>[-.18,.18].map(z=><Box key={`${x}/${z}`} at={[x,z>.1 ? .51 : .22,z]} size={[.035,z>.1?1.02:.44,.035]} color="#4b6341" metal/>))}
    {[.7,.9].map(y=><Box key={y} at={[0,y,.19]} size={[.47,.055,.035]} color="#4b6341" metal/>)}
  </group>;
}

function Patron({at,rotation=0,shirt,animated,offset=0}:{at:Point;rotation?:number;shirt:string;animated:boolean;offset?:number}) {
  const arm=useRef<Group>(null);
  useFrame(({clock})=>{if(arm.current)arm.current.rotation.x=animated?Math.sin(clock.elapsedTime*.8+offset)*.12:0;});
  return <group position={at} rotation={[0,rotation,0]}>
    <Box at={[0,.8,0]} size={[.4,.55,.26]} color={shirt} cast/>
    <mesh position={[0,1.24,0]} castShadow><sphereGeometry args={[.155,10,8]}/><meshStandardMaterial color="#bc9471" roughness={1}/></mesh>
    <mesh position={[0,1.32,-.025]}><sphereGeometry args={[.155,10,6,0,Math.PI*2,0,Math.PI*.58]}/><meshStandardMaterial color="#393d2c"/></mesh>
    <Box at={[-.23,.89,.21]} size={[.115,.12,.53]} color="#bc9471" rotation={[.08,0,-.12]}/>
    <group ref={arm} position={[.23,.95,.04]}><Box at={[0,-.06,.2]} size={[.11,.12,.5]} color="#bc9471" rotation={[-.1,0,.12]}/></group>
    {[-.12,.12].map(x=><Box key={x} at={[x,.45,.2]} size={[.15,.16,.48]} color="#3b4939"/>)}
  </group>;
}

function AmbientCards({offset,stable}:{offset:number;stable:boolean}) {
  const maps=useTexture(['/cards/copas_04.png','/cards/oros_06.png','/cards/verso.png']);
  const card=useRef<Mesh>(null);
  useFrame(({clock})=>{if(card.current)card.current.position.z=stable ? .05 : .05+Math.sin(clock.elapsedTime*.65+offset)*.08;});
  return <group>
    <mesh ref={card} position={[-.14,.854,.05]} rotation={[-Math.PI/2,0,.18]}><planeGeometry args={[.17,.26]}/><meshStandardMaterial map={maps[offset%2]} roughness={1}/></mesh>
    <mesh position={[.12,.855,-.17]} rotation={[-Math.PI/2,0,-.2]}><planeGeometry args={[.17,.26]}/><meshStandardMaterial map={maps[2]} roughness={1}/></mesh>
  </group>;
}

function Pendant({at,lit}:{at:Point;lit:boolean}) {
  return <group position={at}>
    <Box at={[0,.3,0]} size={[.025,.7,.025]} color="#29392a"/>
    <mesh><coneGeometry args={[.32,.22,14,1,true]}/><meshStandardMaterial color="#61704c" metalness={.3} roughness={.6}/></mesh>
    <mesh position={[0,-.08,0]} rotation={[Math.PI/2,0,0]}><circleGeometry args={[.26,14]}/><meshBasicMaterial color="#f9d38c"/></mesh>
    {lit&&<pointLight position={[0,-.25,0]} intensity={28} distance={7} color="#ffd093"/>}
  </group>;
}
function Bottle({at}:{at:Point}) {
  return <group position={at}><mesh position={[0,.13,0]}><cylinderGeometry args={[.055,.055,.26,8]}/><meshStandardMaterial color="#566c36" roughness={.3}/></mesh><mesh position={[0,.3,0]}><cylinderGeometry args={[.025,.025,.12,8]}/><meshStandardMaterial color="#566c36"/></mesh><Box at={[0,.14,.052]} size={[.075,.085,.005]} color="#d4bf79"/></group>;
}
function BarCounter({maps}:{maps:WorldTextures}) {
  return <group>
    <Box at={[-5.35,.56,-5.4]} size={[1.8,1.12,4.9]} color="#52613c"/>
    <Box at={[-5.35,1.17,-5.4]} size={[2.02,.12,5.1]} map={maps.wood} color="#c69b64"/>
    <Box at={BAR_SHELF.position} size={BAR_SHELF.size} color="#72613b"/>
    {[-7,-6.4,-5.8,-5.2].map(z=><Bottle key={z} at={[-5.8,1.23,z]}/>)}
  </group>;
}
function RulesBoard({maps,active,onRules}:{maps:WorldTextures;active:boolean;onRules:()=>void}) {
  return <group position={RULES_BOARD.position} rotation={[0,Math.PI/2,0]} onClick={active?event=>{event.stopPropagation();onRules();}:undefined}>
    <Box at={[0,0,0]} size={[RULES_BOARD.width,RULES_BOARD.height,RULES_BOARD.depth]} color="#755337"/>
    <Label at={[0,0,.07]} size={[1.8,2.25]} map={maps.rules}/>
    <Box at={[0,-1.18,.12]} size={[2.1,.08,.18]} color="#755337"/>
    <Box at={[.42,-1.12,.14]} size={[.18,.025,.025]} color="#eee7cd"/>
    {active&&<Html center position={[0,-.8,.15]} distanceFactor={7} zIndexRange={[8,0]}><button className="three-chalk-link" onClick={onRules}>Ler o quadro ↗</button></Html>}
  </group>;
}

function RightWall() {
  const z=BATHROOM.entrance[2];
  const thickness=BATHROOM.wallThickness;
  const x=BATHROOM.entrance[0]+thickness/2;
  const half=BATHROOM_FRAME_WIDTH/2;
  const spans=[[-11.2,z-half],[z+half,2.2]];
  return <group>
    {spans.map(([from,to])=><group key={from}>
      <Box at={[x,2,(from+to)/2]} size={[thickness,4,to-from]} color="#b08b48"/>
      <Box at={[6.47,.48,(from+to)/2]} size={[.07,.95,to-from]} color="#687153"/>
    </group>)}
    <Box at={[x,(4+BATHROOM.openingHeight)/2,z]} size={[thickness,4-BATHROOM.openingHeight,BATHROOM_FRAME_WIDTH]} color="#b08b48"/>
  </group>;
}

function Bathroom({maps,active,open,stable,onEnter}:{maps:WorldTextures;active:boolean;open:boolean;stable:boolean;onEnter:()=>void}) {
  const door=useRef<Group>(null);
  const invalidate=useThree(s=>s.invalidate);
  const jambCenter=BATHROOM.clearWidth/2+BATHROOM.jambWidth/2;
  // O casco termina dentro da espessura da parede, sem coincidir com suas faces.
  // Terminar em z=0 deixava faixas coplanares visíveis do lado do salão.
  const shellDepth=BATHROOM.depth-BATHROOM.shellRecess;
  const shellCenter=-(BATHROOM.depth+BATHROOM.shellRecess)/2;
  useEffect(()=>{invalidate();},[open,invalidate]);
  useFrame((_,delta)=>{if(door.current){const goal=open?-1.5:0;door.current.rotation.y=stable?goal:MathUtils.damp(door.current.rotation.y,goal,5,Math.min(delta,.1));if(Math.abs(door.current.rotation.y-goal)>.002)invalidate();}});
  return <group position={BATHROOM.entrance} rotation={[0,BATHROOM.rotation,0]}>
    {[-BATHROOM.width/2,BATHROOM.width/2].map(x=><Box key={x} at={[x,1.7,shellCenter]} size={[.15,3.4,shellDepth]} map={maps.tiles} color="#e0ddc5"/>)}
    <Box at={[0,1.7,-BATHROOM.depth]} size={[BATHROOM.width,3.4,.18]} map={maps.tiles} color="#e0ddc5"/>
    <Box at={[0,-.01,shellCenter]} size={[BATHROOM.width,.08,shellDepth]} map={maps.tiles} color="#a8ad96"/>
    <Box at={[0,3.45,shellCenter]} size={[BATHROOM.width,.1,shellDepth]} color="#757e64"/>
    <Box at={[0,-.005,-.08]} size={[BATHROOM.clearWidth,.06,.56]} color="#647053"/>
    <pointLight position={[0,2.9,-2.6]} intensity={28} distance={6} color="#f4edcc"/>
    <Box at={[0,3.24,.17]} size={[1.22,.5,.1]} color="#354a34"/>
    <Label at={[0,3.24,.23]} size={[1.1,.43]} map={maps.bathroom}/>
    {[-jambCenter,jambCenter].map(x=><Box key={x} at={[x,BATHROOM.openingHeight/2,-.07]} size={[BATHROOM.jambWidth,BATHROOM.openingHeight,.44]} color="#42543b"/>)}
    <Box at={[0,BATHROOM.openingHeight+.07,-.07]} size={[BATHROOM_FRAME_WIDTH,.14,.44]} color="#42543b"/>
    {[-1,1].map(side=><Box key={side} at={[side*(BATHROOM.clearWidth/2-.0275),BATHROOM.openingHeight/2,-.205]} size={[.055,BATHROOM.openingHeight,.055]} color="#34472f"/>)}
    <Box at={[0,BATHROOM.openingHeight-.03,-.205]} size={[BATHROOM.clearWidth,.06,.055]} color="#34472f"/>
    <group ref={door} position={[-.85,0,-.12]} onClick={active?event=>{event.stopPropagation();onEnter();}:undefined}>
      <Box at={[.85,1.38,0]} size={[1.7,2.72,.08]} color="#5e7552"/>
      <Box at={[.85,1.47,.047]} size={[1.43,2.08,.025]} color="#536a47"/>
      <Box at={[1.48,1.18,.1]} size={[.19,.045,.05]} color="#d6c697" metal/>
      <Label at={[.85,1.88,.07]} size={[.65,.3]} map={maps.bathroom}/>
    </group>
    {active&&<Html center position={[0,1.3,.26]} distanceFactor={7} zIndexRange={[8,0]}><button className="three-wc-link" onClick={onEnter}>Banheiro <small>Painel técnico ↗</small></button></Html>}
    <Label at={[0,2.3,-4.69]} size={[2.35,.78]} map={maps.maintenance}/>
    <Box at={[-1.05,.85,-4.23]} size={[.7,.12,.65]} color="#e4dfcf"/>
    <Box at={[-1.05,.45,-4.23]} size={[.18,.8,.2]} color="#d1d1bc"/>
    <Box at={[-1.05,1.5,-4.69]} size={[.65,.9,.045]} color="#9bafa5" metal/>
    <Box at={[.96,.46,-3.65]} size={[.55,.75,.6]} color="#e0dbca"/>
    <mesh position={[.96,.85,-3.55]} rotation={[-Math.PI/2,0,0]}><torusGeometry args={[.26,.055,8,16]}/><meshStandardMaterial color="#efead8" roughness={.6}/></mesh>
  </group>;
}
function Plant({at}:{at:Point}) {
  return <group position={at}>
    <mesh position={[0,.22,0]}><cylinderGeometry args={[.28,.21,.44,10]}/><meshStandardMaterial color="#986b47" roughness={1}/></mesh>
    {[0,1,2,3,4].map(i=><mesh key={i} position={[Math.sin(i*2)*.16,.65+Math.cos(i)*.08,Math.cos(i*2)*.16]} rotation={[.1,0,(i-2)*.2]} scale={[.17,.53,.1]}><sphereGeometry args={[1,6,5]}/><meshStandardMaterial color={i%2?'#657b47':'#465f3c'} roughness={1}/></mesh>)}
  </group>;
}
