import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {z} from 'zod';
import {CommandSchema,EpochSchema,Role,type ClientCommand,type ClusterEvent,type ClusterInfo,type CommandResult,type Epoch,type NodeStatus,type PublicState} from '../shared/protocol.ts';
import {AuthSchema,applyCommand,applyPresence,projectState,type Auth,type GameState} from './state.ts';
import {CheckpointSchema,DecisionSchema,DurableStore,OperationSchema,compareEpoch,digest,reconcile,type Checkpoint,type Operation} from './storage.ts';
import type {Config} from './config.ts';
import {postJson} from './transport.ts';

export const RpcSchema=z.strictObject({protocolVersion:z.literal(1),requestId:z.uuid(),from:z.number().int().min(1).max(3),to:z.number().int().min(1).max(3),lamport:z.number().int().nonnegative(),epoch:EpochSchema,type:z.string().max(40),payload:z.unknown()});
export type Rpc=z.infer<typeof RpcSchema>;
const WireSchema=z.strictObject({nodeId:z.number().int(),role:Role,ready:z.boolean(),eligible:z.boolean(),leaderId:z.number().int().nullable(),epoch:EpochSchema,promised:EpochSchema,version:z.number().int(),visibleVersion:z.number().int(),hash:z.string(),lamport:z.number().int(),members:z.array(z.number().int()),presence:z.array(z.string())});
type Wire=z.infer<typeof WireSchema>;
const SnapshotSchema=z.strictObject({wire:WireSchema,checkpoint:CheckpointSchema});
type Snapshot=z.infer<typeof SnapshotSchema>;
export type Receipt={result:CommandResult;state:PublicState};
export class ClusterError extends Error {code:string;constructor(code:string,message:string){super(message);this.code=code;}}
type Peer={lastContact:number;wire:Wire|null};

