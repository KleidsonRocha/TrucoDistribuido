import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {request as httpRequest,type IncomingMessage,type ServerResponse} from 'node:http';
import {z} from 'zod';
import {NodeStatusSchema} from '../shared/protocol.ts';
import type {DemoState} from '../shared/demo.ts';

const nodeId=z.number().int().min(1).max(3);
const cookieName='neuro_demo';
const sessionMs=20*60_000;
export class DemoError extends Error {
  status:number;
  constructor(status:number,message:string){super(message);this.status=status;}
}
type DockerSummary={Id:string;Labels:Record<string,string>};
type DockerInspection={Id:string;Config:{Labels:Record<string,string>};State:{Running:boolean;Paused:boolean;Restarting:boolean}};
type DockerCall=(method:'GET'|'POST',path:string)=>Promise<unknown>;
type Audit=(event:Record<string,unknown>)=>void;
export async function readDemoBody(request:IncomingMessage):Promise<unknown>{
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of request){size+=chunk.length;if(size>2048)throw new DemoError(413,'Mensagem muito grande.');chunks.push(Buffer.from(chunk));}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new DemoError(400,'JSON inválido.');}
}
// The socket exists only in the optional controller, never in the public gateway or game nodes.
export function dockerSocket(socketPath:string):DockerCall {
  return (method,path)=>new Promise((resolve,reject)=>{
    const request=httpRequest({socketPath,path,method,timeout:6000},response=>{
      let size=0;const chunks:Buffer[]=[];
      response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>1024*1024){response.destroy(new Error('Docker response too large'));return;}chunks.push(chunk);});
      response.on('error',reject);
      response.on('end',()=>{
        if(![200,204,304].includes(response.statusCode??0)){reject(new DemoError(502,'O Docker não conseguiu executar a operação.'));return;}
        try{resolve(chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):null);}catch{reject(new DemoError(502,'Resposta inválida do Docker.'));}
      });
    });
    request.on('timeout',()=>request.destroy(new DemoError(504,'O Docker demorou para responder.')));
    request.on('error',reject);request.end();
  });
}
const summarySchema=z.array(z.object({Id:z.string().regex(/^[a-f0-9]{64}$/),Labels:z.record(z.string(),z.string())}));
const inspectionSchema=z.object({Id:z.string().regex(/^[a-f0-9]{64}$/),Config:z.object({Labels:z.record(z.string(),z.string())}),State:z.object({Running:z.boolean(),Paused:z.boolean(),Restarting:z.boolean()})});

export class DemoControl {
  private docker:DockerCall;private project:string;private status:(id:number)=>Promise<unknown>;private audit:Audit;
  private busy=false;
  constructor(options:{docker:DockerCall;project:string;status:(id:number)=>Promise<unknown>;audit?:Audit}){
    this.docker=options.docker;this.project=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,62}$/).parse(options.project);this.status=options.status;
    this.audit=options.audit??(event=>console.log(JSON.stringify(event)));
  }
  private matches(labels:Record<string,string>,id:number){return labels['com.docker.compose.project']===this.project&&labels['com.docker.compose.service']===`game-${id}`&&labels['com.docker.compose.oneoff']?.toLowerCase()!=='true';}
  private async containers(){
    const filters=encodeURIComponent(JSON.stringify({label:[`com.docker.compose.project=${this.project}`]}));
    const summaries:DockerSummary[]=summarySchema.parse(await this.docker('GET',`/containers/json?all=1&filters=${filters}`));
    return Promise.all([1,2,3].map(async id=>{
      const matches=summaries.filter(container=>this.matches(container.Labels,id));
      if(matches.length!==1)throw new DemoError(409,`Esperado um único container game-${id} do projeto ${this.project}.`);
      const container:DockerInspection=inspectionSchema.parse(await this.docker('GET',`/containers/${matches[0].Id}/json`));
      if(container.Id!==matches[0].Id||!this.matches(container.Config.Labels,id))throw new DemoError(409,'Identidade do container não confere.');
      return {id,container};
    }));
  }
  async state():Promise<DemoState>{
    return {busy:this.busy,nodes:(await this.containers()).map(({id,container})=>({id,running:container.State.Running,paused:container.State.Paused||container.State.Restarting}))};
  }
  async action(id:number,action:'start'|'stop'){
    nodeId.parse(id);
    if(action!=='start'&&action!=='stop')throw new DemoError(400,'Ação inválida.');
    if(this.busy)throw new DemoError(409,'Aguarde a operação atual terminar.');
    this.busy=true;
    try{
      const containers=await this.containers();const target=containers.find(node=>node.id===id)!;
      if(action==='stop'){
        if(containers.some(node=>!node.container.State.Running||node.container.State.Paused||node.container.State.Restarting))throw new DemoError(409,'Religue o nó indisponível antes de parar outro.');
        const samples=await Promise.all(containers.map(async node=>NodeStatusSchema.parse(await this.status(node.id))));
        const reference=samples[0];
        if(samples.some((sample,index)=>sample.nodeId!==containers[index].id||!sample.ready||sample.members.length!==3||sample.epoch.counter!==reference.epoch.counter||sample.epoch.leaderId!==reference.epoch.leaderId||sample.hash!==reference.hash||sample.version!==reference.version||sample.visibleVersion!==sample.version)||samples.filter(sample=>sample.role==='LEADER').length!==1)throw new DemoError(409,'Aguarde os três nós prontos, com a mesma época, versão e hash.');
      }
      if(action==='start'&&(target.container.State.Paused||target.container.State.Restarting))throw new DemoError(409,'O container está pausado ou reiniciando; confira o terminal da VPS.');
      // No shell, exec, arbitrary container names, removal, or volume operations.
      await this.docker('POST',`/containers/${target.container.Id}/${action}${action==='stop'?'?t=2':''}`);
      this.audit({event:'DEMO_CONTAINER_ACTION',node:id,action,at:new Date().toISOString()});
      return {message:action==='stop'?`Container do nó ${id} parado. Aguarde a eleição e a reconexão dos jogadores.`:`Container do nó ${id} iniciado. Aguarde a sincronização antes de outra falha.`};
    }finally{this.busy=false;}
  }
}

