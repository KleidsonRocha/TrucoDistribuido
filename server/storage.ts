import {createHash} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,truncateSync,writeSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import {EpochSchema,ResultSchema,type Epoch} from '../shared/protocol.ts';
import {StateSchema,emptyState} from './state.ts';

export function canonical(value:unknown):string {
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
}
export const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export const secretHash=(secret:string)=>createHash('sha256').update(secret).digest('hex');
export const GENESIS=digest('neuro/genesis/v1');
export const compareEpoch=(a:Epoch,b:Epoch)=>a.counter-b.counter||a.leaderId-b.leaderId;
const Hash=z.string().regex(/^[a-f0-9]{64}$/);
export const OperationSchema=z.strictObject({index:z.number().int().positive(),epoch:EpochSchema,previousHash:Hash,hash:Hash,commandId:z.string(),commandName:z.string(),state:StateSchema,result:ResultSchema.nullable(),participants:z.array(z.number().int()).min(2).max(3)});
export type Operation=z.infer<typeof OperationSchema>;
export const DecisionSchema=z.strictObject({index:z.number().int(),hash:Hash,epoch:EpochSchema,preparedBy:z.array(z.number().int()).min(2).max(3)});
export type Decision=z.infer<typeof DecisionSchema>;
const ChainItem=z.strictObject({index:z.number().int(),hash:Hash,previousHash:Hash,epoch:EpochSchema});
export const CheckpointSchema=z.strictObject({installedEpoch:EpochSchema,members:z.array(z.number().int()),last:OperationSchema.nullable(),decision:DecisionSchema.nullable(),chain:z.array(ChainItem)});
export type Checkpoint=z.infer<typeof CheckpointSchema>;
export const emptyCheckpoint=():Checkpoint=>({installedEpoch:{counter:0,leaderId:0},members:[],last:null,decision:null,chain:[]});
export function verifyOperation(op:Operation){const {hash,...body}=op;if(digest(body)!==hash)throw new Error('Hash de operação inválido.');}
export function verifyCheckpoint(checkpoint:Checkpoint){
  let previous=GENESIS;let index=0;
  for(const item of checkpoint.chain){if(item.index!==++index||item.previousHash!==previous)throw new Error('Cadeia de replicação inválida.');previous=item.hash;}
  if(checkpoint.last){
    verifyOperation(checkpoint.last);
    if(checkpoint.last.index!==index||checkpoint.last.hash!==previous||checkpoint.decision?.hash!==previous)throw new Error('Checkpoint inconsistente.');
    verifyDecision(checkpoint.last,checkpoint.decision);
  }else if(index!==0||checkpoint.decision!==null)throw new Error('Checkpoint sem estado correspondente.');
}
function verifyDecision(op:Operation,decision:Decision){
  if(decision.hash!==op.hash||decision.index!==op.index||compareEpoch(decision.epoch,op.epoch)!==0)throw new Error('Decisão não corresponde à preparação.');
  const received=[...new Set(decision.preparedBy)].sort();
  if(canonical(received)!==canonical([...op.participants].sort()))throw new Error('Decisão sem todos os recibos de preparação.');
}

