import {randomUUID,randomBytes} from 'node:crypto';
import WebSocket from 'ws';
import {ServerMessageSchema} from '../../shared/protocol.ts';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function until(fn,label,ms=25000){const end=Date.now()+ms;let last;while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(error){last=error;}await sleep(100);}throw new Error(`Timeout: ${label}${last?`: ${last.message}`:''}`);}

export class Client{
  constructor(nodes,name){this.nodes=nodes;this.name=name;this.identity={protocolVersion:1,type:'HELLO',clientId:randomUUID(),resumeSecret:randomBytes(32).toString('hex'),nickname:name};this.state=null;this.cursor=0;this.messages=[];this.socket=null;this.ready=false;}
  connect(){
    this.stopped=false;
    if(this.connecting)return this.connecting;
    this.connecting=this.open().finally(()=>{this.connecting=null;});return this.connecting;
  }
  async open(){
    if(this.socket?.readyState===WebSocket.OPEN&&this.ready)return;
    this.socket?.terminate();this.ready=false;
    await until(async()=>{
      const node=this.nodes[this.cursor++%this.nodes.length];
      try{const h=await fetch(node.url+'/health',{signal:AbortSignal.timeout(600)}).then(r=>r.json());if(!h.ready)return false;}catch{return false;}
      const socket=new WebSocket(node.url.replace('http','ws')+'/ws');this.socket=socket;
      socket.on('error',()=>{});socket.on('close',()=>{if(this.socket!==socket)return;this.ready=false;if(!this.stopped)this.retry=setTimeout(()=>{if(!this.stopped)void this.connect().catch(()=>{});},200);});
      socket.on('message',raw=>{const m=ServerMessageSchema.parse(JSON.parse(raw.toString()));this.messages.push(m);if(m.state&&(!this.state||m.state.version>=this.state.version))this.state=m.state;if(m.type==='WELCOME')this.ready=true;});
      socket.on('open',()=>socket.send(JSON.stringify(this.identity)));
      try{await until(()=>this.ready,'WELCOME',1800);return true;}catch{socket.terminate();return false;}
    },`connect ${this.name}`);
  }
  make(name,payload={kind:'EMPTY'}){const pre=['CREATE_ROOM','JOIN_ROOM'].includes(name);return {protocolVersion:1,type:'COMMAND',commandId:randomUUID(),name,payload,roomId:pre?null:this.state.room?.id??null,expectedVersion:pre?null:this.state.version};}
  async send(command){
    return until(async()=>{
      await this.connect();const cursor=this.messages.length;this.socket.send(JSON.stringify(command));
      try{return await until(()=>{const reply=this.messages.slice(cursor).find(m=>m.type==='ACK'&&m.commandId===command.commandId);if(reply)return reply;const error=this.messages.slice(cursor).find(m=>m.type==='ERROR');if(error)throw new Error(error.message);return false;},'ACK',2000);}
      catch{this.socket?.terminate();this.ready=false;return false;}
    },`command ${command.name}`,35000);
  }
  async command(name,payload={kind:'EMPTY'}){
    for(let i=0;i<10;i++){const reply=await this.send(this.make(name,payload));if(reply.result.ok)return reply;if(!['STALE_VERSION','PLAYER_OFFLINE'].includes(reply.result.code))throw new Error(JSON.stringify(reply.result));await sleep(200);}
    throw new Error('Repeated version/presence conflicts');
  }
  close(){this.stopped=true;if(this.retry)clearTimeout(this.retry);this.socket?.terminate();this.ready=false;}
}