export class Cluster {
  config:Config;store:DurableStore;role:z.infer<typeof Role>='SYNCING';eligible=false;leaderId:number|null=null;
  events:ClusterEvent[]=[];presence=new Set<string>();onChange:()=>void=()=>{};
  private peers=new Map<number,Peer>();private since=performance.now();private noLeaderSince=performance.now();
  private coordinatorDeadline=0;private electionRunning=false;private tickRunning=false;private joining=false;private stopping=false;
  private serial:Promise<unknown>=Promise.resolve();private timer:ReturnType<typeof setInterval>|null=null;
  private visible:Checkpoint;private fault:string|null=null;
  constructor(config:Config){this.config=config;this.store=new DurableStore(config.dataDir);this.visible=structuredClone(this.store.checkpoint);for(const peer of config.peers)if(peer.id!==config.id)this.peers.set(peer.id,{lastContact:0,wire:null});}
  get ready(){return (this.role==='LEADER'||this.role==='FOLLOWER')&&this.leaderId!==null&&this.store.checkpoint.members.includes(this.config.id)&&this.store.checkpoint.members.length>=2&&compareEpoch(this.store.promised,this.store.checkpoint.installedEpoch)===0;}
  get info():ClusterInfo{return {nodeId:this.config.id,leaderId:this.leaderId,epoch:this.store.checkpoint.installedEpoch,lamport:this.store.lamport,ready:this.ready};}
  get publicVersion(){return this.visible.last?.index??0;}
  view(key:string){return projectState(this.visible.last?.state??{identities:{},rooms:{},dedup:{}},key,this.publicVersion);}
  private enqueue<T>(work:()=>Promise<T>|T):Promise<T>{const task=this.serial.then(work);this.serial=task.catch(()=>{});return task;}
  event(type:string,detail:string,commandId:string|null=null,stamp?:number){
    const event:ClusterEvent={id:randomUUID(),at:new Date().toISOString(),nodeId:this.config.id,lamport:stamp??this.store.tick(),type,detail,epoch:{...this.store.promised},index:this.store.version,commandId};
    this.events.push(event);if(this.events.length>500)this.events.shift();
  }
  status():NodeStatus {
    const now=performance.now();return {nodeId:this.config.id,role:this.role,ready:this.ready,eligible:this.eligible,leaderId:this.leaderId,epoch:this.store.checkpoint.installedEpoch,lamport:this.store.lamport,version:this.store.version,visibleVersion:this.publicVersion,hash:this.store.hash,members:this.store.checkpoint.members,uptimeMs:Math.round(now-this.since),peers:[...this.peers].map(([id,peer])=>({nodeId:id,reachable:peer.lastContact>0&&now-peer.lastContact<this.config.failureMs,lastContactAgeMs:peer.lastContact>0?Math.round(now-peer.lastContact):null,role:peer.wire?.role??null,version:peer.wire?.version??null,lamport:peer.wire?.lamport??null})),events:[...this.events]};
  }
  private wire():Wire{return {...this.info,nodeId:this.config.id,role:this.role,eligible:this.eligible,promised:this.store.promised,version:this.store.version,visibleVersion:this.publicVersion,hash:this.store.hash,members:this.store.checkpoint.members,presence:[...this.presence]};}
  private snapshot():Snapshot{return {wire:this.wire(),checkpoint:structuredClone(this.store.checkpoint)};}
  async rpc(id:number,type:string,payload:unknown,epoch=this.store.promised):Promise<unknown>{
    const peer=this.config.peers.find(peer=>peer.id===id);if(!peer)throw new Error('Nó desconhecido.');
    const request:Rpc={protocolVersion:1,requestId:randomUUID(),from:this.config.id,to:id,lamport:this.store.tick(),epoch,type,payload};
    this.event(`SEND_${type}`,`Mensagem para nó ${id}`,null,request.lamport);
    const reply=RpcSchema.parse(await postJson(`${peer.url}/internal/rpc`,this.config.token,request,this.config.rpcMs));
    if(reply.from!==id||reply.to!==this.config.id||reply.requestId!==request.requestId)throw new Error('Resposta RPC não corresponde à requisição.');
    const received=this.store.tick(reply.lamport);this.event(`RECEIVE_${reply.type}`,`Resposta do nó ${id}`,null,received);
    const target=this.peers.get(id);if(target)target.lastContact=performance.now();
    if(reply.type==='FAIL'){const error=z.strictObject({code:z.string(),message:z.string()}).parse(reply.payload);throw new ClusterError(error.code,error.message);}
    return reply.payload;
  }
  async receive(request:Rpc):Promise<Rpc>{
    if(request.to!==this.config.id||request.from===this.config.id)throw new Error('Destino RPC inválido.');
    const received=this.store.tick(request.lamport);this.event(`RECEIVE_${request.type}`,`Mensagem do nó ${request.from}`,null,received);
    const peer=this.peers.get(request.from);if(peer)peer.lastContact=performance.now();
    let type='REPLY';let payload:unknown;
    try{payload=await this.handle(request);}catch(error){type='FAIL';payload={code:error instanceof ClusterError?error.code:'PROTOCOL_ERROR',message:error instanceof Error?error.message:'Erro de protocolo.'};}
    const lamport=this.store.tick();this.event(`SEND_${type}`,`Resposta para nó ${request.from}`,null,lamport);
    return {protocolVersion:1,requestId:request.requestId,from:this.config.id,to:request.from,lamport,epoch:this.store.promised,type,payload};
  }
  private async handle(request:Rpc):Promise<unknown>{
    switch(request.type){
      case 'HEARTBEAT':return this.wire();
      case 'SNAPSHOT':return this.snapshot();
      case 'ELECTION':{
        const accepted=this.eligible&&request.from<this.config.id&&!this.stopping;
        if(accepted)setTimeout(()=>void this.beginElection('Bully: recebi eleição de ID menor'),0);
        this.event('ELECTION_OK',`Nó ${request.from}: ${accepted?'vou concorrer':'não estou apto'}`);return {accepted};
      }
      case 'COORDINATOR':
        if(this.eligible&&request.from<this.config.id){setTimeout(()=>void this.beginElection('Bully: candidato de menor ID'),0);throw new ClusterError('HIGHER_ID','Há um nó apto de ID maior.');}
        this.leaderId=request.from;this.coordinatorDeadline=performance.now()+this.config.coordinatorMs;
        if(this.eligible)this.role='ELECTING';this.onChange();return {accepted:true};
      case 'FREEZE':return this.enqueue(async()=>{
        if(request.epoch.leaderId!==request.from)throw new Error('Candidato inválido.');
        this.role='ELECTING';this.leaderId=request.from;this.store.promise(request.epoch);this.coordinatorDeadline=performance.now()+this.config.coordinatorMs;
        this.event('EPOCH_FENCED','Época antiga bloqueada para reconciliação');this.onChange();return this.snapshot();
      });
      case 'INSTALL':return this.enqueue(async()=>{
        const checkpoint=CheckpointSchema.parse(request.payload);
        if(request.from!==request.epoch.leaderId||compareEpoch(checkpoint.installedEpoch,request.epoch)!==0||compareEpoch(request.epoch,this.store.promised)!==0)throw new Error('Instalação fora da barreira de época.');
        this.store.install(checkpoint);this.role='SYNCED';this.eligible=true;this.leaderId=request.from;
        this.event('STATE_INSTALLED',`Estado ${this.store.version} sincronizado`);return {version:this.store.version,hash:this.store.hash};
      });
      case 'LEADER_READY':return this.enqueue(async()=>{
        if(request.from!==this.store.checkpoint.installedEpoch.leaderId||compareEpoch(request.epoch,this.store.promised)!==0||!this.store.checkpoint.members.includes(this.config.id))throw new Error('Líder não instalado.');
        this.leaderId=request.from;this.role='FOLLOWER';this.visible=structuredClone(this.store.checkpoint);
        // O último heartbeat pode ter sido coletado antes de LEADER_READY.
        // Dê tempo para a primeira amostra nova antes de iniciar outra eleição.
        this.coordinatorDeadline=performance.now()+this.config.failureMs;
        this.event('LEADER_READY',`Nó ${request.from} pode receber comandos`);this.onChange();return this.wire();
      });
      case 'SYNC_COPY':return this.enqueue(async()=>{
        if(this.ready)throw new Error('Nó pronto não pode receber cópia fora da barreira.');
        const checkpoint=CheckpointSchema.parse(request.payload);
        if(checkpoint.installedEpoch.leaderId!==request.from)throw new Error('Sincronização sem líder correspondente.');
        this.store.sync(checkpoint);this.visible=structuredClone(checkpoint);this.leaderId=request.from;this.eligible=true;this.role='SYNCED';
        this.event('SYNC_READY',`Retorno sincronizado na versão ${this.store.version}; apto a concorrer`);return this.wire();
      });
      case 'JOIN':return this.enqueue(async()=>{
        this.requireLeader();if(this.store.pending)throw new ClusterError('RETRY_LATER','Há uma operação sendo recuperada.');
        await this.rpc(request.from,'SYNC_COPY',this.store.checkpoint,this.store.checkpoint.installedEpoch);
        this.event('NODE_REJOINED',`Nó ${request.from} recebeu cópia durável`);
        setTimeout(()=>void this.beginElection('Admitir nó sincronizado na configuração'),0);return {accepted:true};
      });
      case 'PREPARE':return this.enqueue(async()=>{
        this.requireFollower(request);const op=OperationSchema.parse(request.payload);
        if(canonicalMembers(op.participants)!==canonicalMembers(this.store.checkpoint.members))throw new Error('Participantes incompatíveis.');
        this.store.prepare(op);this.event('PREPARED',`Preparação durável do índice ${op.index}`,op.commandId);this.crashAt('follower_after_prepare');return {nodeId:this.config.id,index:op.index,hash:op.hash,epoch:op.epoch};
      });
      case 'DECIDE':return this.enqueue(async()=>{
        this.requireFollower(request);const decision=DecisionSchema.parse(request.payload);this.store.decide(decision);
        this.event('APPLIED',`Decisão durável do índice ${decision.index}`);return {nodeId:this.config.id,index:decision.index,hash:decision.hash,epoch:decision.epoch};
      });
      case 'PUBLISH':{
        this.requireFollower(request);const data=z.strictObject({index:z.number(),hash:z.string()}).parse(request.payload);
        if(data.index!==this.store.version||data.hash!==this.store.hash)throw new Error('Publicação sem estado aplicado.');
        this.visible=structuredClone(this.store.checkpoint);this.event('STATE_PUBLISHED',`Versão ${data.index} liberada aos jogadores`);this.onChange();return {published:true};
      }
      case 'FORWARD':{
        this.requireLeader();const data=z.strictObject({auth:AuthSchema,command:CommandSchema}).parse(request.payload);
        return this.enqueue(()=>this.execute(data.auth,data.command));
      }
      case 'FAULT':{
        if(!this.config.testFaults)throw new Error('Injeção de falhas desabilitada.');
        this.fault=z.enum(['before_prepare','after_one_prepare','after_prepare','after_local_decide','after_one_decide','after_applied','before_ack','follower_after_prepare']).parse(request.payload);return {armed:this.fault};
      }
      default:throw new Error('Tipo RPC desconhecido.');
    }
  }
  private requireLeader(){if(!this.ready||this.role!=='LEADER'||this.leaderId!==this.config.id)throw new ClusterError('NO_WRITABLE_LEADER','Aguardando eleição e recuperação dos servidores.');}
  private requireFollower(request:Rpc){if(!this.ready||this.role!=='FOLLOWER'||request.from!==this.leaderId||compareEpoch(request.epoch,this.store.promised)!==0)throw new ClusterError('STALE_EPOCH','Esta réplica não aceita a época solicitada.');}
  private guard(epoch:Epoch){this.requireLeader();if(compareEpoch(epoch,this.store.promised)!==0)throw new ClusterError('RETRY_LATER','A época mudou durante a operação.');}
  private crashAt(stage:string){if(this.fault===stage){this.event('FAULT_INJECTED',stage);process.exit(86);}}
  async submit(auth:Auth,command:ClientCommand):Promise<Receipt>{
    if(!this.ready)throw new ClusterError('NO_WRITABLE_LEADER','O cluster está se recuperando.');
    if(this.role==='LEADER')return this.enqueue(()=>this.execute(auth,command));
    if(this.leaderId===null)throw new ClusterError('NO_WRITABLE_LEADER','Nenhum líder pronto.');
    return await this.rpc(this.leaderId,'FORWARD',{auth,command}) as Receipt;
  }
  private async execute(auth:Auth,command:ClientCommand):Promise<Receipt>{
    this.requireLeader();const key=`${auth.key}:${command.commandId}`;const commandDigest=digest(command);
    const previous=this.store.state.dedup[key];
    if(previous){
      if(previous.digest!==commandDigest)throw new ClusterError('COMMAND_ID_REUSED','Identificador já usado com outro conteúdo.');
      this.event('COMMAND_DEDUPLICATED',command.name,command.commandId);return {result:previous.result,state:this.view(auth.key)};
    }
    if(Object.keys(this.store.state.dedup).length>=10_000)throw new ClusterError('CAPACITY','Limite de 10 mil comandos deste cluster atingido.');
    const index=this.store.version+1;
    const applied=applyCommand(this.store.state,auth,command,index,Date.now());
    applied.state.dedup[key]={digest:commandDigest,result:applied.result};
    await this.commit(applied.state,command.commandId,command.name,applied.result);
    this.crashAt('before_ack');this.event('COMMAND_ACK',`${command.name}: ${applied.result.ok?'confirmado':applied.result.code}`,command.commandId);
    return {result:applied.result,state:this.view(auth.key)};
  }
  private async commit(state:GameState,commandId:string,commandName:string,result:CommandResult|null){
    this.requireLeader();const epoch={...this.store.promised};const participants=[...this.store.checkpoint.members];
    const body={index:this.store.version+1,epoch,previousHash:this.store.hash,commandId,commandName,state,result,participants};
    const op:Operation={...body,hash:digest(body)};const others=participants.filter(id=>id!==this.config.id);
    const receiptSchema=z.strictObject({nodeId:z.number(),index:z.number(),hash:z.string(),epoch:EpochSchema});
    const validate=(data:unknown,id:number)=>{const receipt=receiptSchema.parse(data);if(receipt.nodeId!==id||receipt.index!==op.index||receipt.hash!==op.hash||compareEpoch(receipt.epoch,epoch)!==0)throw new Error('Recibo de réplica incorreto.');};
    try{
      this.crashAt('before_prepare');this.store.prepare(op);this.event('PREPARED',`Líder gravou ${op.index}`,commandId);
      for(let i=0;i<others.length;i++){
        validate(await this.rpc(others[i],'PREPARE',op,epoch),others[i]);this.guard(epoch);
        if(i===0)this.crashAt('after_one_prepare');
      }
      this.crashAt('after_prepare');
      const decision={index:op.index,epoch,hash:op.hash,preparedBy:participants};
      this.store.decide(decision);this.event('DECIDED',`Decisão do índice ${op.index}`,commandId);this.crashAt('after_local_decide');
      for(let i=0;i<others.length;i++){
        validate(await this.rpc(others[i],'DECIDE',decision,epoch),others[i]);this.guard(epoch);
        if(i===0)this.crashAt('after_one_decide');
      }
      this.crashAt('after_applied');this.guard(epoch);
      this.visible=structuredClone(this.store.checkpoint);
      await Promise.allSettled(others.map(id=>this.rpc(id,'PUBLISH',{index:op.index,hash:op.hash},epoch)));
      this.guard(epoch);this.event('STATE_PUBLISHED',`Todos aplicaram ${op.index}`,commandId);this.onChange();
    }catch(error){
      if(!this.stopping){this.role='ELECTING';this.onChange();setTimeout(()=>void this.beginElection('Falha durante replicação'),0);}
      throw error instanceof ClusterError?error:new ClusterError('RETRY_LATER','A operação ficou pendente durante uma falha. A conexão tentará recuperar o mesmo comando.');
    }
  }
  start(){this.event('BOOT','Nó iniciado; precisa sincronizar antes de servir');this.timer=setInterval(()=>void this.tick(),this.config.heartbeatMs);void this.tick();}
  private async tick(){
    if(this.tickRunning||this.stopping)return;this.tickRunning=true;
    try{
      await Promise.allSettled([...this.peers.keys()].map(async id=>{const wire=WireSchema.parse(await this.rpc(id,'HEARTBEAT',{}));this.peers.set(id,{lastContact:performance.now(),wire});}));
      const now=performance.now();const alive=[...this.peers].filter(([,p])=>p.wire&&now-p.lastContact<this.config.failureMs);
      if(this.role==='LEADER'&&this.ready){
        if(this.store.checkpoint.members.some(id=>id!==this.config.id&&!alive.some(([peerId])=>peerId===id))){void this.beginElection('Heartbeat de participante ausente');return;}
        const connected=new Set(this.presence);for(const [,peer] of alive)for(const key of peer.wire!.presence)connected.add(key);
        if(!this.electionRunning)await this.enqueue(async()=>{if(!this.ready||this.role!=='LEADER')return;const next=applyPresence(this.store.state,connected,Date.now(),this.config.graceMs);if(next)await this.commit(next,randomUUID(),'PRESENCE',null);});
        return;
      }
      const leader=alive.map(([,p])=>p.wire!).filter(w=>w.ready&&w.role==='LEADER').sort((a,b)=>compareEpoch(b.epoch,a.epoch))[0];
      if(leader){
        this.noLeaderSince=now;
        if(this.ready&&this.role==='FOLLOWER'&&compareEpoch(leader.epoch,this.store.checkpoint.installedEpoch)===0){
          this.leaderId=leader.nodeId;
          if(leader.visibleVersion>=this.store.version&&this.publicVersion<this.store.version){this.visible=structuredClone(this.store.checkpoint);this.onChange();}
          return;
        }
        // Um nó que perdeu a janela inicial da eleição precisa aderir ao líder
        // instalado; permanecer ELECTING aqui o deixaria fora para sempre.
        if(this.electionRunning||((this.role==='ELECTING'||this.role==='RECOVERING')&&now<this.coordinatorDeadline))return;
        this.role='SYNCING';this.eligible=false;this.leaderId=leader.nodeId;
        if(!this.joining){this.joining=true;try{await this.rpc(leader.nodeId,'JOIN',{});}finally{this.joining=false;}}
        return;
      }
      if(this.role==='RECOVERING'||this.electionRunning)return;
      if(this.eligible){if(now>this.coordinatorDeadline)void this.beginElection('Líder ausente no heartbeat');return;}
      const bootstrapWait=this.store.version===0?Math.max(700,this.config.heartbeatMs):this.config.failureMs;
      if(alive.length>=1&&now-this.noLeaderSince>bootstrapWait){
        const snapshots=[this.snapshot()];
        for(const [id] of alive){try{snapshots.push(SnapshotSchema.parse(await this.rpc(id,'SNAPSHOT',{})));}catch{/* par transitório */}}
        if(snapshots.length>=2){const chosen=reconcile(snapshots.map(s=>s.checkpoint));this.store.sync(chosen);this.visible=structuredClone(chosen);this.eligible=true;this.role='SYNCED';this.event('BOOTSTRAP_SYNCED','Base recuperada dos pares antes da eleição');void this.beginElection('Inicialização do cluster');}
      }
    }catch(error){this.event('TICK_RETRY',error instanceof Error?error.message:'Falha de contato');}
    finally{this.tickRunning=false;this.onChange();}
  }
  async beginElection(reason:string){
    if(!this.eligible||this.electionRunning||this.stopping)return;
    this.electionRunning=true;this.role='ELECTING';this.coordinatorDeadline=performance.now()+this.config.coordinatorMs;this.event('ELECTION_STARTED',reason);this.onChange();
    try{
      const higher=await Promise.allSettled(this.config.peers.filter(peer=>peer.id>this.config.id).map(peer=>this.rpc(peer.id,'ELECTION',{reason})));
      if(higher.some(reply=>reply.status==='fulfilled'&&z.strictObject({accepted:z.boolean()}).parse(reply.value).accepted))return;
      await this.enqueue(()=>this.recoverAsLeader());
    }catch(error){this.role='ELECTING';this.coordinatorDeadline=performance.now()+this.config.heartbeatMs*2;this.event('ELECTION_RETRY',error instanceof Error?error.message:'Eleição interrompida');}
    finally{this.electionRunning=false;this.onChange();}
  }
  private async recoverAsLeader(){
    this.role='RECOVERING';this.onChange();
    const snapshots=[this.snapshot()];
    for(const peer of this.config.peers.filter(p=>p.id!==this.config.id)){
      try{const snapshot=SnapshotSchema.parse(await this.rpc(peer.id,'SNAPSHOT',{}));if(snapshot.wire.eligible)snapshots.push(snapshot);}catch{/* falha detectada pela requisição real */}
    }
    if(snapshots.length<2)throw new Error('São necessários dois nós aptos para abrir uma época.');
    if(snapshots.some(s=>s.wire.nodeId>this.config.id))throw new Error('Nó apto de ID maior deve concorrer.');
    const counter=Math.max(...snapshots.flatMap(s=>[s.wire.promised.counter,s.wire.epoch.counter]))+1;
    const epoch={counter,leaderId:this.config.id};
    const frozen:Snapshot[]=[];
    for(const snapshot of snapshots.filter(s=>s.wire.nodeId!==this.config.id)){
      try{await this.rpc(snapshot.wire.nodeId,'COORDINATOR',{},epoch);frozen.push(SnapshotSchema.parse(await this.rpc(snapshot.wire.nodeId,'FREEZE',{},epoch)));}catch(error){this.event('RECOVERY_PEER_SKIPPED',`Nó ${snapshot.wire.nodeId}: ${error instanceof Error?error.message:'sem recibo de barreira'}`);}
    }
    if(frozen.length<1)throw new Error('Barreira não obteve dois sobreviventes.');
    this.store.promise(epoch);this.leaderId=this.config.id;frozen.push(this.snapshot());
    const chosen=reconcile(frozen.map(s=>s.checkpoint));
    const members=frozen.map(s=>s.wire.nodeId).sort();
    const checkpoint:Checkpoint={...chosen,installedEpoch:epoch,members};
    for(const id of members.filter(id=>id!==this.config.id)){
      const response=z.strictObject({version:z.number(),hash:z.string()}).parse(await this.rpc(id,'INSTALL',checkpoint,epoch));
      if(response.version!==(checkpoint.last?.index??0)||response.hash!==(checkpoint.last?.hash??this.store.hash))throw new Error('Réplica divergiu durante recuperação.');
    }
    this.store.install(checkpoint);
    for(const id of members.filter(id=>id!==this.config.id))await this.rpc(id,'LEADER_READY',{},epoch);
    this.visible=structuredClone(checkpoint);this.role='LEADER';this.coordinatorDeadline=0;
    this.event('LEADER_READY',`Bully elegeu ${this.config.id}; membros ${members.join(', ')}; versão ${this.store.version}`);
    console.log(JSON.stringify({event:'leader-ready',node:this.config.id,epoch,members,version:this.store.version}));this.onChange();
  }
  stop(){this.stopping=true;this.role='STOPPING';if(this.timer)clearInterval(this.timer);}
  async close(){this.stop();await this.serial;this.store.close();}
}
function canonicalMembers(ids:number[]){return JSON.stringify([...ids].sort());}
