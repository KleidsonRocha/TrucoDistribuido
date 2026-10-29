import {useEffect,useState} from 'react';
import {NodeStatusSchema,RuntimeConfigSchema,type NodeStatus} from '../../shared/protocol';
export type NodeObservation={id:number;status:NodeStatus|null;reachable:boolean;sampledAt:number|null};
export function useClusterStatus(){
  const [nodes,setNodes]=useState<NodeObservation[]>([1,2,3].map(id=>({id,status:null,reachable:false,sampledAt:null})));
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;let polling=false;let config:{id:number;path:string}[]|null=null;
    const samples=new Map<number,NodeObservation>();
    const poll=async()=>{
      if(!active||polling)return;polling=true;
      try{
        if(!config){const response=await fetch('/runtime-config.json',{cache:'no-store',signal:AbortSignal.timeout(2000)});config=RuntimeConfigSchema.parse(await response.json()).nodes;}
        await Promise.all(config.map(async node=>{
          try{const response=await fetch(`${node.path}/status`,{cache:'no-store',signal:AbortSignal.timeout(2500)});if(!response.ok)throw new Error();const status=NodeStatusSchema.parse(await response.json());samples.set(node.id,{id:node.id,status,reachable:true,sampledAt:Date.now()});}
          catch{const old=samples.get(node.id);samples.set(node.id,{id:node.id,status:old?.status??null,reachable:false,sampledAt:old?.sampledAt??null});}
        }));
        if(active){setNodes(config.map(node=>samples.get(node.id)!));setError('');}
      }catch{if(active)setError('Não foi possível consultar o cluster. Inicie o Docker Compose e confira a conexão.');}
      finally{polling=false;}
    };
    void poll();const timer=setInterval(()=>void poll(),1500);return ()=>{active=false;clearInterval(timer);};
  },[]);
  return {nodes,error};
}
