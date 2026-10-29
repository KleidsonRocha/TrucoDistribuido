import {useCallback,useEffect,useRef,useState} from 'react';
import {CommandSchema,HelloSchema,RuntimeConfigSchema,ServerMessageSchema,type ClientCommand,type ClusterInfo,type CommandResult,type PublicState,type RuntimeConfig} from '../../shared/protocol';

export type ConnectionState='idle'|'connecting'|'online'|'recovering'|'offline';
const EMPTY:PublicState={version:0,identity:null,room:null,rooms:[]};
const IDENTITY_KEY='neuro.session.v2';const PENDING_KEY='neuro.pending.v2';
type Identity={clientId:string;resumeSecret:string};
function readIdentity():Identity {
  try{const saved=JSON.parse(sessionStorage.getItem(IDENTITY_KEY)??'null') as Identity|null;if(saved&&HelloSchema.safeParse({type:'HELLO',protocolVersion:1,clientId:saved.clientId,resumeSecret:saved.resumeSecret,nickname:'Sessão'}).success)return saved;}catch{/* armazenamento indisponível */}
  const identity={clientId:crypto.randomUUID(),resumeSecret:Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('')};
  try{sessionStorage.setItem(IDENTITY_KEY,JSON.stringify(identity));}catch{/* permanece durante a aba */}return identity;
}
function readPending():ClientCommand|null {try{const parsed=CommandSchema.safeParse(JSON.parse(sessionStorage.getItem(PENDING_KEY)??'null'));return parsed.success?parsed.data:null;}catch{return null;}}
function savePending(command:ClientCommand|null){try{if(command)sessionStorage.setItem(PENDING_KEY,JSON.stringify(command));else sessionStorage.removeItem(PENDING_KEY);}catch{/* memória ainda preserva o reenvio */}}
export class GameClientError extends Error {code:string;constructor(code:string,message:string){super(message);this.code=code;}}

