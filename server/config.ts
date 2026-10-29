import {resolve} from 'node:path';
import {z} from 'zod';
export const Peers=z.array(z.strictObject({id:z.number().int().min(1).max(3),url:z.url().refine(value=>{const url=new URL(value);return url.protocol==='http:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash;},'Use uma origem HTTP interna, sem credenciais ou caminho.')})).length(3).refine(peers=>new Set(peers.map(p=>p.id)).size===3&&new Set(peers.map(p=>new URL(p.url).origin)).size===3,'Configure três IDs e origens distintos.');
export type Config={id:number;port:number;peers:z.infer<typeof Peers>;token:string;dataDir:string;heartbeatMs:number;failureMs:number;rpcMs:number;coordinatorMs:number;graceMs:number;testFaults:boolean};
export function config(env:NodeJS.ProcessEnv=process.env):Config {
  const id=z.coerce.number().int().min(1).max(3).parse(env.NODE_ID);
  const peers=Peers.parse(JSON.parse(env.PEERS_JSON??'[]'));
  if(new Set(peers.map(p=>p.id)).size!==3||new Set(peers.map(p=>p.url)).size!==3||!peers.some(p=>p.id===id))throw new Error('PEERS_JSON precisa de três IDs e URLs distintos, incluindo o próprio nó.');
  const number=(name:string,fallback:number,min=50)=>z.coerce.number().int().min(min).parse(env[name]??fallback);
  const heartbeatMs=number('HEARTBEAT_INTERVAL_MS',1000);
  const failureMs=number('FAILURE_TIMEOUT_MS',4000);
  if(failureMs<heartbeatMs*3)throw new Error('FAILURE_TIMEOUT_MS precisa ser ao menos três intervalos de heartbeat.');
  return {id,port:number('PORT',3000,1),peers,token:z.string().min(24).parse(env.CLUSTER_TOKEN),dataDir:resolve(env.DATA_DIR??`data/node-${id}`),heartbeatMs,failureMs,rpcMs:number('RPC_TIMEOUT_MS',1200),coordinatorMs:number('COORDINATOR_TIMEOUT_MS',5000),graceMs:number('PLAYER_GRACE_MS',120_000),testFaults:env.ENABLE_TEST_FAULTS==='1'};
}
