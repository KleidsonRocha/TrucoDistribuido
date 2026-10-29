import {Resolver} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request} from 'node:http';

// Consultas DNS assíncronas e limitadas: um serviço removido do Compose não
// ocupa os workers getaddrinfo necessários para abrir conexões com sobreviventes.
const resolver=new Resolver({timeout:500,tries:1});
const cache=new Map<string,{until:number;address:Promise<string>}>();
export async function resolveNodeAddress(hostname:string):Promise<string>{
  if(isIP(hostname))return hostname;
  const old=cache.get(hostname);if(old&&old.until>Date.now())return old.address;
  const entry={until:Date.now()+3000,address:resolver.resolve4(hostname).then(values=>{if(!values.length)throw new Error('DNS sem endereço IPv4.');return values[0];})};
  cache.set(hostname,entry);entry.address.catch(()=>{entry.until=Math.min(entry.until,Date.now()+500);});return entry.address;
}
export async function postJson(url:string,token:string,body:unknown,timeoutMs:number):Promise<unknown>{
  const target=new URL(url);if(target.protocol!=='http:')throw new Error('RPC interno requer URL HTTP.');
  const signal=AbortSignal.timeout(timeoutMs);const ip=await resolveNodeAddress(target.hostname);signal.throwIfAborted();
  const encoded=JSON.stringify(body);
  return new Promise((resolve,reject)=>{
    const req=request({hostname:ip,port:target.port||80,path:target.pathname,method:'POST',signal,headers:{host:target.host,'content-type':'application/json','content-length':Buffer.byteLength(encoded),'x-cluster-token':token}},res=>{
      const chunks:Buffer[]=[];let size=0;
      res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>8*1024*1024){res.destroy(new Error('Resposta RPC excede 8 MiB.'));return;}chunks.push(chunk);});
      res.on('error',reject);res.on('end',()=>{try{if(res.statusCode!==200)throw new Error(`RPC HTTP ${res.statusCode}`);resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(error){reject(error);}});
    });req.on('error',error=>{cache.delete(target.hostname);reject(error);});req.end(encoded);
  });
}