export class DurableStore {
  checkpoint:Checkpoint=emptyCheckpoint();promised:Epoch={counter:0,leaderId:0};pending:Operation|null=null;lamport=0;
  private fd:number;
  constructor(directory:string){
    mkdirSync(directory,{recursive:true});const path=join(directory,'journal.ndjson');
    if(existsSync(path)){
      const bytes=readFileSync(path);const boundary=bytes.lastIndexOf(10)+1;
      if(boundary!==bytes.length)truncateSync(path,boundary);
      const lines=bytes.subarray(0,boundary).toString('utf8').split('\n').filter(Boolean);
      for(const line of lines){
        const record=JSON.parse(line) as {kind:string;payload:unknown;lamport:number;checksum:string};
        const {checksum,...body}=record;if(digest(body)!==checksum)throw new Error('WAL corrompido: checksum inválido.');
        this.lamport=Math.max(this.lamport,record.lamport);this.apply(record.kind,record.payload);
      }
    }
    this.fd=openSync(path,'a');
  }
  get version(){return this.checkpoint.last?.index??0;}
  get hash(){return this.checkpoint.last?.hash??GENESIS;}
  get state(){return this.checkpoint.last?.state??emptyState();}
  private append(kind:string,payload:unknown,lamport=this.lamport){
    const body={kind,payload,lamport};const bytes=Buffer.from(JSON.stringify({...body,checksum:digest(body)})+'\n');
    let offset=0;while(offset<bytes.length)offset+=writeSync(this.fd,bytes,offset,bytes.length-offset);
    fsyncSync(this.fd);this.lamport=Math.max(this.lamport,lamport);this.apply(kind,payload);
  }
  private apply(kind:string,payload:unknown){
    if(kind==='CLOCK')return;
    if(kind==='PROMISE'){this.promised=EpochSchema.parse(payload);return;}
    if(kind==='INSTALL'||kind==='SYNC'){
      const checkpoint=CheckpointSchema.parse(payload);verifyCheckpoint(checkpoint);
      this.checkpoint=checkpoint;this.pending=null;
      if(compareEpoch(checkpoint.installedEpoch,this.promised)>0)this.promised=checkpoint.installedEpoch;return;
    }
    if(kind==='PREPARE'){
      const op=OperationSchema.parse(payload);verifyOperation(op);
      if(op.index!==this.version+1||op.previousHash!==this.hash)throw new Error('PREPARE fora da sequência do WAL.');
      this.pending=op;return;
    }
    if(kind==='DECIDE'){
      const decision=DecisionSchema.parse(payload);
      if(this.checkpoint.decision?.hash===decision.hash)return;
      if(!this.pending)throw new Error('DECIDE sem preparação.');
      verifyDecision(this.pending,decision);
      const op=this.pending;
      this.checkpoint={...this.checkpoint,last:op,decision,chain:[...this.checkpoint.chain,{index:op.index,hash:op.hash,previousHash:op.previousHash,epoch:op.epoch}]};this.pending=null;return;
    }
    throw new Error(`Registro WAL desconhecido: ${kind}`);
  }
  tick(remote=0){const next=Math.max(this.lamport,remote)+1;this.append('CLOCK',null,next);return next;}
  promise(epoch:Epoch){if(compareEpoch(epoch,this.promised)<0)throw new Error('Época já superada.');this.append('PROMISE',epoch);}
  prepare(op:Operation){
    verifyOperation(op);
    if(compareEpoch(op.epoch,this.promised)!==0)throw new Error('PREPARE com época inválida.');
    if(this.pending?.hash===op.hash)return;
    if(this.pending)throw new Error('Outra operação já está preparada.');
    if(op.index!==this.version+1||op.previousHash!==this.hash)throw new Error('Índice ou hash anterior inválido.');
    this.append('PREPARE',op);
  }
  decide(decision:Decision){
    if(compareEpoch(decision.epoch,this.promised)!==0)throw new Error('DECIDE de época antiga.');
    if(this.checkpoint.decision?.hash===decision.hash)return;
    if(!this.pending)throw new Error('Operação não preparada.');verifyDecision(this.pending,decision);this.append('DECIDE',decision);
  }
  install(checkpoint:Checkpoint){verifyCheckpoint(checkpoint);if(compareEpoch(checkpoint.installedEpoch,this.promised)<0)throw new Error('Instalação de época antiga.');this.append('INSTALL',checkpoint);}
  sync(checkpoint:Checkpoint){verifyCheckpoint(checkpoint);this.append('SYNC',checkpoint);}
  close(){closeSync(this.fd);}
}

/** Apenas checkpoints da maior época instalada são autoridade após uma barreira. */
export function reconcile(checkpoints:Checkpoint[]):Checkpoint {
  for(const checkpoint of checkpoints)verifyCheckpoint(checkpoint);
  const epoch=checkpoints.map(c=>c.installedEpoch).sort(compareEpoch).at(-1)!;
  const authoritative=checkpoints.filter(c=>compareEpoch(c.installedEpoch,epoch)===0).sort((a,b)=>(b.last?.index??0)-(a.last?.index??0));
  const chosen=authoritative[0];
  for(const other of authoritative){
    for(let i=0;i<other.chain.length;i++)if(other.chain[i].hash!==chosen.chain[i]?.hash)throw new Error('Conflito entre cadeias confirmadas.');
  }
  return structuredClone(chosen);
}
