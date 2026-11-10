import {createHash} from 'node:crypto';
import {closeSync,existsSync,fsyncSync,mkdirSync,openSync,readFileSync,readSync,readdirSync,renameSync,statSync,truncateSync,unlinkSync,writeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {StringDecoder} from 'node:string_decoder';
import {z} from 'zod';
import {EpochSchema,EventSchema,ResultSchema,type ClusterEvent,type Epoch} from '../shared/protocol.ts';
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

export const HISTORY_LIMIT=100;
const CLOCK_BLOCK=4096;
const StorageOptions=z.object({maxBytes:z.number().int().min(4096).max(16*1024*1024).default(65536),keepFiles:z.number().int().min(1).max(10).default(3)});
const RecoverySchema=z.strictObject({formatVersion:z.literal(1),checkpoint:CheckpointSchema,promised:EpochSchema,pending:OperationSchema.nullable(),lamport:z.number().int().nonnegative(),clockCeiling:z.number().int().nonnegative()});
type JournalRecord={format:2;kind:string;payload:unknown;lamport:number;at:string|null};

function writeAll(fd:number,bytes:Buffer){let offset=0;while(offset<bytes.length)offset+=writeSync(fd,bytes,offset,bytes.length-offset);}
function encode(body:object){return Buffer.from(JSON.stringify({...body,checksum:digest(body)})+'\n');}
function syncDirectory(directory:string){
  // Windows cannot open directory handles through fs.open; rename still replaces atomically.
  if(process.platform==='win32')return;
  const fd=openSync(directory,'r');try{fsyncSync(fd);}finally{closeSync(fd);}
}

/** Streams legacy journals too: idle CLOCK traffic may have made them very large. */
function readJournal(file:string,visit:(body:Record<string,unknown>)=>void){
  const fd=openSync(file,'r'),chunk=Buffer.alloc(64*1024),decoder=new StringDecoder('utf8');
  let carry='',boundary=0;
  try{
    let length:number;
    while((length=readSync(fd,chunk,0,chunk.length,null))>0){
      carry+=decoder.write(chunk.subarray(0,length));let end:number;
      while((end=carry.indexOf('\n'))>=0){
        const line=carry.slice(0,end);carry=carry.slice(end+1);boundary+=Buffer.byteLength(line+'\n');
        if(!line.trim())continue;
        const {checksum,...body}=JSON.parse(line) as Record<string,unknown>;
        if(digest(body)!==checksum)throw new Error('WAL corrompido: checksum inválido.');
        if(typeof body.kind!=='string'||!Number.isSafeInteger(body.lamport)||(body.lamport as number)<0)throw new Error('Registro WAL inválido.');
        visit(body);
      }
    }
  }finally{closeSync(fd);}
  if(boundary!==statSync(file).size)truncateSync(file,boundary);
}

export class DurableStore {
  checkpoint:Checkpoint=emptyCheckpoint();promised:Epoch={counter:0,leaderId:0};pending:Operation|null=null;lamport=0;
  readonly history:ClusterEvent[]=[];
  private fd:number|undefined;private bytes=0;private clockCeiling=0;
  private directory:string;private path:string;private recoveryPath:string;
  private options:z.infer<typeof StorageOptions>;
  constructor(directory:string,options:Partial<z.infer<typeof StorageOptions>>={}){
    this.options=StorageOptions.parse(options);this.directory=resolve(directory);mkdirSync(this.directory,{recursive:true});
    this.path=join(this.directory,'journal.ndjson');this.recoveryPath=join(this.directory,'recovery.json');
    const recovered=existsSync(this.recoveryPath);
    if(recovered){
      const {checksum,...body}=JSON.parse(readFileSync(this.recoveryPath,'utf8'));
      if(digest(body)!==checksum)throw new Error('Checkpoint corrompido: checksum inválido.');
      const saved=RecoverySchema.parse(body);verifyCheckpoint(saved.checkpoint);
      if(compareEpoch(saved.promised,saved.checkpoint.installedEpoch)<0)throw new Error('Promessa anterior ao checkpoint.');
      if(saved.pending){verifyOperation(saved.pending);if(saved.pending.index!==(saved.checkpoint.last?.index??0)+1||saved.pending.previousHash!==(saved.checkpoint.last?.hash??GENESIS))throw new Error('Preparação incompatível com checkpoint.');}
      this.checkpoint=saved.checkpoint;this.promised=saved.promised;this.pending=saved.pending;this.lamport=saved.lamport;this.clockCeiling=saved.clockCeiling;
    }
    let rewrite=false;const retained:JournalRecord[]=[];let retainedBytes=0;
    for(const file of this.journals()){
      if(statSync(file).size>this.options.maxBytes)rewrite=true;
      readJournal(file,body=>{
        const kind=body.kind as string,lamport=body.lamport as number;
        if(body.format!==2){
          rewrite=true;
          if(!recovered){this.lamport=Math.max(this.lamport,lamport);this.apply(kind,body.payload);}
          if(kind==='CLOCK')return;
        }else if(!recovered)throw new Error('Checkpoint de recuperação ausente; o histórico não substitui o estado.');
        const record:JournalRecord={format:2,kind,payload:body.format===2?body.payload:this.summary(kind,body.payload),lamport,at:typeof body.at==='string'?body.at:null};
        if(kind==='EVENT')this.remember(EventSchema.parse(record.payload));
        retained.push(record);retainedBytes+=encode(record).length;
        while(retainedBytes>this.options.maxBytes*this.options.keepFiles&&retained.length)retainedBytes-=encode(retained.shift()!).length;
      });
    }
    this.lamport=Math.max(this.lamport,this.clockCeiling);this.clockCeiling=Math.max(this.clockCeiling,this.lamport);
    // Commit the migrated state BEFORE replacing any legacy history.
    if(!recovered)this.saveRecovery();
    if(rewrite){for(const file of this.journals())unlinkSync(file);}
    else for(const file of this.archives())if(file.number>=this.options.keepFiles)unlinkSync(file.path);
    this.fd=openSync(this.path,'a');this.bytes=statSync(this.path).size;
    if(rewrite)for(const record of retained)this.writeRecord(record);
  }
  get version(){return this.checkpoint.last?.index??0;}
  get hash(){return this.checkpoint.last?.hash??GENESIS;}
  get state(){return this.checkpoint.last?.state??emptyState();}
  private append(kind:string,payload:unknown,lamport=this.lamport){
    const before={checkpoint:this.checkpoint,promised:this.promised,pending:this.pending};
    this.apply(kind,payload);
    try{this.saveRecovery();}catch(error){Object.assign(this,before);throw error;}
    this.writeRecord({format:2,kind,payload:this.summary(kind,payload),lamport,at:new Date().toISOString()});
  }
  private archives(){return readdirSync(this.directory).flatMap(name=>{const match=/^journal\.([1-9]\d*)\.ndjson$/.exec(name);return match?[{number:Number(match[1]),path:join(this.directory,name)}]:[];}).sort((a,b)=>b.number-a.number);}
  private journals(){return [...this.archives().map(file=>file.path),...(existsSync(this.path)?[this.path]:[])];}
  private saveRecovery(){
    const body={formatVersion:1,checkpoint:this.checkpoint,promised:this.promised,pending:this.pending,lamport:this.lamport,clockCeiling:this.clockCeiling};
    const next=this.recoveryPath+'.next',fd=openSync(next,'w');
    try{writeAll(fd,encode(body));fsyncSync(fd);}finally{closeSync(fd);}
    renameSync(next,this.recoveryPath);syncDirectory(this.directory);
  }
  private writeRecord(record:JournalRecord){
    const bytes=encode(record);
    if(bytes.length>this.options.maxBytes)throw new Error('Registro de histórico excede o limite do journal.');
    if(this.fd===undefined)throw new Error('Journal fechado.');
    if(this.bytes+bytes.length>this.options.maxBytes){
      closeSync(this.fd);this.fd=undefined;
      try{
        const last=join(this.directory,`journal.${this.options.keepFiles-1}.ndjson`);
        if(this.options.keepFiles>1){
          if(existsSync(last))unlinkSync(last);
          for(let i=this.options.keepFiles-2;i>=1;i--){const file=join(this.directory,`journal.${i}.ndjson`);if(existsSync(file))renameSync(file,join(this.directory,`journal.${i+1}.ndjson`));}
          renameSync(this.path,join(this.directory,'journal.1.ndjson'));
        }else truncateSync(this.path,0);
        syncDirectory(this.directory);
      }finally{this.fd=openSync(this.path,'a');this.bytes=statSync(this.path).size;}
    }
    writeAll(this.fd,bytes);fsyncSync(this.fd);this.bytes+=bytes.length;
  }
  private summary(kind:string,payload:unknown):unknown{
    if(kind==='PREPARE'){
      const op=OperationSchema.parse(payload);return {index:op.index,hash:op.hash,epoch:op.epoch,commandId:op.commandId.slice(0,160),commandName:op.commandName.slice(0,80),participants:op.participants,result:op.result};
    }
    if(kind==='INSTALL'||kind==='SYNC'){const cp=CheckpointSchema.parse(payload);return {epoch:cp.installedEpoch,members:cp.members,index:cp.last?.index??0,hash:cp.last?.hash??GENESIS};}
    return payload;
  }
  private remember(event:ClusterEvent){
    const previous=this.history.findIndex(value=>value.id===event.id);if(previous>=0)this.history.splice(previous,1);
    this.history.push(event);if(this.history.length>HISTORY_LIMIT)this.history.shift();
  }
  recordEvent(event:ClusterEvent){
    const safe=EventSchema.parse({...event,detail:event.detail.slice(0,512)});
    this.writeRecord({format:2,kind:'EVENT',payload:safe,lamport:safe.lamport,at:safe.at});this.remember(safe);
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
  tick(remote=0){
    const next=Math.max(this.lamport,remote)+1;
    if(!Number.isSafeInteger(next)||next<0)throw new Error('Relógio de Lamport inválido.');
    if(next>this.clockCeiling){
      const previous=this.clockCeiling;this.clockCeiling=Math.min(Number.MAX_SAFE_INTEGER,next+CLOCK_BLOCK-1);
      try{this.saveRecovery();}catch(error){this.clockCeiling=previous;throw error;}
    }
    this.lamport=next;return next;
  }
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
  close(){if(this.fd!==undefined){closeSync(this.fd);this.fd=undefined;}}
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
