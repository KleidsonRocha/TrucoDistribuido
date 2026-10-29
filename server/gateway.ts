import {createServer,request as httpRequest} from 'node:http';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {resolve,sep,extname} from 'node:path';
import {resolveNodeAddress} from './transport.ts';
import {Peers} from './config.ts';

const nodes=Peers.parse(JSON.parse(process.env.GATEWAY_NODES_JSON??'[]'));
const port=Number(process.env.PORT??8080);const root=resolve(process.env.STATIC_DIR??'dist');
const config={phase:2,nodes:nodes.map(node=>({id:node.id,path:`/nodes/${node.id}`}))};
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.md':'text/plain; charset=utf-8','.jpg':'image/jpeg'};
function target(path:string){const match=path.match(/^\/nodes\/([1-3])\/(health|status|ws)$/);return match?{node:nodes.find(node=>node.id===Number(match[1]))!,route:`/${match[2]}`}:null;}
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url??'/',`http://${req.headers.host}`).pathname;
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    if(path==='/runtime-config.json'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(config));return;}
    if(path==='/health'){res.writeHead(200,{'content-type':'application/json'});res.end('{"gateway":true}');return;}
    const upstream=target(path);
    if(upstream&&upstream.route!=='/ws'){
      const url=new URL(upstream.node.url);url.hostname=await resolveNodeAddress(url.hostname);url.pathname=upstream.route;
      const response=await fetch(url,{signal:AbortSignal.timeout(2000)});
      res.writeHead(response.status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(await response.text());return;
    }
    if(path.startsWith('/nodes/')||path.startsWith('/internal/')){res.writeHead(404);res.end();return;}
    const decoded=decodeURIComponent(path);const file=resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
    if(!file.startsWith(root+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream','cache-control':extname(file)==='.html'?'no-store':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'public, max-age=300'});
    if(req.method==='HEAD'){res.end();return;}createReadStream(file).pipe(res);
  }catch{res.writeHead(502,{'content-type':'application/json','cache-control':'no-store'});res.end('{"error":"Node unavailable"}');}
});
server.on('upgrade',async(req,socket,head)=>{
  try{
  const upstream=target(new URL(req.url??'/',`http://${req.headers.host}`).pathname);
  if(!upstream||upstream.route!=='/ws'){socket.destroy();return;}
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){socket.destroy();return;}}catch{socket.destroy();return;}}
  const url=new URL(upstream.node.url);
  const proxy=httpRequest({hostname:await resolveNodeAddress(url.hostname),port:url.port,path:'/ws',headers:req.headers,method:'GET'});
  proxy.setTimeout(5000,()=>proxy.destroy());
  proxy.on('upgrade',(response,connection,upstreamHead)=>{
    connection.setTimeout(0);
    let headers='HTTP/1.1 101 Switching Protocols\r\n';
    for(let i=0;i<response.rawHeaders.length;i+=2)headers+=`${response.rawHeaders[i]}: ${response.rawHeaders[i+1]}\r\n`;
    socket.write(headers+'\r\n');if(head.length)connection.write(head);if(upstreamHead.length)socket.write(upstreamHead);
    socket.pipe(connection).pipe(socket);socket.on('error',()=>connection.destroy());connection.on('error',()=>socket.destroy());
    socket.on('close',()=>connection.destroy());connection.on('close',()=>socket.destroy());
  });
  proxy.on('response',()=>{socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');});
  proxy.on('error',()=>socket.destroy());socket.on('error',()=>proxy.destroy());proxy.end();
  }catch{socket.destroy();}
});
server.listen(port,'0.0.0.0',()=>console.log(`Neuro disponível na porta ${port}`));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
