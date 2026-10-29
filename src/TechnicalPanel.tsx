import {useMemo} from 'react';
import {BathroomBackdrop} from './FirstPersonBar';
import {useClusterStatus} from './network/useClusterStatus';

const roles:Record<string,string>={LEADER:'Líder',FOLLOWER:'Seguidor',SYNCING:'Sincronizando',SYNCED:'Sincronizado',ELECTING:'Em eleição',RECOVERING:'Recuperando',STOPPING:'Encerrando'};
const age=(ms:number|null)=>ms===null?'sem amostra':ms<1000?`${Math.round(ms)} ms`:`${(ms/1000).toFixed(1)} s`;
export function TechnicalPanel({onExit,threeD}:{onExit:()=>void;threeD:boolean}){
  const {nodes,error}=useClusterStatus();
  const available=nodes.filter(node=>node.reachable&&node.status);
  const leader=available.find(node=>node.status!.ready&&node.status!.role==='LEADER');
  const events=useMemo(()=>[...new Map(nodes.flatMap(node=>node.status?.events??[]).map(event=>[event.id,event])).values()].sort((a,b)=>b.lamport-a.lamport||b.nodeId-a.nodeId||b.id.localeCompare(a.id)).slice(0,120),[nodes]);
  return <section className="bathroom-page">{!threeD&&<BathroomBackdrop/>}<div className="bathroom-topbar"><button className="bathroom-exit" onClick={onExit}>← Sair do banheiro</button><span>WC / MANUTENÇÃO DO BAR</span></div><div className="bathroom-monitor"><div className="technical-page">
    <div className="section-heading"><div><div className="eyebrow">DADOS REAIS DOS CONTÊINERES</div><h1>Painel <em>técnico.</em></h1></div><span className={`cluster-state ${leader?'healthy':'recovering'}`}>{leader?`LÍDER: NÓ ${leader.id}`:'AGUARDANDO LÍDER PRONTO'}</span></div>
    <div className="cluster-summary"><span><b>{available.length}</b> / 3 nós acessíveis</span><span>Época <b>{leader?`${leader.status!.epoch.counter}/${leader.id}`:'—'}</b></span><span>Versão publicada <b>{leader?.status?.visibleVersion??'—'}</b></span></div>
    {error&&<p className="network-warning" role="alert">{error}</p>}
    <div className="node-grid">{nodes.map(node=><article className={`node-card ${node.reachable?'':'node-unreachable'}`} key={node.id}>
      <div><span className="node-symbol">▧</span><span className={`node-pill ${node.reachable?'up':'down'}`}>{node.reachable?(node.status?.ready?'PRONTO':'EM RECUPERAÇÃO'):'INDISPONÍVEL'}</span></div>
      <h2>Nó {String(node.id).padStart(2,'0')}</h2><p>{node.status?roles[node.status.role]:'Aguardando primeira amostra'}{!node.reachable&&node.status?' · última amostra':''}</p>
      <dl><div><dt>Lamport</dt><dd>{node.status?.lamport??'—'}</dd></div><div><dt>Época instalada</dt><dd>{node.status?`${node.status.epoch.counter}/${node.status.epoch.leaderId}`:'—'}</dd></div><div><dt>Versão aplicada / publicada</dt><dd>{node.status?`${node.status.version} / ${node.status.visibleVersion}`:'—'}</dd></div><div><dt>Hash do estado</dt><dd className="state-hash">{node.status?.hash.slice(0,12)??'—'}</dd></div><div><dt>Participantes</dt><dd>{node.status?.members.join(', ')||'—'}</dd></div><div><dt>Idade da coleta</dt><dd>{age(node.sampledAt===null?null:Date.now()-node.sampledAt)}</dd></div></dl>
      <div className="peer-heartbeats">{node.status?.peers.map(peer=><span key={peer.nodeId}><i className={node.reachable&&peer.reachable?'up':'down'}/>Nó {peer.nodeId} · {node.reachable?age(peer.lastContactAgeMs):'amostra antiga'}</span>)}</div>
    </article>)}</div>
    <div className="event-log"><div className="event-log-title"><h2>O que está acontecendo</h2><span>Últimos 120 eventos · ordem por Lamport e nó</span></div><div className="event-table-wrap"><table><thead><tr><th>Hora</th><th>Nó</th><th>Lamport</th><th>Evento</th><th>Índice</th><th>Detalhe</th></tr></thead><tbody>{events.map(event=><tr key={event.id}><td>{new Date(event.at).toLocaleTimeString('pt-BR')}</td><td>{event.nodeId}</td><td>{event.lamport}</td><td><code>{event.type}</code>{event.commandId&&<small>{event.commandId.slice(0,8)}</small>}</td><td>{event.index}</td><td>{event.detail}</td></tr>)}</tbody></table>{events.length===0&&<p className="empty-events">Os eventos aparecerão quando houver contato com os nós.</p>}</div></div>
    <div className="guarantee-note"><b>Como demonstrar</b><p>Jogue em duas sessões e acompanhe as versões. Pare um seguidor com Docker Compose, recupere-o e aguarde a sincronização. Depois pare o líder. Os comandos só recebem confirmação após gravação em todos os participantes, com mínimo de dois nós. Os dados acima são coletados dos processos reais; um nó sem resposta fica marcado como indisponível.</p></div>
  </div></div><div className="bathroom-floor-note">Neuro · os bastidores também trabalham.</div></section>;
}