type Session={csrf:string;expires:number};
const hash=(value:string)=>createHash('sha256').update(value).digest();
export function createDemoHandler(options:{password:string;control:DemoControl;now?:()=>number}){
  const passwordHash=hash(z.string().min(8).max(128).parse(options.password));
  const sessions=new Map<string,Session>();const now=options.now??Date.now;
  let attempts:number[]=[];
  function session(request:IncomingMessage){
    const token=request.headers.cookie?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
    for(const [key,value] of sessions)if(value.expires<=now())sessions.delete(key);
    return token?{token,value:sessions.get(token)}:null;
  }
  return async(request:IncomingMessage,response:ServerResponse)=>{
    response.setHeader('content-type','application/json; charset=utf-8');response.setHeader('cache-control','no-store');response.setHeader('x-content-type-options','nosniff');
    const send=(status:number,value:unknown)=>{response.writeHead(status);response.end(JSON.stringify(value));};
    try{
      const path=new URL(request.url??'/',`http://${request.headers.host}`).pathname;
      const current=session(request);
      const secure=request.headers['x-forwarded-proto']==='https';
      const cookie=(value:string,maxAge:number)=>`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/api/demo; Max-Age=${maxAge}${secure?'; Secure':''}`;
      if(request.method==='GET'&&path==='/api/demo/session'){
        send(200,{enabled:true,authenticated:!!current?.value,csrfToken:current?.value?.csrf??null});return;
      }
      if(request.method!=='GET'){
        // Browser mutations must come from the same origin. The gateway overwrites forwarded host/proto.
        const host=request.headers['x-forwarded-host']??request.headers.host;
        const expected=`${secure?'https':'http'}://${host}`;
        if(request.headers.origin!==expected)throw new DemoError(403,'Origem da requisição não permitida.');
      }
      if(request.method==='POST'&&path==='/api/demo/session'){
        attempts=attempts.filter(at=>now()-at<60_000);
        if(attempts.length>=8)throw new DemoError(429,'Muitas tentativas. Aguarde um minuto.');
        attempts.push(now());
        const input=z.strictObject({password:z.string().max(128)}).parse(await readDemoBody(request));
        if(!timingSafeEqual(passwordHash,hash(input.password)))throw new DemoError(401,'Senha incorreta.');
        if(current)sessions.delete(current.token);
        if(sessions.size>=10)sessions.delete(sessions.keys().next().value!);
        const token=randomBytes(32).toString('hex');const value={csrf:randomBytes(24).toString('hex'),expires:now()+sessionMs};sessions.set(token,value);
        response.setHeader('set-cookie',cookie(token,sessionMs/1000));send(200,{enabled:true,authenticated:true,csrfToken:value.csrf});return;
      }
      if(!current?.value)throw new DemoError(401,'Desbloqueie os controles com a senha de demonstração.');
      if(request.method==='GET'&&path==='/api/demo/state'){send(200,await options.control.state());return;}
      if(request.headers['x-demo-csrf']!==current.value.csrf)throw new DemoError(403,'Sessão inválida. Desbloqueie novamente.');
      if(request.method==='DELETE'&&path==='/api/demo/session'){
        sessions.delete(current.token);response.setHeader('set-cookie',cookie('',0));send(200,{enabled:true,authenticated:false,csrfToken:null});return;
      }
      const match=path.match(/^\/api\/demo\/nodes\/([1-3])\/(start|stop)$/);
      if(request.method==='POST'&&match){send(200,await options.control.action(Number(match[1]),match[2] as 'start'|'stop'));return;}
      throw new DemoError(404,'Controle não encontrado.');
    }catch(error){
      const status=error instanceof DemoError?error.status:error instanceof z.ZodError?400:502;
      send(status,{error:error instanceof DemoError?error.message:status===400?'Requisição inválida.':'Controlador indisponível. Confira os logs da demonstração.'});
    }
  };
}
