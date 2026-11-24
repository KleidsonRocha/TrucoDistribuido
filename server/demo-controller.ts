import {createServer} from 'node:http';
import {DemoControl,createDemoHandler,dockerSocket} from './demo-control.ts';

const control=new DemoControl({
  project:process.env.DEMO_COMPOSE_PROJECT??'neuro',
  docker:dockerSocket('/var/run/docker.sock'),
  status:async id=>{
    const response=await fetch(`http://frontend:8080/nodes/${id}/status`,{signal:AbortSignal.timeout(3000)});
    if(!response.ok)throw new Error('Node unavailable');return response.json();
  },
});
const server=createServer(createDemoHandler({password:process.env.DEMO_PASSWORD??'',control}));
server.listen(8090,'0.0.0.0',()=>console.log(JSON.stringify({event:'demo-controller-ready',port:8090})));
process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1000).unref();});
