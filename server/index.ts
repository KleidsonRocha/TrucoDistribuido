import {createServer,type IncomingMessage} from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
import {ClientMessageSchema,type ServerMessage} from '../shared/protocol.ts';
import {AuthSchema,type Auth} from './state.ts';
import {secretHash} from './storage.ts';
import {config} from './config.ts';
import {Cluster,ClusterError,RpcSchema} from './cluster.ts';

const settings=config();const cluster=new Cluster(settings);
const clients=new Map<WebSocket,Auth>();
const responsive=new WeakSet<WebSocket>();
const send=(socket:WebSocket,message:ServerMessage)=>{if(socket.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));};
async function body(request:IncomingMessage){
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>8*1024*1024)throw new Error('Mensagem interna excede 8 MiB.');chunks.push(Buffer.from(chunk));}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
const server=createServer(async(request,response)=>{
  const path=new URL(request.url??'/',`http://${request.headers.host}`).pathname;
  response.setHeader('content-type','application/json; charset=utf-8');response.setHeader('cache-control','no-store');
  try{
    if(request.method==='GET'&&path==='/health'){response.end(JSON.stringify({...cluster.info,role:cluster.role}));return;}
    if(request.method==='GET'&&path==='/status'){response.end(JSON.stringify(cluster.status()));return;}
    if(request.method==='POST'&&path==='/internal/rpc'){
      if(request.headers['x-cluster-token']!==settings.token){response.writeHead(403);response.end(JSON.stringify({error:'forbidden'}));return;}
      const message=RpcSchema.parse(await body(request));response.end(JSON.stringify(await cluster.receive(message)));return;
    }
    response.writeHead(404);response.end(JSON.stringify({error:'not-found'}));
  }catch(error){response.writeHead(400);response.end(JSON.stringify({error:error instanceof Error?error.message:'Invalid request'}));}
});
const sockets=new WebSocketServer({noServer:true,maxPayload:16*1024,perMessageDeflate:false});
server.on('upgrade',(request,socket,head)=>{
  if(request.url!=='/ws'){socket.destroy();return;}
  const origin=request.headers.origin;
  if(origin){try{if(new URL(origin).host!==request.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}}
  sockets.handleUpgrade(request,socket,head,ws=>sockets.emit('connection',ws,request));
});
function drop(socket:WebSocket){
  const auth=clients.get(socket);clients.delete(socket);
  if(auth&&![...clients.values()].some(other=>other.key===auth.key))cluster.presence.delete(auth.key);
}
sockets.on('connection',socket=>{
  responsive.add(socket);socket.on('pong',()=>responsive.add(socket));
  let processing:Promise<unknown>=Promise.resolve();
  const helloTimeout=setTimeout(()=>{if(!clients.has(socket))socket.close(1008,'HELLO required');},5000);
  socket.on('message',raw=>{
    processing=processing.then(async()=>{
      let input:unknown;try{input=JSON.parse(raw.toString());}catch{send(socket,{type:'ERROR',protocolVersion:1,code:'INVALID_MESSAGE',message:'JSON inválido.',retryable:false,commandId:null});return;}
      const parsed=ClientMessageSchema.safeParse(input);
      if(!parsed.success){send(socket,{type:'ERROR',protocolVersion:1,code:'INVALID_MESSAGE',message:'Mensagem fora do protocolo.',retryable:false,commandId:typeof input==='object'&&input!==null&&'commandId' in input&&typeof input.commandId==='string'?input.commandId:null});return;}
      const message=parsed.data;
      if(message.type==='HELLO'){
        if(clients.has(socket)){socket.close(1008,'HELLO already received');return;}
        if(!cluster.ready){send(socket,{type:'ERROR',protocolVersion:1,code:'NO_WRITABLE_LEADER',message:'Aguardando os servidores ficarem prontos.',retryable:true,commandId:null});socket.close(1013,'Cluster recovering');return;}
        const auth=AuthSchema.parse({key:secretHash(message.resumeSecret),clientId:message.clientId,nickname:message.nickname});
        const known=cluster.store.state.identities[auth.key];
        if(known&&known.id!==auth.clientId){socket.close(1008,'Invalid session');return;}
        for(const [other,identity] of clients)if(other!==socket&&identity.key===auth.key){drop(other);other.close(1000,'Session resumed elsewhere');}
        clients.set(socket,auth);cluster.presence.add(auth.key);clearTimeout(helloTimeout);
        send(socket,{type:'WELCOME',protocolVersion:1,state:cluster.view(auth.key),cluster:cluster.info});return;
      }
      const auth=clients.get(socket);
      if(!auth){send(socket,{type:'ERROR',protocolVersion:1,code:'NO_SESSION',message:'Identifique a sessão primeiro.',retryable:false,commandId:message.commandId});return;}
      try{
        const receipt=await cluster.submit(auth,message);
        send(socket,{type:'ACK',protocolVersion:1,commandId:message.commandId,...receipt,cluster:cluster.info});
      }catch(error){
        const code=error instanceof ClusterError?error.code:'RETRY_LATER';
        const retryable=!['COMMAND_ID_REUSED','CAPACITY'].includes(code);
        send(socket,{type:'ERROR',protocolVersion:1,code,message:error instanceof Error?error.message:'Operação temporariamente indisponível.',retryable,commandId:message.commandId});
        if(retryable)socket.close(1013,'Retry same command on available node');
      }
    }).catch(()=>socket.close(1011,'Connection failed'));
  });
  socket.on('close',()=>{clearTimeout(helloTimeout);drop(socket);});socket.on('error',()=>drop(socket));
});
cluster.onChange=()=>{
  for(const [socket,auth] of clients){
    if(!cluster.ready){send(socket,{type:'ERROR',protocolVersion:1,code:'NO_WRITABLE_LEADER',message:'Eleição em andamento. Reconectando com a partida preservada.',retryable:true,commandId:null});socket.close(1013,'Cluster election');continue;}
    send(socket,{type:'STATE',protocolVersion:1,state:cluster.view(auth.key),cluster:cluster.info});
  }
};
const ping=setInterval(()=>{for(const socket of sockets.clients){if(!responsive.has(socket)){socket.terminate();continue;}if(socket.readyState===WebSocket.OPEN){responsive.delete(socket);socket.ping();}}},15_000);ping.unref();
server.listen(settings.port,'0.0.0.0',()=>{console.log(JSON.stringify({event:'listening',node:settings.id,port:settings.port}));cluster.start();});
function stop(){cluster.stop();clearInterval(ping);for(const socket of sockets.clients)socket.terminate();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref();}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
