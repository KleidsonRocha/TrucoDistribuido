import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {request} from 'node:https';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import WebSocket from 'ws';
import {ServerMessageSchema} from '../shared/protocol.ts';
const run=promisify(execFile),domain='neuro.clayforgestudio.com.br',port=Number(process.env.NEURO_TLS_TEST_PORT??18443);
const openssl=process.env.OPENSSL_BIN??(process.platform==='win32'&&existsSync('C:/Program Files/Git/usr/bin/openssl.exe')?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
await mkdir('.qa',{recursive:true});const dir=await mkdtemp(resolve('.qa/tls-'));const name=`neuro-tls-qa-${process.pid}`;let owned=false;
const mount=(src,dst)=>['--mount',`type=bind,src=${src},dst=${dst},readonly`];
const lookup=(_host,options,callback)=>options.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4);
const production=await readFile('deploy/nginx.neuro.https.conf','utf8');
const fixture=production.replaceAll('http://127.0.0.1:8088','http://frontend:8080').replaceAll(`/etc/letsencrypt/live/${domain}/fullchain.pem`,'/etc/neuro/server.crt').replaceAll(`/etc/letsencrypt/live/${domain}/privkey.pem`,'/etc/neuro/server.key');
await writeFile(join(dir,'default.conf'),fixture);
await writeFile(join(dir,'openssl.cnf'),`[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n[dn]\nCN=${domain}\n[extensions]\nsubjectAltName=DNS:${domain}\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n`);
const checks=[];
try{
  console.log('Creating an isolated local TLS certificate; public DNS and VPS are unchanged.');
  await run(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-config',join(dir,'openssl.cnf'),'-keyout',join(dir,'server.key'),'-out',join(dir,'server.crt')]);
  const ca=await readFile(join(dir,'server.crt'));
  const id=(await run('docker',['compose','ps','-q','frontend'])).stdout.trim();if(!id)throw new Error('Start Docker Compose before the TLS test.');
  const networks=JSON.parse((await run('docker',['inspect','--format','{{json .NetworkSettings.Networks}}',id])).stdout);const network=Object.keys(networks).find(n=>n.endsWith('_neuro'));if(!network)throw new Error('Neuro network not found.');
  const configMount=mount(join(dir,'default.conf'),'/etc/nginx/conf.d/default.conf');const certMount=mount(dir,'/etc/neuro');
  await run('docker',['run','--rm','--network',network,...configMount,...certMount,'nginx:stable-alpine','nginx','-t']);checks.push('production HTTPS Nginx syntax');
  const bootstrap=(await readFile('deploy/nginx.neuro.http.conf','utf8')).replaceAll('http://127.0.0.1:8088','http://frontend:8080');await writeFile(join(dir,'bootstrap.conf'),bootstrap);
  await run('docker',['run','--rm','--network',network,...mount(join(dir,'bootstrap.conf'),'/etc/nginx/conf.d/default.conf'),'nginx:stable-alpine','nginx','-t']);checks.push('bootstrap HTTP Nginx syntax');
  await run('docker',['run','--rm','-d','--name',name,'--network',network,'-p',`127.0.0.1:${port}:443`,...configMount,...certMount,'nginx:stable-alpine']);owned=true;
  const get=path=>new Promise((resolve,reject)=>{const req=request({hostname:domain,port,path,ca,lookup,agent:false,timeout:5000},res=>{const chunks=[];const protocol=res.socket.getProtocol();assert.equal(res.socket.authorized,true);res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString('utf8'),protocol}));});req.on('timeout',()=>req.destroy(new Error('HTTPS timeout')));req.on('error',reject);req.end();});
  let home;for(let attempt=0;attempt<30;attempt++){try{home=await get('/');break;}catch(error){if(attempt===29)throw error;await new Promise(r=>setTimeout(r,100));}}
  assert.equal(home.status,200);assert.ok(home.protocol.startsWith('TLS'));const css=home.body.match(/href="([^\"]+\.css)"/)[1];assert.equal((await get(css)).status,200);assert.equal((await get('/cards/espadas_01.png')).status,200);assert.equal((await get('/internal/rpc')).status,404);checks.push('HTTPS certificate/hostname validation','HTML CSS cards over TLS','internal endpoint inaccessible');
  async function wsHello(id,origin=`https://${domain}:${port}`){return new Promise((resolve,reject)=>{
    const socket=new WebSocket(`wss://${domain}:${port}/nodes/${id}/ws`,{ca,lookup,origin,handshakeTimeout:5000});const timer=setTimeout(()=>{socket.terminate();reject(new Error('WSS WELCOME timeout'));},6000);
    socket.on('open',()=>socket.send(JSON.stringify({protocolVersion:1,type:'HELLO',clientId:randomUUID(),resumeSecret:randomBytes(32).toString('hex'),nickname:'TLS-check'})));
    socket.on('error',error=>{clearTimeout(timer);reject(error);});socket.on('message',raw=>{try{const message=ServerMessageSchema.parse(JSON.parse(raw.toString()));if(message.type==='WELCOME'){clearTimeout(timer);socket.close();resolve(message.cluster.nodeId);}else if(message.type==='ERROR'){clearTimeout(timer);socket.close();reject(new Error(message.message));}}catch(error){clearTimeout(timer);socket.terminate();reject(error);}});
  });}
  for(const id of [1,2,3])assert.equal(await wsHello(id),id);checks.push('WSS HELLO/WELCOME through Nginx for all three nodes');
  await assert.rejects(wsHello(1,'https://wrong-origin.invalid'));checks.push('mismatched Origin rejected');
  const image=(await run('docker',['image','inspect','--format','{{index .RepoDigests 0}}','nginx:stable-alpine'])).stdout.trim();
  await writeFile('.qa/phase3-tls.json',JSON.stringify({passed:true,at:new Date().toISOString(),domain,localOnly:true,certificateValidation:true,nginxImage:image,productionConfigSha256:createHash('sha256').update(production).digest('hex'),checks},null,2));
  console.log('PASS: Nginx, trusted test certificate, HTTPS, WSS on three nodes and Origin validation. Evidence: .qa/phase3-tls.json');
}finally{if(owned)await run('docker',['stop',name]).catch(()=>{});}
