import type {PublicRoom,ClientCommand} from '../shared/protocol';
import {BarScene} from './BarScene';

export function cardName(id:string){const [suit,rank]=id.split('_');return `${Number(rank)} de ${{bastos:'paus',oros:'ouros',espadas:'espadas',copas:'copas'}[suit]??suit}`;}
function CardImage({id}:{id:string}){return <img src={`/cards/${id}.png`} alt={cardName(id)} draggable={false} width={414} height={638}/>;}
type Props={room:PublicRoom;threeD:boolean;connected:boolean;busy:boolean;onCommand:(name:ClientCommand['name'],payload?:ClientCommand['payload'])=>void;onExit:()=>void;onRules:()=>void;onCopy:()=>void};
export function GameTable({room:r,threeD,connected,busy,onCommand,onExit,onRules,onCopy}:Props){
  const seat=r.you.seat,other=1-seat,opponent=r.opponent?.nickname??'Cadeira reservada';
  const blocked=!connected||busy||r.paused;
  const playing=r.phase==='PLAYING';
  const canPlay=playing&&!blocked&&r.turnSeat===seat;
  const opponentTurn=playing&&!blocked&&r.turnSeat!==seat;
  const turnLabel=canPlay?'Sua vez':opponentTurn?`Vez de ${opponent}`:null;
  const last=r.trickResults.at(-1);
  const winner=(value:number|null)=>value===seat?'Você':opponent;
  const message=!connected?'Reconectando à partida…':busy?'Confirmando sua ação…':r.paused?'Aguardando o outro jogador voltar. A partida está pausada.':playing?(canPlay?'Escolha uma carta para jogar.':'Aguarde o adversário jogar.'):r.phase==='TRICK'?(last==='tie'?'Vaza empatada (parda).':`${winner(last as number)} venceu a vaza.`):r.phase==='HAND_FINISHED'?`${winner(r.handWinner)} venceu a mão.`:r.phase==='ABANDONED'?'Esta mesa foi encerrada. Volte ao salão para criar outra.':'';
  const next=r.phase==='TRICK'?'NEXT_TRICK':'NEXT_HAND';
  return <section className="table-page page-enter" aria-label="Mesa de truco online">
    <div className="table-toolbar"><button className="back-link" disabled={busy||!connected} onClick={onExit}>← Sair da mesa</button><span className="demo-inline">PARTIDA ONLINE · DOIS JOGADORES</span><button className="text-button" onClick={onRules}>Regras da casa ↗</button></div>
    <div className="game-environment">{!threeD&&<div className="game-backdrop"><BarScene interior/></div>}
      <aside className="chalkboard" aria-label="Placar"><span>PLACAR DA CASA</span><div><span>{r.you.nickname}</span><b>{r.score[seat]}</b></div><div><span>{opponent}</span><b>{r.score[other]}</b></div><small>VENCE QUEM CHEGAR A 5</small></aside>
      <aside className="receipt"><span>NEURO / COMANDA</span><small>CÓDIGO DA MESA</small><strong>{r.code}</strong><button className="receipt-copy" onClick={onCopy}>Copiar código ↗</button></aside>
      <div className={`opponent-seat ${opponentTurn?'seat-playing':''}`}><div className={`avatar ${r.opponent?'':'empty'}`}>{r.opponent?Array.from(opponent)[0].toUpperCase():'+'}</div><span>{opponent}<small>{opponentTurn?'JOGANDO AGORA':r.opponent?(r.opponent.connected?'CONECTADO':'RECONECTANDO'):'COMPARTILHE O CÓDIGO'}</small></span><div className="opponent-hand">{Array.from({length:r.opponent?.cardCount??0},(_,i)=><img key={i} src="/cards/verso.png" alt="Carta oculta do adversário"/>)}</div></div>
      <div className="wooden-table"><div className="table-brand">neuro<span>BOAS MÃOS, BOAS HISTÓRIAS.</span></div></div>
      {r.phase==='WAITING'?<div className="waiting-card"><span className="eyebrow">A SUA MESA ESTÁ PRONTA</span><h2>{r.opponent?'Vamos jogar?':'Falta só a companhia.'}</h2><p>{r.opponent?`${opponent} está na mesa. Os dois precisam confirmar para começar.`:'Compartilhe o código da comanda. Seu amigo entra em outro navegador com um apelido e esse código.'}</p><button className="primary" disabled={blocked||!r.opponent||r.you.ready} onClick={()=>onCommand('READY')}>{r.you.ready?'Pronto · aguardando o outro jogador':'Estou pronto →'}</button>{r.opponent&&<small>{r.opponent.ready?'Seu adversário está pronto.':'Aguardando a confirmação do adversário.'}</small>}</div>:<>
        <div className="round-label">MÃO {String(r.handNumber).padStart(2,'0')} <i/> VAZA {r.trickNumber} DE 3</div>
        <div className="played-cards" aria-live="polite">{r.played[other]&&<div className="played opponent-play"><CardImage id={r.played[other]!}/><span>{opponent}</span></div>}{r.played[seat]&&<div className="played player-play"><CardImage id={r.played[seat]!}/><span>Você</span></div>}</div>
        <div className={`turn-message ${canPlay?'turn-yours':opponentTurn?'turn-opponent':'turn-idle'}`} role="status" aria-atomic="true">{turnLabel&&<strong className="turn-heading">{turnLabel}</strong>}{message}{['TRICK','HAND_FINISHED'].includes(r.phase)&&last!==undefined&&<small>{last==='tie'?'As cartas têm a mesma força.':`${cardName(r.played[last]!)} vence pela hierarquia argentina.`}</small>}</div>
        {['TRICK','HAND_FINISHED'].includes(r.phase)&&<button className="primary next-trick" disabled={blocked||r.you.advance} onClick={()=>onCommand(next)}>{r.you.advance?'Aguardando o adversário…':r.phase==='TRICK'?'Próxima vaza →':'Próxima mão →'}</button>}
        <div className={`player-hand ${canPlay?'hand-active':'hand-waiting'}`} aria-label={canPlay?'Suas cartas — escolha uma para jogar':'Suas cartas — jogada indisponível enquanto aguarda'}>{r.you.cards.map((id,i)=><button key={id} className={`hand-card card-${i}`} disabled={!canPlay} onClick={()=>onCommand('PLAY_CARD',{kind:'CARD',cardId:id})} aria-label={`Jogar ${cardName(id)}`}><CardImage id={id}/></button>)}</div>
        <div className={`player-seat ${canPlay?'seat-playing':''}`}><span className="avatar small">{Array.from(r.you.nickname)[0].toUpperCase()}</span><span>{r.you.nickname}<small>{canPlay?'SUA VEZ DE JOGAR':opponentTurn?'AGUARDE SUA VEZ':`VOCÊ · ${connected?'CONECTADO':'RECONECTANDO'}`}</small></span></div>
      </>}
      {r.phase==='MATCH_FINISHED'&&<div className="result-overlay"><div className="result-card"><span className="eyebrow">{r.matchWinner===seat?'A CASA APLAUDE':'A PRÓXIMA PODE SER SUA'}</span><span className="result-star">✳</span><h2>Boa mão,<br/><em>{r.matchWinner===seat?r.you.nickname:opponent}.</em></h2><p>Você {r.score[seat]} <span>×</span> {r.score[other]} {opponent}</p><button className="primary full" disabled={blocked||r.you.rematch} onClick={()=>onCommand('REMATCH')}>{r.you.rematch?'Revanche pedida · aguardando':'Pedir revanche ↻'}</button>{r.opponent?.rematch&&<small>Seu adversário pediu revanche.</small>}<button className="text-button" disabled={busy||!connected} onClick={onExit}>Voltar ao salão →</button></div></div>}
    </div>
    <div className="demo-controls"><p>{r.trickResults.length>0&&<>Vazas: {r.trickResults.map(w=>w==='tie'?'Parda':winner(w)).join(' · ')}. </>}O placar conta mãos completas. Sair da mesa encerra a partida para os dois.</p></div>
  </section>;
}