export function useOnlineGame(nickname:string){
  const [identity]=useState(readIdentity);
  const [state,setState]=useState<PublicState>(EMPTY);const stateRef=useRef(state);
  const [connection,setConnection]=useState<ConnectionState>('idle');const [cluster,setCluster]=useState<ClusterInfo|null>(null);
  const clusterRef=useRef<ClusterInfo|null>(null);const [error,setError]=useState('');
  const pending=useRef<ClientCommand|null>(readPending());const [busy,setBusy]=useState(!!pending.current);
  const socketRef=useRef<WebSocket|null>(null);const resolver=useRef<{resolve:(value:CommandResult)=>void;reject:(reason:Error)=>void}|null>(null);
  const ackTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [restart,setRestart]=useState(0);
  const accept=useCallback((next:PublicState,info:ClusterInfo)=>{
    const prior=clusterRef.current;
    if(prior&&(info.epoch.counter<prior.epoch.counter||(info.epoch.counter===prior.epoch.counter&&info.epoch.leaderId<prior.epoch.leaderId)))return;
    clusterRef.current=info;setCluster(info);
    if(next.version>=stateRef.current.version){stateRef.current=next;setState(next);}
  },[]);
  const transmitPending=useCallback(()=>{
    const socket=socketRef.current;if(!pending.current||socket?.readyState!==WebSocket.OPEN)return;
    socket.send(JSON.stringify(pending.current));
    if(ackTimer.current)clearTimeout(ackTimer.current);
    ackTimer.current=setTimeout(()=>{if(pending.current&&socketRef.current===socket)socket.close(4000,'Resolving pending command');},6000);
  },[]);
  useEffect(()=>{
    if(nickname.trim().length<2){setConnection('idle');return;}
    let active=true;let socket:WebSocket|null=null;let timer:ReturnType<typeof setTimeout>|null=null;
    let config:RuntimeConfig|null=null;let cursor=0;let failures=0;let terminal=false;
    const schedule=()=>{if(!active||terminal)return;timer=setTimeout(()=>void connect(),Math.min(3000,250*2**Math.min(failures++,4))+Math.random()*150);};
    const connect=async()=>{
      if(!active)return;setConnection(stateRef.current.room||pending.current?'recovering':'connecting');
      try{
        if(!config){const response=await fetch('/runtime-config.json',{cache:'no-store',signal:AbortSignal.timeout(2500)});if(!response.ok)throw new Error('Inicie o projeto com Docker Compose para conectar aos servidores.');config=RuntimeConfigSchema.parse(await response.json());}
        if(!active)return;
        const node=config.nodes[cursor++%config.nodes.length];
        const url=new URL(`${node.path}/ws`,location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
        socket=new WebSocket(url);socketRef.current=socket;
        socket.onopen=()=>{if(active)socket?.send(JSON.stringify({protocolVersion:1,type:'HELLO',...identity,nickname:nickname.trim()}));};
        socket.onmessage=event=>{
          if(!active)return;
          let input:unknown;try{input=JSON.parse(String(event.data));}catch{setError('O servidor enviou JSON inválido.');socket?.close(1002);return;}
          const parsed=ServerMessageSchema.safeParse(input);
          if(!parsed.success){setError('O servidor enviou uma mensagem incompatível.');socket?.close(1002);return;}
          const message=parsed.data;
          if(message.type==='WELCOME'){
            failures=0;setConnection('online');setError('');accept(message.state,message.cluster);transmitPending();return;
          }
          if(message.type==='STATE'){accept(message.state,message.cluster);return;}
          if(message.type==='ACK'){
            accept(message.state,message.cluster);
            if(message.commandId===pending.current?.commandId){
              pending.current=null;savePending(null);setBusy(false);if(ackTimer.current)clearTimeout(ackTimer.current);
              if(message.result.ok){setError('');resolver.current?.resolve(message.result);}
              else {setError(message.result.message);resolver.current?.reject(new GameClientError(message.result.code,message.result.message));}
              resolver.current=null;
            }return;
          }
          setError(message.message);
          if(message.retryable){setConnection('recovering');socket?.close(4001,'Recovering');return;}
          if(message.commandId===pending.current?.commandId){pending.current=null;savePending(null);setBusy(false);resolver.current?.reject(new GameClientError(message.code,message.message));resolver.current=null;}
        };
        socket.onerror=()=>{};
        socket.onclose=event=>{
          if(!active)return;
          if(event.code===1008){terminal=true;setConnection('offline');setError('Sessão inválida. Abra uma janela anônima para iniciar outra sessão.');return;}
          setConnection('recovering');schedule();
        };
      }catch(reason){if(active){setError(reason instanceof Error?reason.message:'Servidores indisponíveis.');setConnection('offline');schedule();}}
    };
    void connect();
    return ()=>{active=false;if(timer)clearTimeout(timer);if(ackTimer.current)clearTimeout(ackTimer.current);socket?.close();socketRef.current=null;};
  },[nickname,identity,restart,accept,transmitPending]);

  const command=useCallback((name:ClientCommand['name'],payload:ClientCommand['payload']={kind:'EMPTY'}):Promise<CommandResult>=>{
    if(pending.current)return Promise.reject(new GameClientError('PENDING_COMMAND','Aguardando confirmação da ação anterior.'));
    if(socketRef.current?.readyState!==WebSocket.OPEN||connection!=='online')return Promise.reject(new GameClientError('OFFLINE','Aguardando conexão com um servidor disponível.'));
    const preSession=name==='CREATE_ROOM'||name==='JOIN_ROOM';
    const message=CommandSchema.parse({protocolVersion:1,type:'COMMAND',commandId:crypto.randomUUID(),name,roomId:preSession?null:stateRef.current.room?.id??null,expectedVersion:preSession?null:stateRef.current.version,payload});
    pending.current=message;savePending(message);setBusy(true);setError('');
    const promise=new Promise<CommandResult>((resolve,reject)=>{resolver.current={resolve,reject};});transmitPending();return promise;
  },[connection,transmitPending]);
  return {state,connection,cluster,error,busy,command,clearError:()=>setError(''),reconnect:()=>setRestart(value=>value+1)};
}
