import type {PublicRoom,ClientCommand} from '../shared/protocol';
import {cardStrength} from './rules';
import {BarScene} from './BarScene';

export function cardName(id:string){const [suit,rank]=id.split('_');return `${Number(rank)} de ${{bastos:'paus',oros:'ouros',espadas:'espadas',copas:'copas'}[suit]??suit}`;}
function CardImage({id}:{id:string}){return <img src={`/cards/${id}.png`} alt={cardName(id)} draggable={false} width={414} height={638}/>;}
type Props={room:PublicRoom;threeD:boolean;connected:boolean;busy:boolean;onCommand:(name:ClientCommand['name'],payload?:ClientCommand['payload'])=>void;onExit:()=>void;onRules:()=>void;onCopy:()=>void};
export function GameTable({room:r,threeD,connected,busy,onCommand,onExit,onRules,onCopy}:Props){
  const teammate=r.others.find(player=>player.team===r.you.team);
  const enemy=r.others.find(player=>player.team!==r.you.team);
  const opponent=enemy?.nickname??'Cadeira reservada';
  const duo=r.playerCount===4;
  const blocked=!connected||busy||r.paused;
  const playing=r.phase==='PLAYING';
  const canPlay=playing&&!blocked&&r.turnSeat===r.you.seat;
  const opponentTurn=playing&&!blocked&&r.turnSeat!==r.you.seat;
  const turnLabel=canPlay?'Sua vez':opponentTurn?`Vez de ${r.others.find(player=>player.seat===r.turnSeat)?.nickname??opponent}`:null;
  const last=r.trickResults.at(-1);
  const winner=(value:number|null)=>value===null?'':value===r.you.team?(duo?'Sua dupla':'Você'):(duo?'Dupla adversária':opponent);
  const message=!connected?'Reconectando à partida…':busy?'Confirmando sua ação…':r.paused?'Aguardando todos os jogadores voltarem. A partida está pausada.':playing?(canPlay?'Escolha uma carta para jogar.':'Aguarde sua vez.'):r.phase==='TRICK'?(last==='tie'?'Vaza empatada (parda).':`${winner(last as number)} venceu a vaza.`):r.phase==='HAND_FINISHED'?`${winner(r.handWinner)} venceu a mão.`:r.phase==='ABANDONED'?'Esta mesa foi encerrada. Volte ao salão para criar outra.':'';
  const next=r.phase==='TRICK'?'NEXT_TRICK':'NEXT_HAND';
  const teamNames=(team:number)=>[r.you,...r.others].filter(player=>player.team===team).map(player=>player.nickname).join(' + ')||`Dupla ${team+1}`;
  const winningCard=last==='tie'||last===undefined?null:r.played.flatMap((card,seat)=>card&&seat%2===last?[{card,seat,strength:cardStrength(card)}]:[]).sort((a,b)=>b.strength-a.strength)[0]?.card??null;
  const needed=r.playerCount-r.others.length-1;
  const readyCount=r.others.filter(player=>player.ready).length+(r.you.ready?1:0);
  return <section className="table-page page-enter" aria-label="Mesa de truco online">
    <div className="table-toolbar"><button className="back-link" disabled={busy||!connected} onClick={onExit}>← Sair da mesa</button><span className="demo-inline">PARTIDA ONLINE · {duo?'2 × 2 · 4 JOGADORES':'1 × 1 · 2 JOGADORES'}</span><button className="text-button" onClick={onRules}>Regras da casa ↗</button></div>
    <div className={`game-environment ${duo?'game-four':''}`}>{!threeD&&<div className="game-backdrop"><BarScene interior/></div>}
      <aside className="chalkboard" aria-label="Placar"><span>PLACAR DA CASA</span><div><span>{duo?teamNames(r.you.team):r.you.nickname}</span><b>{r.score[r.you.team]}</b></div><div><span>{duo?teamNames(1-r.you.team):opponent}</span><b>{r.score[1-r.you.team]}</b></div><small>VENCE QUEM CHEGAR A 5</small></aside>
      <aside className="receipt"><span>NEURO / COMANDA</span><small>CÓDIGO DA MESA</small><strong>{r.code}</strong><button className="receipt-copy" onClick={onCopy}>Copiar código ↗</button></aside>
      <div className="other-players">{r.others.map(player=><div key={player.id} className={`other-player position-${(player.seat-r.you.seat+r.playerCount)%r.playerCount} seat-${player.seat} ${player.seat===r.turnSeat&&opponentTurn?'seat-playing':''} ${player.team===r.you.team?'same-team':''}`}><div className="avatar">{Array.from(player.nickname)[0].toUpperCase()}</div><span>{player.nickname}<small>{player.team===r.you.team?'SUA DUPLA':player.seat===r.turnSeat&&opponentTurn?'JOGANDO AGORA':player.connected?'CONECTADO':'RECONECTANDO'}</small></span><div className="opponent-hand">{Array.from({length:player.cardCount},(_,i)=><img key={i} src="/cards/verso.png" alt="Carta oculta"/>)}</div></div>)}</div>
      <div className="wooden-table"><div className="table-brand">neuro<span>BOAS MÃOS, BOAS HISTÓRIAS.</span></div></div>
      {r.phase==='WAITING'?<div className="waiting-card"><span className="eyebrow">A SUA MESA ESTÁ PRONTA</span><h2>{r.others.length===r.playerCount-1?'Vamos jogar?':'Falta companhia.'}</h2><p>{r.others.length===r.playerCount-1?`Todos chegaram. Cada jogador precisa confirmar para começar.`:`Compartilhe o código ${r.code}. Faltam ${needed} ${needed===1?'jogador':'jogadores'} para completar a mesa de ${r.playerCount}.`}</p><button className="primary" disabled={blocked||needed>0||r.you.ready} onClick={()=>onCommand('READY')}>{r.you.ready?'Pronto · aguardando a mesa':`Estou pronto · ${readyCount}/${r.playerCount} →`}</button>{r.others.length>0&&<small>{r.others.filter(player=>player.ready).length} de {r.others.length} outros jogadores confirmaram.</small>}</div>:<>
        <div className="round-label">MÃO {String(r.handNumber).padStart(2,'0')} <i/> VAZA {r.trickNumber} DE 3</div>
        <div className="played-cards" aria-live="polite">{r.played.flatMap((card,seat)=>card?[<div key={seat} className={`played ${seat===r.you.seat?'player-play':r.others.find(player=>player.seat===seat)?.team===r.you.team?'partner-play':'opponent-play'}`}><CardImage id={card}/><span>{seat===r.you.seat?'Você':r.others.find(player=>player.seat===seat)?.nickname??'Jogador'}</span></div>]:[])}</div>
        <div className={`turn-message ${canPlay?'turn-yours':opponentTurn?'turn-opponent':'turn-idle'}`} role="status" aria-atomic="true">{turnLabel&&<strong className="turn-heading">{turnLabel}</strong>}{message}{['TRICK','HAND_FINISHED'].includes(r.phase)&&last!==undefined&&<small>{last==='tie'?'As cartas mais fortes empataram.':`${cardName(winningCard!)} vence pela hierarquia argentina.`}</small>}</div>
        {['TRICK','HAND_FINISHED'].includes(r.phase)&&<button className="primary next-trick" disabled={blocked||r.you.advance} onClick={()=>onCommand(next)}>{r.you.advance?'Aguardando a mesa…':r.phase==='TRICK'?'Próxima vaza →':'Próxima mão →'}</button>}
        <div className={`player-hand ${canPlay?'hand-active':'hand-waiting'}`} aria-label={canPlay?'Suas cartas — escolha uma para jogar':'Suas cartas — jogada indisponível enquanto aguarda'}>{r.you.cards.map((id,i)=><button key={id} className={`hand-card card-${i}`} disabled={!canPlay} onClick={()=>onCommand('PLAY_CARD',{kind:'CARD',cardId:id})} aria-label={`Jogar ${cardName(id)}`}><CardImage id={id}/></button>)}</div>
        <div className={`player-seat ${canPlay?'seat-playing':''}`}><span className="avatar small">{Array.from(r.you.nickname)[0].toUpperCase()}</span><span>{r.you.nickname}<small>{canPlay?'SUA VEZ DE JOGAR':opponentTurn?'AGUARDE SUA VEZ':`VOCÊ · ${connected?'CONECTADO':'RECONECTANDO'}${teammate?' · SUA DUPLA: '+teammate.nickname:''}`}</small></span></div>
      </>}
      {r.phase==='MATCH_FINISHED'&&<div className="result-overlay"><div className="result-card"><span className="eyebrow">{r.matchWinner===r.you.team?'A CASA APLAUDE':'A PRÓXIMA PODE SER SUA'}</span><span className="result-star">✳</span><h2>Boa mão,<br/><em>{r.matchWinner===r.you.team?(duo?teamNames(r.you.team):r.you.nickname):(duo?teamNames(1-r.you.team):opponent)}.</em></h2><p>{r.score[r.you.team]} <span>×</span> {r.score[1-r.you.team]}</p><button className="primary full" disabled={blocked||r.you.rematch} onClick={()=>onCommand('REMATCH')}>{r.you.rematch?'Revanche pedida · aguardando a mesa':'Pedir revanche ↻'}</button>{r.others.some(player=>player.rematch)&&<small>Outro jogador pediu revanche.</small>}<button className="text-button" disabled={busy||!connected} onClick={onExit}>Voltar ao salão →</button></div></div>}
    </div>
    <div className="demo-controls"><p>{r.trickResults.length>0&&<>Vazas: {r.trickResults.map(w=>w==='tie'?'Parda':duo?`Dupla ${w+1}`:w===r.you.team?'Você':opponent).join(' · ')}. </>}O placar conta mãos completas. Sair da mesa encerra a partida para todos.</p></div>
  </section>;
}
