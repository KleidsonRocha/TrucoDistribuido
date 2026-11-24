import {useEffect,useRef,useState,type FormEvent} from 'react';
import {DemoSessionSchema,DemoStateSchema,type DemoSession,type DemoState} from '../shared/demo';

const locked:DemoSession={enabled:true,authenticated:false,csrfToken:null};
export function DemoControls({leaderId,clusterReady}:{leaderId:number|null;clusterReady:boolean}){
  const [session,setSession]=useState<DemoSession|null>(null);
  const [state,setState]=useState<DemoState|null>(null);
  const [password,setPassword]=useState('');const [pending,setPending]=useState(false);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const active=useRef(true);const inFlight=useRef(false);
  async function request(path:string,method='GET',body?:unknown){
    const response=await fetch(`/api/demo/${path}`,{method,credentials:'same-origin',cache:'no-store',headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(session?.csrfToken?{'x-demo-csrf':session.csrfToken}:{})},body:body!==undefined?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30_000)});
    const result=await response.json();
    if(!response.ok){if(response.status===401){setSession(locked);setState(null);}throw new Error(result.error??'Não foi possível executar a operação.');}
    return result;
  }
  useEffect(()=>{
    active.current=true;
    void fetch('/api/demo/session',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(4000)})
      .then(response=>{if(!response.ok)throw new Error();return response.json();})
      .then(value=>{if(active.current)setSession(DemoSessionSchema.parse(value));})
      .catch(()=>{if(active.current)setError('Não foi possível consultar os controles de demonstração. Reabra o painel para tentar novamente.');});
    return ()=>{active.current=false;};
  },[]);
  useEffect(()=>{
    if(!session?.authenticated)return;
    let mounted=true;let polling=false;
    const poll=async()=>{
      if(polling||inFlight.current)return;polling=true;
      try{const next=DemoStateSchema.parse(await request('state'));if(mounted){setState(next);setError('');}}
      catch(cause){if(mounted)setError(cause instanceof Error?cause.message:'Controlador indisponível.');}
      finally{polling=false;}
    };
    void poll();const timer=setInterval(()=>void poll(),3000);
    return ()=>{mounted=false;clearInterval(timer);};
  },[session?.authenticated]);
  async function run(work:()=>Promise<void>){
    if(inFlight.current)return;inFlight.current=true;setPending(true);setError('');
    try{await work();}catch(cause){if(active.current)setError(cause instanceof Error?cause.message:'Não foi possível executar a operação.');}
    finally{inFlight.current=false;if(active.current)setPending(false);}
  }
  function unlock(event:FormEvent){event.preventDefault();void run(async()=>{const next=DemoSessionSchema.parse(await request('session','POST',{password}));if(active.current){setPassword('');setNotice('Controles liberados por 20 minutos.');setSession(next);}});}
  function action(id:number,action:'start'|'stop'){
    void run(async()=>{const result=await request(`nodes/${id}/${action}`,'POST',{});if(active.current){setNotice(result.message);setState(DemoStateSchema.parse(await request('state')));}});
  }
  if(session&&!session.enabled)return null;
  const allRunning=state?.nodes.every(node=>node.running&&!node.paused)??false;
  const busy=pending||state?.busy;
  const canStop=!!state&&allRunning&&clusterReady&&!busy;
  return <section className="demo-panel" aria-labelledby="demo-title">
    <div className="demo-heading"><div><div className="eyebrow">BANCADA DE DEMONSTRAÇÃO</div><h2 id="demo-title">Falha, eleição e recuperação.</h2></div>{session?.authenticated&&<button type="button" className="secondary" disabled={pending} onClick={()=>void run(async()=>{const next=DemoSessionSchema.parse(await request('session','DELETE'));if(active.current){setSession(next);setState(null);setNotice('Controles bloqueados.');}})}>Bloquear controles</button>}</div>
    <p>Os botões param e iniciam containers reais do Neuro. Ao parar o líder, o Bully elege automaticamente o maior ID apto entre os sobreviventes. Ao religar, o nó sincroniza o estado antes de voltar a participar.</p>
    {!session?.authenticated?<form className="demo-unlock" onSubmit={unlock}><label htmlFor="demo-password">Senha da demonstração</label><div><input id="demo-password" type="password" value={password} onChange={event=>setPassword(event.target.value)} autoComplete="current-password" maxLength={128} required disabled={pending||!session}/><button type="submit" className="primary" disabled={pending||!password||!session}>{pending?'Desbloqueando…':'Liberar controles'}</button></div></form>:<>
      <div className="demo-actions"><button type="button" className="demo-stop" disabled={!canStop||leaderId===null} onClick={()=>{if(leaderId!==null)action(leaderId,'stop');}}>Parar líder atual{leaderId!==null?` · nó ${leaderId}`:''}</button><span>{!state?'Consultando os containers…':!allRunning?'Religue o nó parado e aguarde a sincronização.':!clusterReady?'Aguarde os três nós prontos e sincronizados.':'Três nós sincronizados. Você pode demonstrar uma falha.'}</span></div>
      <div className="demo-node-controls">{(state?.nodes??[]).map(node=><div key={node.id}><strong>Nó {node.id}</strong><span>{node.paused?'Em transição':node.running?'Container ligado':'Container parado'}</span><button type="button" disabled={node.running?!canStop:busy||node.paused} onClick={()=>action(node.id,node.running?'stop':'start')}>{node.running?'Parar container':'Religar container'}</button></div>)}</div>
      <p className="demo-hint">Uma falha por vez. Mantenha uma partida aberta em outras abas para observar a reconexão, o placar e as cartas. Compare versão e hash após a sincronização.</p>
    </>}
    {error&&<p className="network-warning" role="alert">{error}</p>}{notice&&<p className="demo-notice" role="status">{notice}</p>}
  </section>;
}
