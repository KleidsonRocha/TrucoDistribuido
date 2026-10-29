import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const run=promisify(execFile);const token=randomBytes(32).toString('hex');
const args=['compose','-f','compose.yaml','-f','compose.production.yaml','config','--format','json'];
const merged=JSON.parse((await run('docker',args,{env:{...process.env,APP_PORT:'8088',CLUSTER_TOKEN:token,ENABLE_TEST_FAULTS:'1'}})).stdout);
for(const id of [1,2,3]){const service=merged.services[`game-${id}`];assert.equal(service.restart,'unless-stopped');assert.equal(service.environment.ENABLE_TEST_FAULTS,'0');assert.equal(service.environment.CLUSTER_TOKEN,token);assert.ok(!service.ports?.length);assert.equal(service.volumes[0].source,`node-${id}`);}
assert.equal(merged.services.frontend.restart,'unless-stopped');const port=merged.services.frontend.ports[0];assert.equal(port.host_ip,'127.0.0.1');assert.equal(String(port.published),'8088');assert.equal(port.target,8080);assert.ok(merged.services.frontend.healthcheck);assert.equal(Object.keys(merged.services).length,4);
await mkdir('.qa',{recursive:true});await writeFile('.qa/phase3-compose.json',JSON.stringify({passed:true,at:new Date().toISOString(),checks:['four isolated Neuro services','no published game-node ports','gateway bound to 127.0.0.1:8088','independent durable node volumes','restart unless-stopped','test faults forced off','cluster token required','gateway healthcheck']},null,2));console.log('PASS: production Compose configuration; no production services were started.');
