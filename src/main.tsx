import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarScene } from './BarScene';
import { BarDoor, BarHall } from './FirstPersonBar';
import {useOnlineGame} from './network/useOnlineGame';
import {GameTable} from './GameTable';
import {TechnicalPanel} from './TechnicalPanel';
import type {ClientCommand} from '../shared/protocol';
import { SceneBoundary } from './SceneBoundary';
import { DoorEntryForm } from './DoorEntryForm';
import { JOURNEY_MS } from './scene/layout';
import './styles.css';
import './world.css';
import './world3d.css';
import './turn.css';

const World3D=lazy(()=>import('./World3D'));

type Screen = 'entrada' | 'salao' | 'mesa' | 'painel';
type Modal = 'rules' | 'credits' | 'code' | null;
const screens:Screen[] = ['entrada','salao','mesa','painel'];
function currentScreen(): Screen {
  const value=location.hash.slice(1) as Screen;
  // Uma mesa requer a sessão visual criada na própria interface.
  return screens.includes(value) && value!=='mesa' ? value : 'entrada';
}
function savedNickname() { try { return localStorage.getItem('neuro.nickname') ?? ''; } catch { return ''; } }

function App() {
  const [screen,setScreen]=useState<Screen>(currentScreen);
  const [nickname,setNickname]=useState(savedNickname);
  const [modal,setModal]=useState<Modal>(null);
  const [code,setCode]=useState('');
  const [tableVisual,setTableVisual]=useState('NEURO1');
  const [connectName,setConnectName]=useState(savedNickname);
  const online=useOnlineGame(connectName);
  const room=online.state.room;
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [approaching,setApproaching]=useState(false);
  const [walkingIn,setWalkingIn]=useState(false);
  const [stableCamera,setStableCamera]=useState(false);
  const [threeD,setThreeD]=useState(true);
  const [lowQuality,setLowQuality]=useState(false);
  const [walkingBathroom,setWalkingBathroom]=useState(false);
  const [reducedMotion,setReducedMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const mainRef=useRef<HTMLElement>(null);
  const nicknameRef=useRef<HTMLInputElement>(null);
  const previousFocus=useRef<HTMLElement|null>(null);
  const dialogRef=useRef<HTMLDialogElement>(null);
  const approachTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const locked=useRef(false);

  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>setReducedMotion(media.matches);
    media.addEventListener('change',update);return ()=>media.removeEventListener('change',update);
  },[]);

  useEffect(()=>{
    const onHash=()=>{
      if(approachTimer.current) clearTimeout(approachTimer.current);
      locked.current=false;setApproaching(false);setWalkingIn(false);setWalkingBathroom(false);setModal(null);
      const next=location.hash.slice(1) as Screen;
      if(next==='mesa') { history.replaceState(null,'','#salao');setScreen('salao');return; }
      setScreen(screens.includes(next)?next:'entrada');
    };
    window.addEventListener('hashchange',onHash);
    return ()=>{window.removeEventListener('hashchange',onHash); if(approachTimer.current)clearTimeout(approachTimer.current);};
  },[]);
  useEffect(()=>{
    document.title=`Neuro — ${{entrada:'puxe uma cadeira',salao:'o salão',mesa:'sua mesa',painel:'painel técnico'}[screen]}`;
    mainRef.current?.focus();
    window.scrollTo(0,0);
  },[screen]);
  useEffect(()=>{
    if(modal) {
      previousFocus.current=document.activeElement as HTMLElement;
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
      previousFocus.current?.focus();
    }
  },[modal]);
  useEffect(()=>{if(room&&screen!=='mesa'&&screen!=='painel'&&!locked.current){navigate('mesa');}},[room?.id,screen]);
  useEffect(()=>{
    if(!notice)return;
    const timer=setTimeout(()=>setNotice(''),3500);return ()=>clearTimeout(timer);
  },[notice]);

  function navigate(next:Screen) {
    setModal(null);setError('');
    if(approachTimer.current)clearTimeout(approachTimer.current);
    locked.current=false;setApproaching(false);setWalkingIn(false);setWalkingBathroom(false);
    // pushState evita disparar o listener de hash nos movimentos internos.
    history.pushState(null,'',`#${next}`);setScreen(next);
  }
  function enter(e:React.FormEvent) {
    e.preventDefault();
    if(locked.current)return;
    const name=nickname.trim();
    if(name.length<2 || name.length>20) {setError('Use um apelido com 2 a 20 caracteres.');return;}
    setNickname(name);setConnectName(name);try{localStorage.setItem('neuro.nickname',name);}catch{/* sessão efêmera */}
    locked.current=true;setError('');setWalkingIn(true);
    approachTimer.current=setTimeout(()=>navigate('salao'),stableCamera||reducedMotion?10:JOURNEY_MS.entry);
  }
  async function sit(nextRoom='NEURO1',joinCode?:string) {
    if(locked.current)return;
    locked.current=true;setTableVisual(nextRoom);setError('');online.clearError();
    try {
      await online.command(joinCode?'JOIN_ROOM':'CREATE_ROOM',joinCode?{kind:'JOIN',code:joinCode}:{kind:'EMPTY'});
      setModal(null);setApproaching(true);
      approachTimer.current=setTimeout(()=>navigate('mesa'),stableCamera||reducedMotion?10:JOURNEY_MS.table);
    }catch(reason){locked.current=false;const message=reason instanceof Error?reason.message:'Não foi possível entrar na mesa.';setError(message);setNotice(message);}
  }
  async function leave(next:Screen='salao') {
    if(room){try{await online.command('LEAVE_ROOM');}catch(reason){setNotice(reason instanceof Error?reason.message:'Aguarde a conexão para sair.');return;}}
    navigate(next);
  }
  function sendCommand(name:ClientCommand['name'],payload:ClientCommand['payload']={kind:'EMPTY'}){void online.command(name,payload).catch(reason=>setNotice(reason instanceof Error?reason.message:'Tente novamente.'));}
  function visitBathroom() {
    if(locked.current)return;
    if(!threeD){navigate('painel');return;}
    locked.current=true;setWalkingBathroom(true);
    approachTimer.current=setTimeout(()=>navigate('painel'),stableCamera||reducedMotion?10:JOURNEY_MS.bathroom);
  }
  function join(e:React.FormEvent) {
    e.preventDefault();
    if(!/^[A-Z2-9]{6}$/.test(code.trim().toUpperCase())){setError('Informe os seis caracteres do código da mesa.');return;}
    void sit('NEURO1',code.trim().toUpperCase());
  }
  async function copyCode() {
    if(!room)return;
    try {await navigator.clipboard.writeText(room.code);setNotice('Código copiado. Envie para seu amigo.');}
    catch {setNotice(`Código da mesa: ${room.code}`);}
  }
  const openModal=(next:Modal)=>{setError('');setModal(next);};
  const player=nickname.trim()||'Visitante';
  return <div className={`app view-${screen} ${threeD?'three-mode':''} ${approaching?'approaching':''} ${stableCamera||reducedMotion?'camera-stable':''}`}>
    <a href="#conteudo" className="skip-link" onClick={e=>{e.preventDefault();mainRef.current?.focus();}}>Pular para o conteúdo</a>
    <header className="site-header">
      <button className="wordmark" aria-label="Neuro — voltar à entrada" onClick={()=>void leave('entrada')}>neuro<span>BAR &amp; TRUCO</span></button>
      <nav aria-label="Preferências da câmera">
        <button className="camera-toggle" aria-pressed={stableCamera||reducedMotion} disabled={walkingIn||approaching||walkingBathroom||reducedMotion} onClick={()=>setStableCamera(!stableCamera)}><span>{stableCamera?'◉':'◎'}</span> Câmera estável {reducedMotion?'pelo sistema':stableCamera?'ativada':'desativada'}</button>
        {threeD&&<button className="quality-toggle" aria-pressed={lowQuality} onClick={()=>setLowQuality(!lowQuality)}>Gráficos: {lowQuality?'leves':'padrão'}</button>}
        {!threeD&&<button className="quality-toggle" onClick={()=>setThreeD(true)}>Tentar cenário 3D ↗</button>}
      </nav>
      <span className="phase-tag"><i/> Truco online · {threeD?'cenário 3D':'versão ilustrada'}</span>
    </header>

    {threeD&&<SceneBoundary onUse2D={()=>setThreeD(false)}><Suspense fallback={<div className="world-loading" role="status">Acendendo as luzes do Neuro…</div>}><World3D view={screen} journey={walkingIn?'entry':approaching?'table':walkingBathroom?'bathroom':null} room={tableVisual} stable={stableCamera||reducedMotion} lowQuality={lowQuality} opponentPresent={!!room?.opponent} onRules={()=>openModal('rules')} onBathroom={visitBathroom} onSit={sit} onCode={()=>{setCode('');openModal('code');}} onUse2D={()=>setThreeD(false)} onDoorClick={()=>nicknameRef.current?.focus()}/></Suspense></SceneBoundary>}

    {connectName&&<div className={`connection-strip connection-${online.connection}`} role="status"><span>{online.connection==='online'?(online.busy?'Confirmando sua ação…':'Conectado · pronto para jogar'):online.connection==='recovering'?'Reconectando · sua partida será retomada…':'Conectando aos servidores…'}</span>{online.error&&<span>{online.error}</span>}{online.connection==='offline'&&<button onClick={online.reconnect}>Tentar novamente</button>}</div>}
    <main id="conteudo" ref={mainRef} tabIndex={-1}>
      {screen==='entrada' && (threeD?<section className="three-entry-hud"><h2 className="sr-only">Diante da porta do Neuro</h2>{!walkingIn&&<DoorEntryForm nickname={nickname} error={error} walking={walkingIn} inputRef={nicknameRef} onNickname={value=>{setNickname(value);setError('');}} onEnter={enter}/>}<div className="scene-context"><span>RUA DE TODAS AS NOITES, 40</span><p>Uma noite qualquer.<br/><em>Uma boa mão pela frente.</em></p></div><button className="three-entry-rules" disabled={walkingIn} onClick={()=>openModal('rules')}>Quadro da casa · Como jogar ↗</button></section>:<BarDoor nickname={nickname} error={error} walking={walkingIn} onNickname={value=>{setNickname(value);setError('');}} onEnter={enter} onRules={()=>openModal('rules')}/>)}

      {screen==='salao'&&online.state.rooms.length>0&&<aside className="live-rooms" aria-label="Mesas online"><h2>Mesas no salão</h2>{online.state.rooms.map(item=><button key={item.id} disabled={item.players!==1||item.phase!=='WAITING'||online.busy||online.connection!=='online'} onClick={()=>void sit('NEURO1',item.code)}><strong>{item.code}</strong><span>{item.nicknames.join(' × ')} · {item.players}/2</span></button>)}</aside>}
      {screen==='salao' && (threeD?<section className="three-hall-hud"><div className="hall-context"><span>VOCÊ ENTROU NO NEURO</span><h1>Chega mais, <em>{player}.</em></h1><p>Escolha uma mesa ou explore o bar.</p></div><nav className="three-shortcuts" aria-label="Navegar pelo salão"><button disabled={approaching||walkingBathroom} onClick={()=>sit()}>Mesa 01 ↗</button><button disabled={approaching||walkingBathroom} onClick={()=>sit('MESA02')}>Mesa 02 ↗</button><button disabled={approaching||walkingBathroom} onClick={()=>openModal('rules')}>Quadro de regras ↗</button><button disabled={approaching||walkingBathroom} onClick={visitBathroom}>Banheiro · Painel ↗</button><button disabled={approaching||walkingBathroom} onClick={()=>{setCode('');openModal('code');}}>Tenho um código ↗</button></nav><p className="three-demo-note">Jogadores ao fundo ilustrativos · convide um amigo para jogar</p></section>:<BarHall nickname={player} approaching={approaching} onSit={sit} onCode={()=>{setCode('');openModal('code');}} onRules={()=>openModal('rules')} onBathroom={()=>navigate('painel')}/>)}

      {screen==='mesa' && room && <GameTable room={room} threeD={threeD} connected={online.connection==='online'} busy={online.busy} onCommand={sendCommand} onExit={()=>void leave()} onRules={()=>openModal('rules')} onCopy={copyCode}/>}
      {screen==='mesa'&&!room&&<div className="waiting-card"><h2>Recuperando sua mesa…</h2><button className="secondary" onClick={()=>navigate('salao')}>Voltar ao salão</button></div>}
      {screen==='painel' && <TechnicalPanel threeD={threeD} onExit={()=>navigate('salao')}/>}
    </main>
    <footer className="site-footer"><span>NEURO <i>✦</i> Feito para jogar junto.</span><span className="footer-disclaimer">Truco argentino simplificado · por vitórias</span><button onClick={()=>openModal('credits')}>Créditos das cartas ↗</button></footer>
    {notice && <div className="toast" role="status">{notice}</div>}
    <dialog ref={dialogRef} className={`modal ${modal==='rules'?'rules-modal':''}`} onCancel={()=>setModal(null)} onClick={e=>{if(e.target===e.currentTarget)setModal(null);}} aria-labelledby="dialog-title">
      <button className="modal-close" onClick={()=>setModal(null)} aria-label="Fechar janela">×</button>
      {modal==='rules' && <><div className="eyebrow">COMBINADOS DA CASA</div><h2 id="dialog-title">Poucas regras.<br/><em>Boas partidas.</em></h2><p>Truco argentino simplificado, por vitórias. Dois jogadores, três cartas por mão. A primeira pessoa a ganhar cinco mãos vence a partida.</p><div className="rule-grid"><div><b>01 / A mão</b><p>Até três vazas. A maior carta vence a vaza. Quem vence abre a seguinte; se empatar, mantém-se quem abriu.</p></div><div><b>02 / As pardas</b><p>Quem vence a primeira e empata a segunda ganha a mão. Primeira empatada: a próxima vaza vencida decide. Se cada um vencer uma, a terceira decide; terceira empatada favorece quem venceu a primeira. Três empates favorecem quem abriu a mão.</p></div></div><h3>Da mais forte à mais fraca</h3><ol className="rank-list"><li>1 de espadas</li><li>1 de paus</li><li>7 de espadas</li><li>7 de ouros</li><li>Todos os 3</li><li>Todos os 2</li><li>1 de copas e ouros</li><li>Todos os 12</li><li>Todos os 11</li><li>Todos os 10</li><li>7 de copas e paus</li><li>Todos os 6</li><li>Todos os 5</li><li>Todos os 4</li></ol><p className="fine-print">Cartas do mesmo grupo empatam. Criador abre a primeira mão, depois alterna. Sem envido, flor, aumentos de aposta ou dinheiro. O servidor distribui as cartas, valida o turno e calcula o resultado. Os dois jogadores confirmam o início, a próxima vaza e a próxima mão.</p><button className="primary" onClick={()=>setModal(null)}>Combinado <span>→</span></button></>}
      {modal==='credits' && <><div className="eyebrow">ARTE QUE CHEGA À MESA</div><h2 id="dialog-title">Créditos das cartas.</h2><p>Arte: Basquetteur e colaboradores, com trabalho de Germarquezm, via Wikimedia Commons. Vetorização e distribuição SVG: gjenkins20.</p><p>Imagens sob <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0 ↗</a>. O pacote fornecido renomeou, converteu e ajustou fundos e margens. O Neuro usa os PNGs web sem novas alterações nos arquivos.</p><div className="credit-links"><a href="https://commons.wikimedia.org/wiki/File:Baraja_espa%C3%B1ola_completa.png" target="_blank" rel="noreferrer">Arte de origem ↗</a><a href="https://github.com/gjenkins20/spanish-playing-cards-svg" target="_blank" rel="noreferrer">Distribuidor SVG ↗</a><a href="/cards/LEIA-ME.md" target="_blank">Documentação do pacote ↗</a><a href="/cards/FONTE_README_ORIGINAL.md" target="_blank">Documentação original ↗</a></div><p className="fine-print">Cenário original do Neuro inspirado na imagem de referência do usuário. Nenhum baralho foi gerado.</p></>}
      {modal==='code' && <><div className="eyebrow">TEM ALGUÉM TE ESPERANDO?</div><h2 id="dialog-title">Encontre sua mesa.</h2><p>Digite o código de seis caracteres que aparece na comanda do seu amigo.</p><form onSubmit={join} noValidate><label htmlFor="room-code">Código da mesa</label><input className="code-input" id="room-code" value={code} onChange={e=>{setCode(e.target.value.toUpperCase());setError('');}} maxLength={6} autoComplete="off" placeholder="ABC234" aria-invalid={!!error} aria-describedby={error?'code-error':undefined}/>{error && <p className="form-error" id="code-error" role="alert">{error}</p>}<button className="primary full" type="submit" disabled={online.busy||online.connection!=='online'}>Sentar à mesa <span>→</span></button></form><p className="fine-print">Use outra sessão de navegador para o segundo jogador.</p></>}
    </dialog>
  </div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
